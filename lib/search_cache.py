"""Public candidate cache over Neon's serverless HTTP SQL protocol.

Protocol/endpoint/header contract follows @neondatabase/serverless 1.2.0.
Database leases, not session locks, coordinate independent HTTP connections.
"""
import hashlib
import json
import os
from urllib.parse import urlparse
from urllib.request import Request,urlopen

def query(sql,params=()):
    connection=os.environ['DATABASE_URL']
    host=urlparse(connection).hostname
    if not host or not host.endswith(('.neon.tech','.neon.build')):raise RuntimeError('Unsupported cache database')
    endpoint='https://api.'+host.split('.',1)[1]+'/sql'
    request=Request(endpoint,data=json.dumps({'query':sql,'params':[str(v) for v in params]}).encode(),headers={'Content-Type':'application/json','Neon-Connection-String':connection,'Neon-Raw-Text-Output':'true','Neon-Array-Mode':'true'},method='POST')
    with urlopen(request,timeout=min(20,float(os.environ.get("YTGUIDE_SQL_TIMEOUT","5")))) as response:return json.load(response)['rows']

def retrieve(topic,language,goal,fetch_candidates):
    key=hashlib.sha256(json.dumps([topic,language,' '.join(goal.casefold().split())],ensure_ascii=False).encode()).hexdigest()
    rows=query('SELECT payload FROM ytguide_search_cache WHERE cache_key=$1 AND expires_at>now()',(key,))
    if rows:
        payload=json.loads(rows[0][0])
        if isinstance(payload,dict) and payload.get('failed'):raise RuntimeError('Provider temporarily unavailable')
        return payload
    # Exactly one worker receives a short lease for this expired/missing key.
    lease=query("INSERT INTO ytguide_search_cache(cache_key,payload,expires_at,lease_until) VALUES($1,NULL,now(),now()+interval '30 seconds') ON CONFLICT(cache_key) DO UPDATE SET lease_until=EXCLUDED.lease_until WHERE ytguide_search_cache.expires_at<=now() AND (ytguide_search_cache.lease_until IS NULL OR ytguide_search_cache.lease_until<now()) RETURNING cache_key",(key,))
    if not lease:raise RuntimeError('Search is running; retry in a moment')
    budget=query("INSERT INTO ytguide_search_budget(day,units) VALUES(current_date,101) ON CONFLICT(day) DO UPDATE SET units=ytguide_search_budget.units+101 WHERE ytguide_search_budget.units+101<=8000 RETURNING units")
    failed=False
    try:
        if not budget:raise RuntimeError('Daily live-search budget reached')
        payload=fetch_candidates()
    except Exception:payload={'failed':True};failed=True
    query("UPDATE ytguide_search_cache SET payload=$2::jsonb,expires_at=now()+($3::integer * interval '1 second'),lease_until=NULL WHERE cache_key=$1",(key,json.dumps(payload,ensure_ascii=False),120 if failed else 900))
    if failed:raise RuntimeError('YouTube temporarily unavailable or daily search budget reached')
    return payload
