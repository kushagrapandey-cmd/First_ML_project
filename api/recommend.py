"""Explainable, query-to-video TF-IDF retrieval. No pickles or paid AI service."""
import json
import math
import os
import re
import time
import threading
import logging
import unicodedata
from collections import Counter
from pathlib import Path
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse, urlencode
from urllib.request import urlopen

TOPICS = {
    'custom': {'name': 'Other topic', 'query': '', 'hint': 'Enter the topic you want to learn'},
    'python': {'name': 'Python', 'query': 'Python programming tutorial', 'hint': 'Variables, functions, and your first projects'},
    'web': {'name': 'Web development', 'query': 'HTML CSS JavaScript web development tutorial', 'hint': 'Build responsive websites from the ground up'},
    'java': {'name': 'Java', 'query': 'Java programming tutorial', 'hint': 'Learn the language and object-oriented thinking'},
    'ml': {'name': 'Machine learning', 'query': 'machine learning neural networks tutorial', 'hint': 'Understand models, training, and prediction'},
    'sql': {'name': 'SQL & databases', 'query': 'SQL database queries joins tutorial', 'hint': 'Turn data into answers with SQL'},
    'linux': {'name': 'Linux & Bash', 'query': 'Linux terminal Bash commands tutorial', 'hint': 'Get comfortable in the terminal'},
    'dsa': {'name': 'Data structures', 'query': 'data structures algorithms tutorial', 'hint': 'Learn to reason about efficient programs'},
}
CATALOG = json.loads(Path(__file__).with_name('catalog.json').read_text())
STOP = set('i want me please about understand learning basics introduction a an the and or for to in of on with is are how what learn tutorial full course beginners beginner video'.split())
CACHE = {}
LOCK = threading.Lock()


def tokens(text):
    text=unicodedata.normalize('NFKC',text).casefold()
    return [w for w in re.findall(r'[^\W_]+(?:[\u0900-\u097f]+)?',text,re.UNICODE) if w not in STOP]


def rank(rows, query, limit=5):
    """Fit smoothed IDF on candidates, then rank the actual query, not row zero.
    Greedy channel penalty gives other educators exposure; never invent quality labels.
    """
    rows = list({r['id']: r for r in rows if re.fullmatch(r'[\w-]{11}', r.get('id', ''), re.ASCII)}.values())
    docs = [tokens(' '.join([r['title'], r.get('tags', ''), r.get('description', '')])) for r in rows]
    if not docs:
        return []
    df = Counter(w for doc in docs for w in set(doc))
    idf = {w: math.log((1 + len(docs)) / (1 + n)) + 1 for w, n in df.items()}
    def vector(doc):
        weights = {w: (1 + math.log(n)) * idf[w] for w, n in Counter(doc).items() if w in idf}
        norm = math.sqrt(sum(v*v for v in weights.values())) or 1
        return {w: v/norm for w, v in weights.items()}
    q = vector(tokens(query))
    scored = []
    for row, doc in zip(rows, docs):
        v = vector(doc)
        score = sum(weight*v.get(w, 0) for w, weight in q.items())
        if score > 0:
            scored.append((score, row, sorted(set(doc) & set(q))))
    selected = []
    channels = Counter()
    while scored and len(selected) < limit:
        scored.sort(key=lambda x: (-x[0] / (1 + .25*channels[x[1]['channel']]), x[1]['id']))
        score, row, matched = scored.pop(0)
        selected.append({**row, 'similarity': round(score, 4), 'matched': matched[:6],
                         'reason': 'Matches ' + ', '.join(matched[:4])})
        channels[row['channel']] += 1
    return selected


def youtube_get(resource, params, key):
    url = 'https://www.googleapis.com/youtube/v3/' + resource + '?' + urlencode({**params, 'key': key})
    # Do not log request URLs: they contain the credential.
    with urlopen(url, timeout=7) as response:
        return json.load(response)


def seconds(iso):
    m = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso or '')
    return sum(int(v or 0)*n for v, n in zip(m.groups(), (3600, 60, 1))) if m else None


def live_candidates(topic, language, key, goal=''):
    # The specific question must participate in retrieval, not only reranking.
    goal = ' '.join(goal.lower().split())
    cache_key = (topic, language, goal)
    with LOCK:
        cached = CACHE.get(cache_key)
        if cached and time.time() - cached[0] < 900:
            if cached[1] is None:
                raise RuntimeError('Provider temporarily unavailable')
            return cached[1]
        try:
            if len(CACHE) >= 128:
                CACHE.pop(next(iter(CACHE)))
            query = ((('' if topic == 'custom' else TOPICS[topic]['name'] + ' ') + goal + ' tutorial') if goal else TOPICS[topic]['query']) + (' in Hindi' if language == 'hi' else '')
            params = dict(part='snippet', q=query, type='video', maxResults=25,
                          videoEmbeddable='true', videoSyndicated='true', safeSearch='strict', order='relevance')
            if language != 'any':
                params['relevanceLanguage'] = language
            search = youtube_get('search', params, key)
            ids = [r['id']['videoId'] for r in search.get('items', []) if 'videoId' in r.get('id', {})]
            if not ids:
                CACHE[cache_key] = (time.time(), [])
                return []
            details = youtube_get('videos', dict(part='snippet,contentDetails,status', id=','.join(ids)), key)
            rows = []
            for item in details.get('items', []):
                if not item.get('status', {}).get('embeddable') or item.get('status', {}).get('privacyStatus') != 'public':
                    continue
                s = item['snippet']
                if s.get('liveBroadcastContent') in ('live', 'upcoming'):
                    continue
                duration = seconds(item.get('contentDetails', {}).get('duration'))
                if duration is not None and duration < 180:
                    continue
                lang = (s.get('defaultAudioLanguage') or s.get('defaultLanguage') or 'unknown').split('-')[0]
                if language != 'any' and lang != language:
                    continue  # Strict when selected: unknown audio language cannot satisfy a language filter.
                rows.append(dict(id=item['id'], title=s['title'], channel=s['channelTitle'],
                                 description=s.get('description', '')[:1000], tags='', topic=topic,
                                 language=lang, level='unknown', duration=duration, source='youtube',
                                 publishedAt=s.get('publishedAt')))
            CACHE[cache_key] = (time.time(), rows)
            return rows
        except Exception:
            CACHE[cache_key] = (time.time(), None)  # Negative cache protects exhausted quota.
            raise


def recommend(params):
    topic = params.get('topic', 'python')
    language = params.get('language', 'any')
    goal = params.get('goal', '').strip()
    source = params.get('source', 'auto')
    length = params.get('length', 'any')
    if topic not in TOPICS or language not in ('any', 'en', 'hi') or source not in ('auto','catalogue','live') or length not in ('any','short','long') or len(goal) > 120:
        raise ValueError('Choose valid filters and a goal of at most 120 characters.')
    if topic == 'custom' and not tokens(goal):
        raise ValueError('Enter what you want to learn in the goal field.')
    key = os.environ.get('YOUTUBE_API_KEY', '')
    rows = []
    mode = 'catalogue'
    notice = 'Catalogue mode: maintained candidates, not a live YouTube search. Availability can change.'
    if source != 'catalogue' and key:
        try:
            rows = cached_live_candidates(topic, language, key, goal)
            mode = 'youtube'
            notice = 'Live YouTube candidates, cached for up to 15 minutes. Ranking estimates relevance, not teaching quality.'
        except Exception:
            if source == 'live':
                raise SearchUnavailable('Live YouTube search is unavailable or its quota is exhausted. Please retry later or choose Study catalogue.') from None
            logging.warning('youtube_provider_unavailable: using catalogue')
            notice = 'YouTube is temporarily unavailable or its quota is exhausted. Showing catalogue candidates instead.'
    elif source == 'live':
        raise SearchUnavailable('Live YouTube search is not configured. The site owner must add YOUTUBE_API_KEY. Choose Study catalogue for the limited collection.')
    if mode == 'catalogue':
        rows = [r for r in CATALOG if (topic == 'custom' or r['topic'] == topic) and (language == 'any' or r['language'] == language)]
    if length != 'any':
        rows = [r for r in rows if r.get('duration') is not None and ((r['duration'] <= 1800) if length == 'short' else (r['duration'] > 1800))]
    if goal:
        goal_terms = set(tokens(goal))
        if goal_terms:
            # A generic subject match cannot stand in for a specific learning goal.
            rows = [r for r in rows if len(goal_terms & set(tokens(' '.join([r['title'], r.get('tags',''), r.get('description','')])))) / len(goal_terms) >= (1 if mode == 'catalogue' else 0.5)]
        if mode == 'catalogue':
            notice += ' Results are limited to catalogue entries matching your goal; this is not a search of all YouTube.'
    query = goal if goal else TOPICS[topic]['query']
    ranked = rank(rows, query)
    return dict(videos=ranked, topic=topic, source=mode, notice=notice, candidates=len(rows),
                algorithm='TF-IDF cosine similarity + channel diversity', liveConfigured=bool(key))


def cached_live_candidates(topic,language,key,goal=''):
    if not os.environ.get('DATABASE_URL'):
        return live_candidates(topic,language,key,goal)
    from lib.search_cache import retrieve
    return retrieve(topic,language,goal,lambda:live_candidates(topic,language,key,goal))


class SearchUnavailable(Exception):
    pass


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if len(parsed.query) > 1000:
            return self.respond(400, {'error': 'Request is too long.'})
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        if params.get('action') == 'meta':
            return self.respond(200, dict(topics=TOPICS, catalogueCount=len(CATALOG), liveConfigured=bool(os.environ.get('YOUTUBE_API_KEY'))))
        try:
            result = recommend(params)
            self.respond(200, result)
        except SearchUnavailable as error:
            self.respond(503, {'error': str(error)})
        except ValueError as error:
            self.respond(400, {'error': str(error)})
        except Exception:
            logging.exception('recommendation_failed')
            self.respond(500, {'error': 'Recommendations are temporarily unavailable. Please try again.'})

    def do_POST(self):
        self.respond(405, {'error': 'Use GET for this endpoint.'}, {'Allow': 'GET'})

    def respond(self, status, body, headers=None):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
