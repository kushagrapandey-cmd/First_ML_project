import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const account=(await readFile(new URL('../public/account.js',import.meta.url),'utf8')).replace("await import('/auth-sdk.js')",'({createClient:()=>window.client})');
const video={id:'AAAAAAAAAAA',title:'Test lesson',channel:'Fixture',source:'catalogue'};
const nextVideo={...video,id:'BBBBBBBBBBB',title:'Second lesson'};
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
const jwt=id=>'e30.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.fixture';
const response=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
const workspace=()=>({lessons:[],notes:[],collections:[],bookmarks:[],memberships:[]});
function storage(){
 const data=new Map();
 const methods={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 return new Proxy(methods,{ownKeys:()=>[...data.keys()],getOwnPropertyDescriptor:(_,k)=>data.has(k)?{configurable:true,enumerable:true,value:data.get(k)}:undefined});
}
const queued=(store,id)=>Object.keys(store).filter(k=>k.startsWith('user:'+id+':ytguide.operation.v4.')).map(k=>JSON.parse(store.getItem(k)));
async function page({store=storage(),id='alice',backend=async()=>response({ok:true})}={}){
 const dom=new JSDOM(html,{url:'https://ytguide.test/?topic=sql&source=catalogue',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,$=s=>w.document.querySelector(s),errors=[];
 Object.defineProperty(w,'localStorage',{value:store});w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.confirm=()=>true;
 w.addEventListener('error',e=>errors.push(e.error));
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let session={user:{id,name:id}},subject=id;
 w.client={getSession:async()=>({data:session}),token:async()=>({data:{token:jwt(subject)}}),signOut:async()=>({data:{success:true}})};
 w.fetch=async(url,options)=>{
  if(url.includes('action=config'))return response({accountsConfigured:true});
  if(url==='/api/workspace')return backend(options?.method==='POST'?JSON.parse(options.body):null,session?.user.id);
  return response({videos:[video,nextVideo],notice:'Fixture',candidates:2});
 };
 w.eval(app);await tick();
 const cloud={...workspace(),lessons:[{video_id:video.id,metadata:video,saved:true,completed:false,position_seconds:0}],notes:[{video_id:video.id,content:'Original',version:1}]};
 const runBackend=backend;
 backend=async(body,id)=>body?runBackend(body,id):response({workspace:cloud});
 await w.eval(account);await tick();
 return {w,dom,$,store,errors,cloud,session:(id)=>{session=id?{user:{id,name:id}}:null;subject=id;},tokenSubject:id=>{subject=id;},note:text=>{$('#lesson-notes').value=text;$('#lesson-notes').dispatchEvent(new w.Event('input'));},flush:async()=>{w.YTGuide.flushNote();await tick();}};
}
test('A changed token owner cannot send the old account’s draft into a different account',async()=>{
 const posts=[],p=await page({backend:async b=>{posts.push(b);return response({ok:true});}});
 try{
  p.$('[data-watch]').click();await tick();posts.length=0;
  p.tokenSubject('bob');p.note('Private Alice note');await p.flush();
  assert.equal(posts.length,0);assert.equal(queued(p.store,'alice').some(q=>q.content==='Private Alice note'),true);
  assert.equal(p.w.YTGuide.authenticated,false);
 }finally{p.dom.window.close();}
});
test('A late failed request cannot reject a new account’s queue, which resumes automatically',async()=>{
 let rejectOld;const posts=[];
 const p=await page({backend:async(b,id)=>{posts.push({b,id});if(id==='alice')return new Promise((_,reject)=>{rejectOld=reject;});return response({ok:true});}});
 try{
  p.$('[data-watch]').click();await tick();assert.ok(rejectOld);
  p.session('bob');p.w.dispatchEvent(new p.w.Event('focus'));await tick();
  p.$('[data-save]').click();await tick();rejectOld(Object.assign(new Error('Old failure'),{status:400}));await tick();
  assert.ok(posts.some(p=>p.id==='bob'));assert.equal(queued(p.store,'bob').length,0);
  assert.equal(queued(p.store,'alice')[0].rejected,undefined);assert.equal(p.w.YTGuide.scope,'user:bob');
 }finally{p.dom.window.close();}
});
test('Two offline tabs persist independent operations without overwriting each other',async()=>{
 const store=storage(),fail=async()=>{throw new Error('Offline');};
 const a=await page({store,backend:fail}),b=await page({store,backend:fail});
 try{
  a.$('[data-watch]').click();b.$('[data-watch]').click();await tick();
  a.note('Draft from tab A');b.note('Draft from tab B');
  const drafts=queued(store,'alice').filter(q=>q.action==='note');
  assert.equal(drafts.length,2);assert.deepEqual(new Set(drafts.map(q=>q.content)),new Set(['Draft from tab A','Draft from tab B']));
 }finally{a.dom.window.close();b.dom.window.close();}
});
test('Typing while a note request is in flight preserves the newest text and rebases its version',async()=>{
 let resolveFirst;const posts=[];
 const p=await page({backend:async b=>{
  if(b.action!=='note')return response({ok:true});posts.push(b);
  if(posts.length===1)return new Promise(resolve=>{resolveFirst=resolve;});
  return response({note:{content:b.content,version:3}});
 }});
 try{
  p.$('[data-watch]').click();await tick();p.note('First draft');await p.flush();assert.ok(resolveFirst);
  p.note('Newest draft');resolveFirst(response({note:{content:'First draft',version:2}}));await tick();
  assert.deepEqual(posts.map(p=>[p.content,p.version]),[['First draft',1],['Newest draft',2]]);
  assert.equal(p.w.YTGuide.state.notes[video.id],'Newest draft');assert.equal(queued(p.store,'alice').length,0);
 }finally{p.dom.window.close();}
});
test('Reload reconciles a pending note with other newly arrived cloud lessons',async()=>{
 const store=storage();store.setItem('user:alice:ytguide.pending.v3',JSON.stringify([{action:'note',video:nextVideo,content:'Offline second lesson',version:0}]));
 const p=await page({store,backend:async()=>{throw new Error('Offline');}});
 try{
  assert.equal(p.w.YTGuide.state.notes[nextVideo.id],'Offline second lesson');
  assert.equal(p.w.YTGuide.state.saved[0].id,video.id);assert.ok(p.w.YTGuide.state.lessonIndex[nextVideo.id]);
 }finally{p.dom.window.close();}
});
test('Deleting a collection being renamed leaves the form ready to create a new collection',async()=>{
 const p=await page();
 try{
  p.$('[data-view="workspace"]').click();p.$('#collection-name').value='Old';p.$('#collection-form').dispatchEvent(new p.w.Event('submit',{cancelable:true}));
  p.$('[data-rename-collection]').click();p.$('[data-delete-collection]').click();
  p.$('#collection-name').value='New';p.$('#collection-form').dispatchEvent(new p.w.Event('submit',{cancelable:true}));
  assert.equal(p.w.YTGuide.state.collections[0].name,'New');assert.deepEqual(p.errors,[]);
 }finally{p.dom.window.close();}
});
test('Goal typing replaces the URL instead of creating a history entry for each keystroke',async()=>{
 const p=await page();
 try{const count=p.w.history.length;for(const value of ['j','jo','joins']){p.$('#goal').value=value;p.$('#goal').dispatchEvent(new p.w.Event('input'));}assert.equal(p.w.history.length,count);assert.match(p.w.location.search,/goal=joins/);}
 finally{p.dom.window.close();}
});
test('The empty Other topic prompt cannot be replaced by a stale search response',async()=>{
 const p=await page();let resolve;
 try{
  p.w.fetch=()=>new Promise(r=>{resolve=r;});p.$('#search-form').dispatchEvent(new p.w.Event('submit',{cancelable:true}));
  p.$('#topic').value='custom';p.$('#goal').value='';p.$('#search-form').dispatchEvent(new p.w.Event('submit',{cancelable:true}));
  resolve(response({videos:[video],notice:'Stale',candidates:1}));await tick();
  assert.match(p.$('#results').textContent,/What would you like/);assert.equal(p.$('#search-button').disabled,false);
 }finally{p.dom.window.close();}
});

test('Collection create, rename, attach and remove update the workspace and emit the matching API actions',async()=>{
 const posts=[],p=await page({backend:async b=>{posts.push(b);return response({ok:true});}});
 try{
  const submit=()=>p.$('#collection-form').dispatchEvent(new p.w.Event('submit',{cancelable:true}));
  p.$('[data-view="workspace"]').click();p.$('#collection-name').value='SQL';submit();await tick();
  const collection=p.w.YTGuide.state.collections[0];p.$('[data-rename-collection]').click();p.$('#collection-name').value='Joins';submit();await tick();
  p.$('[data-watch]').click();p.$('#lesson-collection').value=collection.id;p.$('#add-to-collection').click();await tick();
  assert.deepEqual([...p.w.YTGuide.state.memberships[video.id]],[collection.id]);
  p.$('[data-remove-membership]').click();await tick();assert.equal(p.w.YTGuide.state.memberships[video.id].length,0);
  assert.deepEqual(posts.filter(b=>b.action!=='lesson').map(b=>b.action),['createCollection','renameCollection','membership','membership']);
 }finally{p.dom.window.close();}
});
test('Player pause persists progress; bookmarks seek to the selected timestamp and can be removed',async()=>{
 const posts=[],p=await page({backend:async b=>{posts.push(b);return response({ok:true});}});let config,seconds=42,seek;
 try{
  p.w.YT={Player:function(id,options){config=options;return {getCurrentTime:()=>seconds,getPlayerState:()=>2,seekTo:s=>{seek=s;},destroy:()=>{}};}};
  p.$('[data-watch]').click();p.$('#load-player').click();await tick();config.events.onReady();config.events.onStateChange({data:2});await tick();
  assert.equal(p.w.YTGuide.state.positions[video.id],42);assert.ok(posts.some(b=>b.patch?.position===42));
  p.$('#bookmark-label').value='Join example';p.$('#bookmark-time').value='02:10';p.$('#add-bookmark').click();await tick();p.$('[data-seek-bookmark]').click();assert.equal(seek,130);
  p.$('[data-remove-bookmark]').click();await tick();assert.equal(p.w.YTGuide.state.bookmarks[video.id].length,0);
  assert.ok(posts.some(b=>b.action==='bookmark'&&b.seconds===130));assert.ok(posts.some(b=>b.action==='deleteBookmark'));
  p.$('#close-lesson').click();p.$('[data-watch]').click();p.$('#load-player').click();await tick();assert.equal(config.playerVars.start,42);
 }finally{p.dom.window.close();}
});
test('Notes and JSON backup exports contain the actual workspace, without credentials',async()=>{
 const p=await page();const blobs=[],downloads=[];
 try{
  p.w.Blob=Blob;p.w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:fixture';};p.w.URL.revokeObjectURL=()=>{};
  p.w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
  p.$('[data-view="workspace"]').click();p.$('#export-notes').click();p.$('#export-backup').click();
  assert.deepEqual(downloads,['YTGuide-study-notes.md','YTGuide-workspace.json']);
  const notes=await blobs[0].text(),backup=JSON.parse(await blobs[1].text());
  assert.match(notes,/Original/);assert.match(notes,/youtube.com\/watch\?v=AAAAAAAAAAA/);
  assert.equal(backup.format,'ytguide-workspace');assert.equal(backup.notes[video.id],'Original');assert.equal(backup.token,undefined);
 }finally{p.dom.window.close();}
});
test('Focus timer handles start, pause, resume, completion and reset without clock drift',async()=>{
 const p=await page();let now=100000;
 try{
  p.w.Date.now=()=>now;p.$('#start-focus').click();p.$('#timer-length').value='15';p.$('#timer-length').dispatchEvent(new p.w.Event('change'));
  p.$('#timer-toggle').click();now+=61000;p.w.document.dispatchEvent(new p.w.Event('visibilitychange'));
  assert.equal(p.$('#timer-display').textContent,'13:59');p.$('#timer-toggle').click();now+=100000;p.w.document.dispatchEvent(new p.w.Event('visibilitychange'));assert.equal(p.$('#timer-display').textContent,'13:59');
  p.$('#timer-toggle').click();now+=900000;p.w.document.dispatchEvent(new p.w.Event('visibilitychange'));assert.equal(p.$('#timer-display').textContent,'00:00');assert.match(p.$('#timer-status').textContent,/complete/);
  p.$('#timer-reset').click();assert.equal(p.$('#timer-display').textContent,'15:00');
 }finally{p.dom.window.close();}
});
test('A rejected rename can be discarded and the workspace reconciles with cloud state',async()=>{
 const p=await page({backend:async()=>response({error:'Name exists'},409)});
 try{
  p.$('[data-view="workspace"]').click();
  p.w.dispatchEvent(new p.w.CustomEvent('ytguide:mutation',{detail:{action:'renameCollection',id:'11111111-1111-4111-8111-111111111111',name:'Duplicate'}}));await tick();
  assert.equal(p.$('#sync-discard').hidden,false);p.$('#sync-discard').click();await tick();assert.equal(queued(p.store,'alice').length,0);assert.equal(p.$('#sync-discard').hidden,true);
 }finally{p.dom.window.close();}
});
test('Password recovery shows code entry and only reports reset after provider confirmation',async()=>{
 const dom=new JSDOM(html,{url:'https://ytguide.test/',runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s),calls=[];
 try{
  w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.fetch=async()=>response({accountsConfigured:true});w.eval(app);
  w.client={getSession:async()=>({data:null}),emailOtp:{sendVerificationOtp:async body=>{calls.push(body);return {data:{success:true}};},resetPassword:async body=>{calls.push(body);return {error:{message:'Invalid code'}};}}};
  await w.eval(account);$('#account-button').click();$('#forgot-password').click();$('#account-email').value='qa@example.invalid';
  const submit=()=>$('#account-form').dispatchEvent(new w.Event('submit',{cancelable:true}));submit();await tick();
  assert.equal(calls[0].type,'forget-password');assert.equal($('#otp-field').hidden,false);assert.equal($('#account-password').minLength,8);
  $('#account-password').value='example-password';$('#account-otp').value='123456';submit();await tick();assert.equal($('#account-message').textContent,'Invalid code');assert.equal($('#otp-field').hidden,false);
  w.client.emailOtp.resetPassword=async()=>({data:{success:true}});submit();await tick();assert.match($('#account-message').textContent,/Password reset/);assert.equal($('#otp-field').hidden,true);
 }finally{dom.window.close();}
});

test('Unavailable device storage retains the draft in memory and can retry without forcing sign-in',async()=>{
 let offline=true;const saved=[];
 const p=await page({backend:async b=>{if(offline)throw new Error('Offline');saved.push(b);return response(b.action==='note'?{note:{content:b.content,version:2}}:{ok:true});}});
 const original=p.store.setItem;
 try{
  p.$('[data-watch]').click();await tick();p.store.setItem=()=>{throw new Error('QuotaExceededError');};
  p.note('Keep this draft in memory');await p.flush();assert.equal(p.w.YTGuide.authenticated,true);assert.equal(p.w.YTGuide.state.notes[video.id],'Keep this draft in memory');
  p.store.setItem=original;offline=false;p.w.dispatchEvent(new p.w.Event('online'));await tick();assert.ok(saved.some(b=>b.content==='Keep this draft in memory'));
 }finally{p.store.setItem=original;p.dom.window.close();}
});
