import {createRemoteJWKSet,jwtVerify} from 'jose';
import {HttpError} from './validation.js';
let keySet;
export function authURL() {
  const url=process.env.NEON_AUTH_BASE_URL?.replace(/\/$/,'');
  if(!url || !url.startsWith('https://'))throw new HttpError(503,'Account service is not configured. Guest mode is available.');
  return url;
}
export async function authenticate(req) {
  const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.authorization||'');
  if(!match || match[1].length>10000)throw new HttpError(401,'Please sign in to sync your workspace.');
  const base=authURL();
  keySet ||= createRemoteJWKSet(new URL(base+'/.well-known/jwks.json'),{timeoutDuration:7000});
  try {
    const {payload}=await jwtVerify(match[1],keySet,{algorithms:['EdDSA'],issuer:new URL(base).origin,audience:new URL(base).origin,requiredClaims:['sub','iat','exp']});
    if(!payload.sub || payload.banned===true)throw new Error('Account unavailable');
    return {id:payload.sub,name:typeof payload.name==='string'?payload.name.slice(0,100):'Learner'};
  } catch {throw new HttpError(401,'Your session expired. Please sign in again.');}
}
