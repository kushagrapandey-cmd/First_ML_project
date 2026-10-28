import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {load,mutate} from '../api/workspace.js';

// Use only a disposable test database. Each run owns and removes its own schema.
test('Workspace quotas, atomic imports and retained lessons in PostgreSQL',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  const schema='ytguide_test_'+randomUUID().replaceAll('-','');
  const user={id:'fixture',name:'Fixture'};
  const lesson={id:'AAAAAAAAAAA',title:'Fixture lesson',channel:'Tests'};
  const sql=(parts,...values)=>({text:parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values});
  async function asUser(id,queries){
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query(`SET LOCAL search_path TO ${schema},public`);
      await client.query("SELECT set_config('ytguide.user_id',$1,true)",[id]);
      const results=[];for(const q of queries(sql))results.push((await client.query(q)).rows);
      await client.query('COMMIT');return results;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  const count=async()=>Number((await asUser(user.id,s=>[s`SELECT count(*) AS n FROM lesson_bookmarks WHERE user_id=${user.id}`]))[0][0].n);
  const bookmarks=n=>Array.from({length:n},(_,i)=>({id:randomUUID(),seconds:i,label:'Bookmark '+i}));
  const batch=(bs,patch={})=>({action:'import',id:randomUUID(),collections:[],lessons:[{video:lesson,saved:true,completed:false,note:'',position:0,bookmarks:bs,collections:[],...patch}]});
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);
    const client=await pool.connect();
    try{
      await client.query(`SET search_path TO ${schema},public`);
      for(const file of ['001_workspace.sql','004_bookmark_quota.sql','005_collection_quota.sql'])await client.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
      await client.query('INSERT INTO learner_profiles(user_id,display_name) VALUES($1,$2)',[user.id,user.name]);
    }finally{await client.query('RESET search_path');client.release();}
    await t.test('Repeated imports cannot exceed 100; failure rolls back the entire batch',async()=>{
      const first=batch(bookmarks(75));await mutate(user,first,asUser);
      const overflow=batch(bookmarks(75),{note:'Must roll back'});
      await assert.rejects(mutate(user,overflow,asUser),e=>e.code==='23514'&&e.constraint==='bookmark_lesson_limit');
      assert.equal(await count(),75);
      const [[notes],[imports]]=await asUser(user.id,s=>[s`SELECT count(*) AS n FROM lesson_notes`,s`SELECT count(*) AS n FROM workspace_imports`]);
      assert.equal(Number(notes.n),0);assert.equal(Number(imports.n),1);
      await mutate(user,first,asUser);assert.equal(await count(),75,'Same import ID is idempotent');
      await mutate(user,batch(first.lessons[0].bookmarks),asUser);assert.equal(await count(),75,'Duplicate bookmark IDs are harmless');
      await mutate(user,batch(bookmarks(25)),asUser);assert.equal(await count(),100);
      await mutate(user,batch(first.lessons[0].bookmarks),asUser);assert.equal(await count(),100,'Duplicates still work at the quota');
    });
    await t.test('Concurrent import and individual bookmark writes cannot share the last slot',async()=>{
      await asUser(user.id,s=>[s`DELETE FROM lesson_bookmarks WHERE id=(SELECT id FROM lesson_bookmarks LIMIT 1)`]);
      const results=await Promise.allSettled([
        mutate(user,batch(bookmarks(1)),asUser),
        mutate(user,{action:'bookmark',video:lesson,...bookmarks(1)[0]},asUser)
      ]);
      assert.equal(await count(),100);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    });
    await t.test('Concurrent creation and import cannot exceed 50 collections',async()=>{
      const quotaUser={id:'quota-user',name:'Quota'};
      await asUser(quotaUser.id,s=>[s`INSERT INTO learner_profiles(user_id,display_name) VALUES(${quotaUser.id},${quotaUser.name})`,s`INSERT INTO study_collections(user_id,id,name) SELECT ${quotaUser.id},md5(i::text)::uuid,'Collection '||i FROM generate_series(1,49) i`]);
      const results=await Promise.allSettled([
        mutate(quotaUser,{action:'createCollection',id:randomUUID(),name:'Last manual'},asUser),
        mutate(quotaUser,{action:'import',id:randomUUID(),lessons:[],collections:[{id:randomUUID(),name:'Last import'}]},asUser)
      ]);
      const [[row]]=await asUser(quotaUser.id,s=>[s`SELECT count(*) AS n FROM study_collections WHERE user_id=${quotaUser.id}`]);
      assert.equal(Number(row.n),50);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    });
    await t.test('Workspace CRUD remains isolated between two learners',async()=>{
      const other={id:'second-user',name:'Second'};
      await asUser(other.id,s=>[s`INSERT INTO learner_profiles(user_id,display_name) VALUES(${other.id},${other.name})`]);
      await mutate(user,{action:'note',video:lesson,content:'Private note',version:0},asUser);
      const updated=await mutate(user,{action:'note',video:lesson,content:'Updated note',version:1},asUser);assert.equal(updated.note.version,2);
      const conflict=await mutate(user,{action:'note',video:lesson,content:'Stale note',version:1},asUser);assert.equal(conflict.conflict,true);
      const id=randomUUID();await mutate(user,{action:'createCollection',id,name:'Private'},asUser);
      await assert.rejects(mutate(other,{action:'renameCollection',id,name:'Stolen'},asUser),e=>e.status===404);
      await mutate(other,{action:'deleteCollection',id},asUser);await mutate(user,{action:'renameCollection',id,name:'Renamed'},asUser);
      await mutate(user,{action:'membership',video:lesson,collectionId:id,add:true},asUser);
      assert.equal((await load(other,asUser)).notes.length,0);assert.equal((await load(other,asUser)).lessons.length,0);
      await mutate(user,{action:'membership',video:lesson,collectionId:id,add:false},asUser);await mutate(user,{action:'deleteCollection',id},asUser);
      const own=await load(user,asUser);assert.equal(own.collections.length,0);assert.equal(own.memberships.length,0);
    });
    await t.test('Newer history cannot hide old saved, completed, noted, bookmarked or collection lessons',async()=>{
      await asUser(user.id,s=>[
        s`INSERT INTO learner_lessons(user_id,video_id,metadata,saved,completed,updated_at)
          SELECT ${user.id},lpad(i::text,11,'0'),jsonb_build_object('id',lpad(i::text,11,'0'),'title','Old lesson','channel','Tests'),i=1,i=2,now()-interval '2 days' FROM generate_series(1,6) i`,
        s`INSERT INTO lesson_notes(user_id,video_id,content) VALUES(${user.id},'00000000003','Older note')`,
        s`INSERT INTO lesson_bookmarks(id,user_id,video_id,seconds,label) VALUES(${randomUUID()}::uuid,${user.id},'00000000004',0,'Older bookmark')`,
        s`INSERT INTO study_collections(user_id,id,name) VALUES(${user.id},${'11111111-1111-4111-8111-111111111111'}::uuid,'Old collection')`,
        s`INSERT INTO collection_lessons(user_id,collection_id,video_id) VALUES(${user.id},${'11111111-1111-4111-8111-111111111111'}::uuid,'00000000005')`,
        s`INSERT INTO learner_lessons(user_id,video_id,metadata) SELECT ${user.id},lpad(i::text,11,'0'),jsonb_build_object('id',lpad(i::text,11,'0'),'title','Recent','channel','Tests') FROM generate_series(100,1199) i`
      ]);
      const workspace=await load(user,asUser),ids=workspace.lessons.map(l=>l.video_id);
      for(let i=1;i<=5;i++)assert.ok(ids.includes(String(i).padStart(11,'0')));
      assert.ok(ids.includes(lesson.id),'Old bookmarked lesson is retained');
      assert.ok(!ids.includes('00000000006'),'Unretained history remains bounded');
      assert.equal(new Set(ids).size,ids.length);
      assert.equal(ids.length,1006);
    });
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
