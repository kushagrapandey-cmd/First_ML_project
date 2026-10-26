export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const videoId = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(value)) throw new HttpError(400, 'Invalid video ID.');
  return value;
};
export const uuid = (value) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'Invalid record ID.');
  return value;
};
export function text(value, max, name, allowEmpty = true) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new HttpError(400, `Invalid ${name}.`);
  return value;
}
export function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, `Invalid ${name}.`);
  return value;
}
export function video(value) {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'A lesson is required.');
  return {id: videoId(value.id),title:text(value.title,500,'title',false),channel:text(value.channel,200,'channel',false),
    topic:typeof value.topic === 'string' ? value.topic.slice(0,40) : '',
    language:typeof value.language === 'string' ? value.language.slice(0,20) : 'unknown',
    duration:value.duration == null ? null : integer(value.duration,0,604800,'duration'),
    source:['catalogue','youtube'].includes(value.source) ? value.source : 'catalogue'};
}
export function assertOrigin(req) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (!host || (origin && origin !== `https://${host}` && !(host.startsWith('localhost:') && origin === `http://${host}`))) throw new HttpError(403,'Request origin is not allowed.');
  if (!origin && ['cross-site','same-site'].includes(req.headers['sec-fetch-site'])) throw new HttpError(403,'Cross-origin requests are not allowed.');
}
export async function readBody(req, limit=200000) {
  if (!String(req.headers['content-type']||'').startsWith('application/json')) throw new HttpError(415,'Send JSON.');
  if (Number(req.headers['content-length']||0)>limit) throw new HttpError(413,'Request is too large.');
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw)>limit) throw new HttpError(413,'Request is too large.');
    try { return JSON.parse(raw); } catch { throw new HttpError(400,'Invalid JSON.'); }
  }
  let raw='';
  for await (const chunk of req) {raw+=chunk; if(Buffer.byteLength(raw)>limit)throw new HttpError(413,'Request is too large.');}
  try {return JSON.parse(raw);}catch{throw new HttpError(400,'Invalid JSON.');}
}
export function respond(res,status,data) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(data));
}
