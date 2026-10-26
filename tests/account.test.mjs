import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {video,videoId,uuid,assertOrigin,readBody} from '../lib/validation.js';
import workspace from '../api/workspace.js';
import auth from '../api/auth.js';
const lesson={id:'_uQrJ0TkZlc',title:'Python',channel:'Teacher'};
function res(){return {headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};}
test('Reject malformed video URLs and excessive metadata',()=>{
  assert.throws(()=>videoId('https://youtube.com/watch?v=bad'));
  assert.throws(()=>video({...lesson,title:'x'.repeat(501)}));
  assert.throws(()=>video({...lesson,duration:-1}));
  assert.deepEqual(video(lesson).id,lesson.id);
});
test('Reject non-UUID collection identifiers',()=>assert.throws(()=>uuid("' OR true; --")));
test('Reject a hostile origin before any authentication or SQL',()=>assert.throws(()=>assertOrigin({headers:{host:'ytguide-five.vercel.app',origin:'https://attacker.example'}})));
test('Allow the exact application origin',()=>assert.doesNotThrow(()=>assertOrigin({headers:{host:'ytguide-five.vercel.app',origin:'https://ytguide-five.vercel.app'}})));
test('Reject non-JSON and oversized request bodies',async()=>{
  await assert.rejects(readBody({headers:{'content-type':'text/plain'},body:'{}'}));
  await assert.rejects(readBody({headers:{'content-type':'application/json'},body:{x:'x'.repeat(101)}},100));
  const request=Readable.from(['{"test":true}']);request.headers={'content-type':'application/json'};
  assert.deepEqual(await readBody(request),{test:true});
});
test('Workspace denies unauthenticated direct API access',async()=>{
  const response=res();await workspace({method:'GET',url:'/api/workspace',headers:{host:'localhost:3000'}},response);
  assert.equal(response.statusCode,401);assert.match(response.body.error,/sign in/i);
});
test('Public config exposes no database credentials',async()=>{
  const response=res();await workspace({method:'GET',url:'/api/workspace?action=config',headers:{host:'localhost:3000'}},response);
  assert.equal(response.statusCode,200);assert.deepEqual(Object.keys(response.body).sort(),['accountsConfigured','authPath','guestMode']);
});
test('Authentication proxy cannot forward arbitrary provider routes',async()=>{
  const response=res();await auth({method:'GET',url:'/api/auth?path=admin/list-users',headers:{host:'localhost:3000'}},response);
  assert.equal(response.statusCode,404);
});
test('Authentication mutations reject GET requests',async()=>{
  const response=res();await auth({method:'GET',url:'/api/auth?path=sign-out',headers:{host:'localhost:3000'}},response);
  assert.equal(response.statusCode,405);
});
