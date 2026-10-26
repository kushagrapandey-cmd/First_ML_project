import {authURL} from '../lib/identity.js';
import {HttpError,assertOrigin,readBody,respond} from '../lib/validation.js';
const ALLOWED=new Set(['get-session','token','sign-up/email','sign-in/email','sign-out','request-password-reset','reset-password','send-verification-email','verify-email','email-otp/send-verification-otp','email-otp/verify-email','email-otp/reset-password','email-otp/passcode','forget-password/email-otp']);
export default async function handler(req,res) {
  try {
    assertOrigin(req);
    if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Method not allowed.'});
    const incoming=new URL(req.url,'https://'+req.headers.host);
    const path=String(req.query?.path||incoming.searchParams.get('path')||incoming.pathname.replace(/^\/api\/auth\/?/,''));
    if(!ALLOWED.has(path))return respond(res,404,{error:'Unknown authentication route.'});
    if(req.method==='GET'&&!['get-session','token','verify-email'].includes(path))return respond(res,405,{error:'Use POST.'});
    const target=new URL(authURL()+'/'+path);
    for(const [key,value] of incoming.searchParams)if(key!=='path'&&key!=='path*')target.searchParams.append(key,value);
    const origin=req.headers.origin||`https://${req.headers.host}`;
    const headers={'Accept':'application/json','Origin':origin};
    if(req.headers.cookie)headers.Cookie=req.headers.cookie;
    let body;
    if(req.method==='POST'){body=JSON.stringify(await readBody(req,15000));headers['Content-Type']='application/json';}
    const upstream=await fetch(target,{method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(15000)});
    res.statusCode=upstream.status;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    const cookies=upstream.headers.getSetCookie().map(c=>c.replace(/;\s*Domain=[^;]*/ig,''));
    if(cookies.length)res.setHeader('Set-Cookie',cookies);
    const jwt=upstream.headers.get('set-auth-jwt');if(jwt)res.setHeader('set-auth-jwt',jwt);
    // Email verification redirects may only return users to this app.
    const location=upstream.headers.get('location');
    if(location){const redirect=new URL(location,target);if(redirect.origin===origin)res.setHeader('Location',redirect.href);else return respond(res,400,{error:'Unexpected authentication redirect.'});}
    res.end(await upstream.text());
  }catch(error){
    if(error instanceof HttpError)return respond(res,error.status,{error:error.message});
    console.error('auth_proxy_unavailable',error.name);
    respond(res,503,{error:'Account service is temporarily unavailable. Please try again.'});
  }
}
