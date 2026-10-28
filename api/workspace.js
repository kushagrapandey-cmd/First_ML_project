import {authenticate,authURL} from '../lib/identity.js';
import {asUser} from '../lib/db.js';
import {HttpError,assertOrigin,readBody,respond,video,videoId,uuid,text,integer} from '../lib/validation.js';

async function limits(user) {
  const [rows]=await asUser(user.id,sql=>[
    sql`WITH profile AS (INSERT INTO learner_profiles(user_id,display_name) VALUES(${user.id},${user.name}) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING user_id)
      INSERT INTO workspace_rate_limits(user_id,window_start) SELECT user_id,date_trunc('minute',now()) FROM profile ON CONFLICT(user_id,window_start) DO UPDATE SET request_count=workspace_rate_limits.request_count+1 RETURNING request_count`,
    sql`DELETE FROM workspace_rate_limits WHERE user_id=${user.id} AND window_start<now()-interval '2 minutes'`
  ]);
  if(rows[0].request_count>120)throw new HttpError(429,'Too many changes. Wait a minute and try again.');
}
async function load(user,runAsUser=asUser) {
  const [lessons,notes,collections,bookmarks,memberships]=await runAsUser(user.id,sql=>[
    sql`WITH recent AS (
      SELECT video_id FROM learner_lessons WHERE user_id=${user.id} ORDER BY updated_at DESC,video_id LIMIT 1000
    ) SELECT l.video_id,l.metadata,l.saved,l.completed,l.position_seconds,l.version,l.updated_at
      FROM learner_lessons l WHERE l.user_id=${user.id} AND (
        l.video_id IN (SELECT video_id FROM recent) OR l.saved OR l.completed
        OR EXISTS (SELECT 1 FROM lesson_notes n WHERE n.user_id=l.user_id AND n.video_id=l.video_id)
        OR EXISTS (SELECT 1 FROM lesson_bookmarks b WHERE b.user_id=l.user_id AND b.video_id=l.video_id)
        OR EXISTS (SELECT 1 FROM collection_lessons c WHERE c.user_id=l.user_id AND c.video_id=l.video_id)
      ) ORDER BY l.updated_at DESC,l.video_id`,
    sql`SELECT video_id,content,version FROM lesson_notes WHERE user_id=${user.id}`,
    sql`SELECT id,name FROM study_collections WHERE user_id=${user.id} ORDER BY created_at`,
    sql`SELECT id,video_id,seconds,label FROM lesson_bookmarks WHERE user_id=${user.id} ORDER BY seconds`,
    sql`SELECT collection_id,video_id FROM collection_lessons WHERE user_id=${user.id}`
  ]);
  return {lessons,notes,collections,bookmarks,memberships};
}
async function ensureLesson(user,v,runAsUser) {
  const item=video(v);
  await runAsUser(user.id,sql=>[sql`INSERT INTO learner_lessons(user_id,video_id,metadata) VALUES(${user.id},${item.id},${JSON.stringify(item)}::jsonb) ON CONFLICT(user_id,video_id) DO UPDATE SET metadata=EXCLUDED.metadata`]);
  return item.id;
}
async function mutate(user,body,runAsUser=asUser) {
  if(!body || typeof body!=='object' || Array.isArray(body))throw new HttpError(400,'An action is required.');
  const action=body.action;
  if(action==='lesson') {
    const v=video(body.video);
    const patch=body.patch||{};
    if(typeof patch.saved!=='undefined' && typeof patch.saved!=='boolean')throw new HttpError(400,'Invalid saved state.');
    if(typeof patch.completed!=='undefined' && typeof patch.completed!=='boolean')throw new HttpError(400,'Invalid completion state.');
    if(typeof patch.position!=='undefined')integer(patch.position,0,604800,'position');
    const [rows]=await runAsUser(user.id,sql=>[sql`INSERT INTO learner_lessons(user_id,video_id,metadata,saved,completed,position_seconds)
      VALUES(${user.id},${v.id},${JSON.stringify(v)}::jsonb,${patch.saved??false},${patch.completed??false},${patch.position??0})
      ON CONFLICT(user_id,video_id) DO UPDATE SET metadata=EXCLUDED.metadata,
      saved=CASE WHEN ${typeof patch.saved!=='undefined'} THEN EXCLUDED.saved ELSE learner_lessons.saved END,
      completed=CASE WHEN ${typeof patch.completed!=='undefined'} THEN EXCLUDED.completed ELSE learner_lessons.completed END,
      position_seconds=CASE WHEN ${typeof patch.position!=='undefined'} THEN EXCLUDED.position_seconds ELSE learner_lessons.position_seconds END,
      version=learner_lessons.version+1,updated_at=now() RETURNING version`]);
    return {ok:true,version:rows[0].version};
  }
  if(action==='note') {
    const id=videoId(body.video?.id);
    const content=text(body.content,8000,'note');
    const version=integer(body.version,0,2147483646,'note version');
    await ensureLesson(user,body.video,runAsUser);
    const [rows]=await runAsUser(user.id,sql=>[sql`INSERT INTO lesson_notes(user_id,video_id,content) VALUES(${user.id},${id},${content})
      ON CONFLICT(user_id,video_id) DO UPDATE SET content=EXCLUDED.content,version=lesson_notes.version+1,updated_at=now()
      WHERE lesson_notes.version=${version} RETURNING content,version`]);
    if(!rows.length) {
      const [latest]=await runAsUser(user.id,sql=>[sql`SELECT content,version FROM lesson_notes WHERE user_id=${user.id} AND video_id=${id}`]);
      return {conflict:true,note:latest[0]};
    }
    return {ok:true,note:rows[0]};
  }
  if(action==='createCollection') {
    const id=uuid(body.id); const name=text(body.name,60,'collection name',false).trim();
    const [rows]=await runAsUser(user.id,sql=>[sql`INSERT INTO study_collections(user_id,id,name) VALUES(${user.id},${id}::uuid,${name}) ON CONFLICT DO NOTHING RETURNING id,name`]);
    if(!rows.length)throw new HttpError(409,'This collection name already exists, or your 50-collection limit was reached.');
    return {ok:true,collection:rows[0]};
  }
  if(action==='renameCollection') {
    const id=uuid(body.id);const name=text(body.name,60,'collection name',false).trim();
    const [rows]=await runAsUser(user.id,sql=>[sql`UPDATE study_collections SET name=${name} WHERE user_id=${user.id} AND id=${id}::uuid RETURNING id,name`]);
    if(!rows.length)throw new HttpError(404,'Collection not found.');
    return {ok:true,collection:rows[0]};
  }
  if(action==='deleteCollection') {
    const id=uuid(body.id);
    await runAsUser(user.id,sql=>[sql`DELETE FROM study_collections WHERE user_id=${user.id} AND id=${id}::uuid`]);
    return {ok:true};
  }
  if(action==='membership') {
    const collection=uuid(body.collectionId);
    if(typeof body.add!=='boolean')throw new HttpError(400,'Invalid membership state.');
    const [owned]=await runAsUser(user.id,sql=>[sql`SELECT id FROM study_collections WHERE user_id=${user.id} AND id=${collection}::uuid`]);
    if(!owned.length)throw new HttpError(404,'Collection not found.');
    const id=await ensureLesson(user,body.video,runAsUser);
    await runAsUser(user.id,sql=>[body.add?sql`INSERT INTO collection_lessons(user_id,collection_id,video_id) VALUES(${user.id},${collection}::uuid,${id}) ON CONFLICT DO NOTHING`:sql`DELETE FROM collection_lessons WHERE user_id=${user.id} AND collection_id=${collection}::uuid AND video_id=${id}`]);
    return {ok:true};
  }
  if(action==='bookmark') {
    const id=uuid(body.id);const v=video(body.video);const at=integer(body.seconds,0,604800,'timestamp');const label=text(body.label,200,'bookmark',false);
    await ensureLesson(user,v,runAsUser);
    const [rows]=await runAsUser(user.id,sql=>[sql`INSERT INTO lesson_bookmarks(id,user_id,video_id,seconds,label)
      SELECT ${id}::uuid,${user.id},${v.id},${at},${label} WHERE (SELECT count(*) FROM lesson_bookmarks WHERE user_id=${user.id} AND video_id=${v.id})<100 ON CONFLICT DO NOTHING RETURNING id`]);
    if(!rows.length)throw new HttpError(409,'Bookmark already exists or the 100-bookmark lesson limit was reached.');
    return {ok:true};
  }
  if(action==='deleteBookmark') {
    const id=uuid(body.id);
    await runAsUser(user.id,sql=>[sql`DELETE FROM lesson_bookmarks WHERE user_id=${user.id} AND id=${id}::uuid`]);
    return {ok:true};
  }
  if(action==='import')return importGuest(user,body,runAsUser);
  throw new HttpError(400,'Unknown workspace action.');
}
async function importGuest(user,body,runAsUser) {
  const importId=uuid(body.id);
  if(!Array.isArray(body.lessons)||body.lessons.length>25||!Array.isArray(body.collections)||body.collections.length>50)throw new HttpError(400,'Invalid import batch.');
  const lessons=body.lessons.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw new HttpError(400,'Invalid imported lesson.');
    const v=video(row.video);
    if(typeof row.saved!=='boolean'||typeof row.completed!=='boolean')throw new HttpError(400,'Invalid imported state.');
    const content=text(row.note??'',8000,'imported note');
    if(!Array.isArray(row.bookmarks)||row.bookmarks.length>100||!Array.isArray(row.collections)||row.collections.length>50)throw new HttpError(400,'Invalid imported lesson.');
    return {...row,video:v,note:content,position:integer(row.position??0,0,604800,'position'),bookmarks:row.bookmarks.map(b=>({id:uuid(b.id),seconds:integer(b.seconds,0,604800,'timestamp'),label:text(b.label,200,'bookmark',false)})),collections:row.collections.map(n=>text(n,60,'collection name',false))};
  });
  const collections=body.collections.map(c=>{if(!c||typeof c!=='object')throw new HttpError(400,'Invalid imported collection.');return {id:uuid(c.id),name:text(c.name,60,'collection name',false)};});
  const [prior]=await runAsUser(user.id,sql=>[sql`SELECT import_id FROM workspace_imports WHERE user_id=${user.id} AND import_id=${importId}::uuid`]);
  if(prior.length)return {ok:true,alreadyImported:true};
  await runAsUser(user.id,sql=>{
    const queries=[];
    for(const c of collections)queries.push(sql`INSERT INTO study_collections(user_id,id,name) VALUES(${user.id},${c.id}::uuid,${c.name}) ON CONFLICT DO NOTHING`);
    for(const r of lessons) {
      queries.push(sql`INSERT INTO learner_lessons(user_id,video_id,metadata,saved,completed,position_seconds) VALUES(${user.id},${r.video.id},${JSON.stringify(r.video)}::jsonb,${r.saved},${r.completed},${r.position})
        ON CONFLICT(user_id,video_id) DO UPDATE SET saved=learner_lessons.saved OR EXCLUDED.saved,completed=learner_lessons.completed OR EXCLUDED.completed,position_seconds=GREATEST(learner_lessons.position_seconds,EXCLUDED.position_seconds),updated_at=now()`);
      // A cloud note wins a conflict. The guest original is kept on the device for review/export.
      if(r.note)queries.push(sql`INSERT INTO lesson_notes(user_id,video_id,content) VALUES(${user.id},${r.video.id},${r.note}) ON CONFLICT DO NOTHING`);
      for(const b of r.bookmarks)queries.push(sql`INSERT INTO lesson_bookmarks(id,user_id,video_id,seconds,label) VALUES(${b.id}::uuid,${user.id},${r.video.id},${b.seconds},${b.label}) ON CONFLICT DO NOTHING`);
      for(const name of r.collections)queries.push(sql`INSERT INTO collection_lessons(user_id,collection_id,video_id) SELECT ${user.id},id,${r.video.id} FROM study_collections WHERE user_id=${user.id} AND name=${name} ON CONFLICT DO NOTHING`);
    }
    queries.push(sql`INSERT INTO workspace_imports(user_id,import_id) VALUES(${user.id},${importId}::uuid) ON CONFLICT DO NOTHING`);
    return queries;
  });
  return {ok:true,imported:lessons.length};
}
export default async function handler(req,res) {
  try {
    const url=new URL(req.url,'https://'+req.headers.host);
    if(req.method==='GET'&&url.searchParams.get('action')==='config')return respond(res,200,{accountsConfigured:!!process.env.NEON_AUTH_BASE_URL&&!!process.env.DATABASE_URL,authPath:'/api/auth',guestMode:false});
    if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Use GET or POST.'});
    assertOrigin(req);
    const user=await authenticate(req);
    await limits(user);
    if(req.method==='GET')return respond(res,200,{user,workspace:await load(user)});
    const result=await mutate(user,await readBody(req,350000));
    return respond(res,result.conflict?409:200,result);
  }catch(error){
    if(error.code==='23514'&&error.constraint==='bookmark_lesson_limit')return respond(res,409,{error:'The 100-bookmark lesson limit was reached. This change was not saved; any guest import originals remain on this device.'});
    if(error.code==='23514'&&error.constraint==='study_collection_limit')return respond(res,409,{error:'The 50-collection limit was reached. This change was not saved.'});
    if(error.code==='23505')return respond(res,409,{error:'This name or record already exists.'});
    if(error instanceof HttpError)return respond(res,error.status,{error:error.message});
    console.error('workspace_request_failed',error.code||error.name);
    return respond(res,503,{error:'Cloud sync is unavailable. Your local draft is kept; retry before signing out.'});
  }
}

// Exported only for build-time integration tests. Vercel exposes the default HTTP handler.
export {load,mutate,limits};

