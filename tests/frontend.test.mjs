import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createClient} from '../src/auth-sdk.js';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const jwt=id=>'e30.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.fixture';
const pending=w=>Object.keys(w.localStorage).filter(k=>k.startsWith('user:note-user:ytguide.operation.v4.')).map(k=>JSON.parse(w.localStorage.getItem(k)));
const lesson={id:'AAAAAAAAAAA',title:'SQL joins lesson',channel:'Fixture',topic:'sql',language:'en'};
async function page(url='https://ytguide.test/?topic=sql&source=catalogue#discover'){
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const requests=[];
  w.fetch=async url=>{requests.push(String(url));return {ok:true,json:async()=>({videos:[lesson],notice:'Fixture source',candidates:1})};};
  // Legacy guest data must remain recoverable but must not become the active workspace.
  w.localStorage.setItem('ytguide.saved.v2',JSON.stringify([lesson]));
  w.eval(script);await new Promise(resolve=>setImmediate(resolve));
  return {dom,w,requests,$:s=>w.document.querySelector(s)};
}
test('Guests cannot save, complete, bookmark, create collections or persist viewing activity',async()=>{
  const {dom,w,$}=await page();
  try{
    let prompts=0;w.addEventListener('ytguide:signin',()=>prompts++);
    $('[data-save]').click();$('[data-watch]').click();
    assert.equal($('#lesson-notes').disabled,true);
    $('#mark-complete').click();$('#add-bookmark').click();
    $('#collection-name').value='Private';$('#collection-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(prompts,4);
    const state=w.YTGuide.state;
    assert.equal(state.saved.length,0);assert.equal(state.completed.length,0);assert.equal(state.collections.length,0);
    assert.equal(Object.keys(state.lessonIndex).length,0);assert.equal(Object.keys(state.bookmarks).length,0);
    assert.deepEqual(JSON.parse(w.localStorage.getItem('ytguide.saved.v2')),[lesson]);
    assert.equal(w.localStorage.length,1);
  }finally{dom.window.close();}
});
test('Refresh restores selected topic, goal, filters and workspace view from URL',async()=>{
  const {dom,w,$,requests}=await page('https://ytguide.test/?topic=sql&goal=joins&language=hi&length=short&source=catalogue#workspace');
  try{
    assert.equal($('#topic').value,'sql');assert.equal($('#goal').value,'joins');assert.equal($('#language').value,'hi');
    assert.equal($('#workspace-view').hidden,false);assert.match($('#workspace-results').textContent,/needs an account/);
    assert.equal(requests.length,0,'Opening a workspace must not spend YouTube quota in the background');
    $('#topic').value='linux';$('#topic').dispatchEvent(new w.Event('change'));
    await new Promise(resolve=>setTimeout(resolve,400));
    assert.match(requests.at(-1),/topic=linux/);assert.match(w.location.search,/topic=linux/);assert.equal(w.location.hash,'#workspace');
  }finally{dom.window.close();}
});
test('Authenticated actions emit cloud mutations, remain account scoped, and relock after logout',async()=>{
  const {dom,w,$}=await page();
  try{
    const mutations=[];w.addEventListener('ytguide:mutation',e=>mutations.push(e.detail));
    w.YTGuide.setScope('user:test-user');w.YTGuide.setAuthenticated(true);
    $('[data-save]').click();$('[data-watch]').click();
    $('#mark-complete').click();$('#bookmark-label').value='Join example';$('#bookmark-time').value='02:10';$('#add-bookmark').click();
    assert.equal(w.YTGuide.state.saved.length,1);assert.equal(w.YTGuide.state.completed.length,1);
    assert.equal(w.YTGuide.state.bookmarks[lesson.id][0].seconds,130);
    assert.equal($('#lesson-notes').disabled,false);
    assert.ok(mutations.some(m=>m.action==='bookmark'&&m.seconds===130));
    assert.ok(w.localStorage.getItem('user:test-user:ytguide.saved.v2'));
    w.YTGuide.setAuthenticated(false);w.YTGuide.setScope('guest');
    assert.equal(w.YTGuide.state.saved.length,0);assert.equal($('#lesson-notes').disabled,true);
  }finally{dom.window.close();}
});
test('Account adapter sends passwords only in same-origin POST and rechecks the session without caching',async()=>{
  const requests=[];const original=global.fetch;
  global.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.includes('get-session')?{user:{id:'fixture'}}:{token:'fixture'}};};
  try{
    const client=createClient();await client.signIn.email({email:'fixture@example.invalid',password:'fixture-password'});
    const result=await client.getSession();await client.signOut();
    assert.equal(requests[0].url,'/api/auth/sign-in/email');assert.equal(requests[0].options.method,'POST');
    assert.equal(requests[0].options.credentials,'same-origin');assert.ok(!requests[0].url.includes('password'));
    assert.equal(requests[1].options.cache,'no-store');assert.match(requests[1].url,/disableCookieCache=true/);
    assert.equal(result.data.user.id,'fixture');assert.equal(requests[2].options.method,'POST');
  }finally{global.fetch=original;}
});
test('Account adapter presents provider rejection and timeout as actionable errors',async()=>{
  const original=global.fetch;
  try{
    global.fetch=async()=>({ok:false,json:async()=>({code:'INVALID_EMAIL_OR_PASSWORD',message:'Invalid email or password'})});
    assert.equal((await createClient().signIn.email({})).error.code,'INVALID_EMAIL_OR_PASSWORD');
    global.fetch=async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'});};
    assert.match((await createClient().getSession()).error.message,/timed out/);
  }finally{global.fetch=original;}
});
const accountScript=await readFile(new URL('../public/account.js',import.meta.url),'utf8');
test('Sign-in form connects cloud workspace, syncs a save, and logout removes account state',async()=>{
  const {dom,w,$}=await page();
  const mutations=[];let session=null;
  const cloudLesson={...lesson,id:'BBBBBBBBBBB',title:'Cloud lesson'};
  const workspace={lessons:[{video_id:cloudLesson.id,metadata:cloudLesson,saved:true,completed:false,position_seconds:0}],notes:[],collections:[],bookmarks:[],memberships:[]};
  w.testClient={getSession:async()=>({data:session}),token:async()=>({data:{token:jwt('fixture-user')}}),signIn:{email:async()=>{session={user:{id:'fixture-user',name:'Fixture',email:'fixture@example.invalid'}};return {data:session};}},signOut:async()=>{session=null;return {data:{success:true}};}};
  w.fetch=async(url,options)=>{
    if(url.includes('action=config'))return {ok:true,json:async()=>({accountsConfigured:true})};
    if(url==='/api/workspace'){
      if(options?.method==='POST')mutations.push(JSON.parse(options.body));
      return {ok:true,json:async()=>({workspace})};
    }
    return {ok:true,json:async()=>({videos:[lesson],notice:'Fixture source',candidates:1})};
  };
  try{
    await w.eval(accountScript.replace("await import('/auth-sdk.js')",'({createClient:()=>window.testClient})'));
    $('[data-save]').click();assert.equal($('#account-dialog').open,true);
    assert.equal($('#account-password').minLength,1);
    $('#account-email').value='fixture@example.invalid';$('#account-password').value='eight123';
    $('#account-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(w.YTGuide.authenticated,true);assert.equal($('#account-dialog').open,false);
    assert.ok(w.YTGuide.state.saved.some(v=>v.title==='Cloud lesson'));
    assert.equal($('#lesson-dialog').open,true,'Return to the requested lesson after sign-in');
    assert.ok(w.YTGuide.state.saved.some(v=>v.id===lesson.id),'Complete the original Save action');
    $('[data-save]').click();await new Promise(resolve=>setImmediate(resolve));
    assert.ok(mutations.some(m=>m.action==='lesson'&&m.patch.saved===true));
    assert.equal($('#sync-status').textContent,'Cloud synced ✓');
    $('#account-button').click();$('#sign-out').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(w.YTGuide.authenticated,false);assert.equal(w.YTGuide.state.saved.length,0);
    assert.equal([...Object.keys(w.localStorage)].some(k=>k.startsWith('user:fixture-user:')),false);
  }finally{dom.window.close();}
});
test('A failed initial account connection can be retried from Sign in without reloading',async()=>{
  const {dom,w,$}=await page();let attempts=0;
  w.fetch=async()=>{attempts++;if(attempts===1)throw new Error('network');return {ok:true,json:async()=>({accountsConfigured:true})};};
  w.testClient={getSession:async()=>({data:null})};
  try{
    await w.eval(accountScript.replace("await import('/auth-sdk.js')",'({createClient:()=>window.testClient})'));
    assert.equal(w.YTGuide.authenticated,false);
    $('#account-button').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(attempts,2);assert.equal($('#account-dialog').open,true);
  }finally{dom.window.close();}
});
test('Cold visits show a search invitation without spending live retrieval quota',async()=>{
 const {dom,$,requests}=await page('https://ytguide.test/');
 try{assert.equal(requests.length,0);assert.match($('#results').textContent,/What would you like/);assert.equal($('#collection-form').hidden,true);assert.equal($('.workspace-tools').hidden,true);}
 finally{dom.window.close();}
});
test('Other topic requires a goal and does not submit an empty automatic search',async()=>{
 const {dom,w,$,requests}=await page();
 try{
  const before=requests.length;$('#topic').value='custom';$('#topic').dispatchEvent(new w.Event('change'));
  await new Promise(r=>setTimeout(r,400));assert.equal($('#goal').required,true);assert.match($('#goal-requirement').textContent,/Required/);assert.equal(requests.length,before);
 }finally{dom.window.close();}
});
test('Empty-result YouTube link encodes the actual topic and question',async()=>{
 const {dom,w,$}=await page();
 try{w.fetch=async()=>({ok:true,json:async()=>({videos:[],notice:'No match',candidates:0})});$('#goal').value='SQL joins';$('#search-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setImmediate(r));const href=$('#results a').href;assert.ok(href.startsWith('https://www.youtube.com/results?'));assert.match(href,/SQL\+joins/);assert.ok(!href.includes('escapeHtml'));}
 finally{dom.window.close();}
});


const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function noteAccount(storage={},cloudContent='Cloud original',version=7,offlineInitially=false){
  const p=await page();const {w}=p;
  for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
  const posts=[];
  const workspace={lessons:[{video_id:lesson.id,metadata:lesson,saved:true,completed:false,position_seconds:0}],notes:[{video_id:lesson.id,content:cloudContent,version}],collections:[],bookmarks:[],memberships:[]};
  w.testClient={getSession:async()=>({data:{user:{id:'note-user',name:'Notes'}}}),token:async()=>({data:{token:jwt('note-user')}})};
  let offline=offlineInitially;
  w.fetch=async(url,options)=>{
    if(url.includes('action=config'))return {ok:true,json:async()=>({accountsConfigured:true})};
    if(options?.method==='POST'){
      const body=JSON.parse(options.body);posts.push(body);
      if(offline)throw new Error('Offline');
      if(body.action==='note'){
        if(body.version!==version)return {ok:false,status:409,json:async()=>({note:{content:cloudContent,version}})};
        cloudContent=body.content;version++;
        return {ok:true,json:async()=>({note:{content:cloudContent,version}})};
      }
      return {ok:true,json:async()=>({ok:true})};
    }
    return {ok:true,json:async()=>({workspace})};
  };
  await w.eval(accountScript.replace("await import('/auth-sdk.js')",'({createClient:()=>window.testClient})'));
  await tick();return {...p,posts,offline:()=>{offline=true;}};
}
test('Reload before the note debounce preserves a durable account-scoped draft and its base version',async()=>{
  const first=await noteAccount();let storage;
  try{
    first.$('[data-watch]').click();await tick();first.posts.length=0;
    for(const value of ['New','Newest local draft']){
      first.$('#lesson-notes').value=value;
      first.$('#lesson-notes').dispatchEvent(new first.w.Event('input',{bubbles:true}));
    }
    const queued=pending(first.w);
    assert.equal(queued.length,1);assert.equal(queued[0].content,'Newest local draft');assert.equal(queued[0].version,7);
    assert.equal(first.posts.length,0,'Network sends remain debounced');
    storage=Object.fromEntries(Object.entries(first.w.localStorage));
  }finally{first.dom.window.close();}
  const next=await noteAccount(storage);
  try{
    assert.equal(next.w.YTGuide.state.notes[lesson.id],'Newest local draft');
    assert.equal(JSON.parse(next.w.localStorage.getItem('user:note-user:ytguide.notes.v2'))[lesson.id],'Newest local draft');
    assert.equal(next.posts.find(p=>p.action==='note').version,7);
    assert.equal(pending(next.w).length,0);
    assert.equal(next.w.YTGuide.getNoteVersion(lesson.id),8);
  }finally{next.dom.window.close();}
});
test('A reloaded draft keeps its local text and exposes a genuine newer-cloud conflict',async()=>{
  const storage={
    'user:note-user:ytguide.notes.v2':JSON.stringify({[lesson.id]:'Local draft'}),
    'user:note-user:ytguide.lessons.v3':JSON.stringify({[lesson.id]:lesson}),
    'user:note-user:ytguide.pending.v3':JSON.stringify([{action:'note',video:lesson,content:'Local draft',version:7}])
  };
  const p=await noteAccount(storage,'Changed on another device',8);
  try{
    assert.equal(p.w.YTGuide.state.notes[lesson.id],'Local draft');
    assert.equal(pending(p.w)[0].blocked,true);
    p.$('[data-watch]').click();await tick();
    assert.equal(p.$('#lesson-notes').value,'Local draft');
    assert.equal(p.$('#note-conflict').hidden,false);
    p.$('#use-cloud-note').click();await tick();
    assert.equal(p.w.YTGuide.state.notes[lesson.id],'Changed on another device');
  }finally{p.dom.window.close();}
});
test('An empty note draft survives reload without resurrecting deleted text',async()=>{
  const first=await noteAccount();let storage;
  try{
    first.$('[data-watch]').click();await tick();
    first.$('#lesson-notes').value='';first.$('#lesson-notes').dispatchEvent(new first.w.Event('input'));
    storage=Object.fromEntries(Object.entries(first.w.localStorage));
  }finally{first.dom.window.close();}
  const p=await noteAccount(storage);
  try{assert.equal(p.w.YTGuide.state.notes[lesson.id],'');assert.equal(p.posts.find(p=>p.action==='note').content,'');}
  finally{p.dom.window.close();}
});

test('Offline reload keeps a pending draft until a later online retry',async()=>{
  const storage={
    'user:note-user:ytguide.notes.v2':JSON.stringify({[lesson.id]:'Offline draft'}),
    'user:note-user:ytguide.lessons.v3':JSON.stringify({[lesson.id]:lesson}),
    'user:note-user:ytguide.pending.v3':JSON.stringify([{action:'note',video:lesson,content:'Offline draft',version:7}])
  };
  const offline=await noteAccount(storage,'Cloud original',7,true);let retryStorage;
  try{
    assert.equal(offline.w.YTGuide.state.notes[lesson.id],'Offline draft');
    assert.equal(pending(offline.w).length,1);
    retryStorage=Object.fromEntries(Object.entries(offline.w.localStorage));
  }finally{offline.dom.window.close();}
  const online=await noteAccount(retryStorage);
  try{
    assert.equal(online.posts.find(p=>p.action==='note').content,'Offline draft');
    assert.equal(pending(online.w).length,0);
  }finally{online.dom.window.close();}
});
