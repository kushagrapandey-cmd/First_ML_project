import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import workspace from '../api/workspace.js';
import authProxy from '../api/auth.js';
import {decodeJwt,decodeProtectedHeader} from 'jose';
import {getSQL} from '../lib/db.js';
if(process.env.VERCEL_ENV!=='preview') {
  console.log('Cloud fixture tests run only against preview branches.');
} else {
  const base=process.env.NEON_AUTH_BASE_URL?.replace(/\/$/,'');
  if(!base)throw new Error('Preview auth is missing');
  const host=process.env.VERCEL_URL,origin='https://'+host;
  const fixtures=[];
  async function provider(path,body,cookie='') {
    const response=await fetch(base+'/'+path,{method:body?'POST':'GET',headers:{Origin:origin,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const value=await response.json().catch(()=>({}));
    return {response,value,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
  }
  async function proxy(path,body,cookie='') {
    let status=200,raw='';const headers={};
    await authProxy({method:body?'POST':'GET',url:'/api/auth/'+path,headers:{host,origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body},{set statusCode(v){status=v;},setHeader(k,v){headers[k.toLowerCase()]=v;},end(value){raw=value;}});
    const cookieHeaders=headers['set-cookie']||[];
    assert.ok(cookieHeaders.every(c=>!/[; ]Domain=/i.test(c)),'Provider-domain cookies must be scoped to the application');
    return {response:{ok:status>=200&&status<300,status},value:JSON.parse(raw||'null'),cookie:cookieHeaders.map(c=>c.split(';')[0]).join('; ')};
  }
  async function account(){
    const password=randomBytes(32).toString('base64url');
    const signup=await proxy('sign-up/email',{name:'YTGuide QA fixture',email:'qa-'+randomUUID()+'@example.invalid',password});
    if(!signup.response.ok||!signup.value.user)throw new Error('Preview signup fixture failed: HTTP '+signup.response.status+' '+(signup.value.code||''));
    const fixture={id:signup.value.user.id,password,cookie:signup.cookie};fixtures.push(fixture);
    const token=await proxy('token',null,fixture.cookie);
    if(!token.value.token)throw new Error('Preview signup did not produce an authenticated session: '+(token.value.code||token.response.status));
    fixture.token=token.value.token;const claims=decodeJwt(fixture.token);console.log('QA_JWT_CONTRACT',JSON.stringify({algorithm:decodeProtectedHeader(fixture.token).alg,issuerMatchesOrigin:claims.iss===new URL(base).origin,issuerMatchesBase:claims.iss===base,audienceMatchesOrigin:claims.aud===new URL(base).origin,audienceMatchesBase:claims.aud===base,expiresIn:claims.exp-Math.floor(Date.now()/1000)}));return fixture;
  }
  async function call(fixture,body,expected=200){
    let status,result;
    const req={method:body?'POST':'GET',url:'/api/workspace',headers:{host,origin,authorization:'Bearer '+fixture.token,'content-type':'application/json'},body};
    const res={set statusCode(v){status=v;},setHeader(){},end(value){result=JSON.parse(value);}};
    await workspace(req,res);assert.equal(status,expected,JSON.stringify({status,error:result.error,expected}));return result;
  }
  try{
    const a=await account(),b=await account();
    const video={id:'_uQrJ0TkZlc',title:'QA Python lesson',channel:'QA fixture',duration:22447,topic:'python'};
    await call(a,{action:'lesson',video,patch:{saved:true,completed:true,position:755}});
    const first=await call(a,{action:'note',video,content:'Device one note',version:0});
    assert.equal(first.note.version,1);
    await call(a,{action:'note',video,content:'Device two note',version:1});
    const conflict=await call(a,{action:'note',video,content:'Stale device draft',version:1},409);
    assert.equal(conflict.note.content,'Device two note');
    const collection=randomUUID();await call(a,{action:'createCollection',id:collection,name:'QA private collection'});
    await call(a,{action:'membership',video,collectionId:collection,add:true});
    await call(b,{action:'membership',video,collectionId:collection,add:true},404);
    await call(b,{action:'renameCollection',id:collection,name:'Not yours'},404);
    await call(b,{action:'deleteCollection',id:collection});
    const own=await call(a),other=await call(b);
    assert.equal(own.workspace.lessons[0].position_seconds,755);
    assert.equal(own.workspace.collections.length,1);
    assert.equal(other.workspace.notes.length,0);
    assert.equal(other.workspace.lessons.length,0);
    const bookmark=randomUUID();await call(a,{action:'bookmark',id:bookmark,video,seconds:755,label:'QA timestamp'});
    const importId=randomUUID(),importPayload={action:'import',id:importId,collections:[],lessons:[{video,saved:true,completed:true,position:800,note:'Guest note must not overwrite cloud',bookmarks:[],collections:[]}]};
    await call(a,importPayload);const retry=await call(a,importPayload);assert.equal(retry.alreadyImported,true);
    const after=await call(a);assert.equal(after.workspace.notes[0].content,'Device two note');assert.equal(after.workspace.lessons[0].position_seconds,800);assert.equal(after.workspace.bookmarks.length,1);
    const invalid={...a,token:a.token.slice(0,-8)+'invalidx'};await call(invalid,null,401);
    const logout=await proxy('sign-out',{},a.cookie);assert.ok(logout.response.ok);
    const session=await proxy('get-session',null,a.cookie);assert.ok(!session.value?.user);
    console.log('CLOUD_QA_PASS: same-origin auth proxy cookies, managed signup/session/JWT, workspace CRUD, two-user isolation, note conflicts, timestamp progress, idempotent import, logout, forged-token rejection.');
  } finally {
    for(const fixture of fixtures){
      // Fixtures live only in the isolated preview branch. Never touch pre-existing users.
      await getSQL()`DELETE FROM learner_profiles WHERE user_id=${fixture.id}`;
      await provider('delete-user',{password:fixture.password},fixture.cookie).catch(()=>null);
    }
  }
}
