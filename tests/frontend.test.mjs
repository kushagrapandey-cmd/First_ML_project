import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createClient} from '../src/auth-sdk.js';
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const lesson={id:'AAAAAAAAAAA',title:'SQL joins lesson',channel:'Fixture',topic:'sql',language:'en'};
async function page(url='https://ytguide.test/'){
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
    assert.match(requests[0],/topic=sql/);assert.match(requests[0],/goal=joins/);
    $('#topic').value='linux';$('#topic').dispatchEvent(new w.Event('change'));
    await new Promise(resolve=>setImmediate(resolve));
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
  w.testClient={getSession:async()=>({data:session}),token:async()=>({data:{token:'fixture'}}),signIn:{email:async()=>{session={user:{id:'fixture-user',name:'Fixture',email:'fixture@example.invalid'}};return {data:session};}},signOut:async()=>{session=null;return {data:{success:true}};}};
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
    $('#account-button').click();assert.equal($('#account-dialog').open,true);
    assert.equal($('#account-password').minLength,1);
    $('#account-email').value='fixture@example.invalid';$('#account-password').value='eight123';
    $('#account-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(w.YTGuide.authenticated,true);assert.equal($('#account-dialog').open,false);
    assert.equal(w.YTGuide.state.saved[0].title,'Cloud lesson');
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
