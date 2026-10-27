import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {handleFeedback} from '../api/feedback.js';

const body={name:'QA',email:'reply@example.com',message:'The focused lessons are helpful.',requestId:'84637000-139d-4df6-8461-c0b33e9a7300',website:''};
const req=(patch={})=>({method:'POST',headers:{host:'ytguide.test',origin:'https://ytguide.test','content-type':'application/json'},body:{...body},...patch});
async function invoke(request,deps={}) {
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.data=JSON.parse(v);}};
  await handleFeedback(request,res,deps);return res;
}
test('Feedback rejects hostile origins, oversized payloads, invalid contact details and short messages before sending',async()=>{
  let calls=0;const deps={reserve:async()=>{calls++;return true;},send:async()=>{calls++;}};
  assert.equal((await invoke(req({headers:{host:'ytguide.test',origin:'https://other.test'}}),deps)).statusCode,403);
  assert.equal((await invoke(req({body:{...body,message:'x'.repeat(11000)}}),deps)).statusCode,413);
  assert.equal((await invoke(req({body:{...body,email:'a@example.com\r\nBcc: attacker@example.com'}}),deps)).statusCode,400);
  assert.equal((await invoke(req({body:{...body,message:'tiny'}}),deps)).statusCode,400);
  assert.equal((await invoke(req({method:'GET'}),deps)).statusCode,405);
  assert.equal(calls,0);
});
test('Feedback honeypot suppresses email and shared limit rejects without sending',async()=>{
  const old={key:process.env.RESEND_API_KEY,db:process.env.DATABASE_URL};
  process.env.RESEND_API_KEY='fixture';process.env.DATABASE_URL='fixture';
  try {
    let sent=0;const deps={reserve:async()=>false,send:async()=>{sent++;}};
    assert.equal((await invoke(req({body:{...body,website:'spam'}}),deps)).statusCode,200);
    const limited=await invoke(req(),deps);assert.equal(limited.statusCode,429);assert.equal(limited.headers['Retry-After'],'900');assert.equal(sent,0);
  } finally {restore(old);}
});
test('Feedback recipient and subject are server-owned; retries reuse the provider idempotency key',async()=>{
  const old={key:process.env.RESEND_API_KEY,db:process.env.DATABASE_URL},fetch=globalThis.fetch;
  process.env.RESEND_API_KEY='fixture';process.env.DATABASE_URL='fixture';
  const sends=[];globalThis.fetch=async(url,options)=>{sends.push({url,...options});return {ok:true,json:async()=>({id:'fixture-email-id'})};};
  try {
    for(let n=0;n<2;n++)assert.equal((await invoke(req({body:{...body,to:'attacker@example.com',subject:'Injected'}}),{reserve:async()=>true})).statusCode,200);
    const payload=JSON.parse(sends[0].body);assert.deepEqual(payload.to,['kushagrapandey102@gmail.com']);assert.equal(payload.reply_to,body.email);
    assert.equal(payload.subject,'YTGuide — new website feedback');assert.equal(payload.html,undefined);
    assert.equal(sends[0].headers['Idempotency-Key'],sends[1].headers['Idempotency-Key']);
  } finally {globalThis.fetch=fetch;restore(old);}
});
test('Feedback does not claim success when provider or configuration fails',async()=>{
  const old={key:process.env.RESEND_API_KEY,db:process.env.DATABASE_URL};
  delete process.env.RESEND_API_KEY;
  try {
    assert.equal((await invoke(req())).statusCode,503);
    process.env.RESEND_API_KEY='fixture';process.env.DATABASE_URL='fixture';
    const result=await invoke(req(),{reserve:async()=>true,send:async()=>{throw new Error('private provider detail');}});
    assert.equal(result.statusCode,503);assert.equal(result.data.ok,undefined);assert.ok(!JSON.stringify(result.data).includes('private provider detail'));
  } finally {restore(old);}
});
function restore(old){for(const [name,value] of [['RESEND_API_KEY',old.key],['DATABASE_URL',old.db]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}

test('Footer feedback retains failed drafts, blocks duplicate clicks and resets only confirmed sends',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const script=await readFile(new URL('../public/feedback.js',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://ytguide.test',runScripts:'outside-only'}),w=dom.window;
  w.AbortSignal=AbortSignal;let calls=[],resolve;
  w.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Promise(r=>{resolve=r;});};
  w.eval(script);
  try {
    const form=w.document.querySelector('#feedback-form'),message=w.document.querySelector('#feedback-message'),status=w.document.querySelector('#feedback-status');
    message.value=body.message;
    const submit=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    submit();submit();assert.equal(calls.length,1);assert.equal(form.getAttribute('aria-busy'),'true');
    resolve({ok:false,json:async()=>({error:'Please retry later.'})});await new Promise(r=>setImmediate(r));
    assert.equal(message.value,body.message);assert.equal(status.dataset.state,'error');
    submit();assert.equal(calls[0].body.requestId,calls[1].body.requestId);
    resolve({ok:true,json:async()=>({ok:true})});await new Promise(r=>setImmediate(r));
    assert.equal(message.value,'');assert.equal(status.dataset.state,'success');assert.equal(form.hasAttribute('aria-busy'),false);
    assert.equal(w.localStorage.length,0);
  } finally {dom.window.close();}
});
