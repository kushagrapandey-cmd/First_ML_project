import {createHash, createHmac} from 'node:crypto';
import {getSQL} from '../lib/db.js';
import {assertOrigin, HttpError, readBody, respond} from '../lib/validation.js';

const RECIPIENT='kushagrapandey102@gmail.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateFeedback(body) {
  if(!body || typeof body!=='object' || Array.isArray(body))throw new HttpError(400,'Enter a feedback message.');
  if(typeof body.website==='string' && body.website.trim())return null;
  const {name='',email='',message,requestId}=body;
  if(typeof name!=='string' || name.length>100 || /[\x00-\x1f\x7f]/.test(name))throw new HttpError(400,'Use a name of at most 100 characters.');
  if(typeof email!=='string' || email.length>254 || (email.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))throw new HttpError(400,'Enter a valid reply email, or leave it empty.');
  if(typeof message!=='string' || message.trim().length<10 || message.length>3000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message))throw new HttpError(400,'Write between 10 and 3,000 characters of feedback.');
  if(typeof requestId!=='string' || !UUID.test(requestId))throw new HttpError(400,'Refresh the page and try again.');
  return {name:name.trim(),email:email.trim(),message:message.trim(),requestId};
}

async function reserveFeedback(req) {
  const sql=getSQL(),now=Date.now();
  // Only short-lived HMAC identifiers are stored, never raw addresses or feedback bodies.
  const address=String(req.headers['x-vercel-forwarded-for']||req.headers['x-real-ip']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const digest=createHmac('sha256',process.env.RESEND_API_KEY).update(address).digest('hex');
  const ipKey=`ip:${Math.floor(now/900000)}:${digest}`,dayKey=`day:${Math.floor(now/86400000)}`;
  const results=await sql.transaction([
    sql`DELETE FROM ytguide_feedback_limits WHERE created_at < now()-interval '2 days'`,
    sql`INSERT INTO ytguide_feedback_limits(bucket,hits) VALUES(${ipKey},1)
      ON CONFLICT(bucket) DO UPDATE SET hits=ytguide_feedback_limits.hits+1
      WHERE ytguide_feedback_limits.hits<3 RETURNING hits`,
    sql`INSERT INTO ytguide_feedback_limits(bucket,hits) VALUES(${dayKey},1)
      ON CONFLICT(bucket) DO UPDATE SET hits=ytguide_feedback_limits.hits+1
      WHERE ytguide_feedback_limits.hits<20 RETURNING hits`
  ]);
  return results[1].length>0 && results[2].length>0;
}

async function sendFeedback(feedback) {
  const {name,email,message,requestId}=feedback;
  const payload={from:'YTGuide Feedback <onboarding@resend.dev>',to:[RECIPIENT],
    subject:'YTGuide — new website feedback',
    text:`New feedback from YTGuide\n\nName: ${name||'Not provided'}\nReply email: ${email||'Not provided'}\n\n${message}\n\nSubmitted through https://ytguide-five.vercel.app/`};
  if(email)payload.reply_to=email;
  const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`ytguide-feedback/${requestId}/${hash}`},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  const data=await response.json();
  if(!response.ok || !data.id)throw new Error('Email provider did not accept feedback');
  console.info('feedback_email_accepted',data.id);
}

export async function handleFeedback(req,res,{reserve=reserveFeedback,send=sendFeedback}={}) {
  try {
    if(req.method!=='POST'){res.setHeader('Allow','POST');throw new HttpError(405,'Use the feedback form to send a message.');}
    assertOrigin(req);
    const feedback=validateFeedback(await readBody(req,10000));
    if(!feedback)return respond(res,200,{ok:true});
    if(!process.env.RESEND_API_KEY || !process.env.DATABASE_URL)throw new HttpError(503,'Feedback is temporarily unavailable. Please use the email link.');
    if(!await reserve(req)){res.setHeader('Retry-After','900');throw new HttpError(429,'The feedback limit has been reached. Please try later or use the email link.');}
    await send(feedback);
    return respond(res,200,{ok:true,message:'Your feedback has been sent. Thank you!'});
  } catch(error) {
    if(!(error instanceof HttpError))console.warn('feedback_delivery_unavailable');
    return respond(res,error.status||503,{error:error instanceof HttpError?error.message:'We could not confirm your message was sent. Please retry or use the email link.'});
  }
}
export default handleFeedback;
