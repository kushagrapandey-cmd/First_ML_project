import json,pickle,io,re,urllib.request,time,sys
from pathlib import Path
from collections import Counter
class DataOnly(pickle.Unpickler):
 def find_class(self,*args):raise ValueError('No executable pickle globals')
raw=DataOnly(io.BytesIO(Path('legacy/Ytvideoes2.pkl').read_bytes())).load()
clean={}
for i in raw['videoId']:
 ident=str(raw['videoId'][i]).strip()
 if not re.fullmatch(r'[A-Za-z0-9_-]{11}',ident):continue
 row={'id':ident,'originalTitle':str(raw['title'][i]).strip(),'channel':str(raw['channelTitle'][i]).strip(),'originalTopic':' '.join(str(raw['OnSearching'][i]).casefold().split()),'publishedAt':str(raw['publishedAt'][i]),'metadataVerified':False,'source':'original-workshop'}
 clean.setdefault(ident,row)
Path('data/legacy_clean.json').write_text(json.dumps(list(clean.values()),ensure_ascii=False,indent=2)+'\n')
active=json.loads(Path('api/catalog.json').read_text());byid={v['id']:v for v in active}
# Refresh is explicit so running the cleaner never silently spends provider quota.
for topic,goal in ([('python','decorators'),('sql','joins'),('custom','Kubernetes networking')] if '--refresh-focused' in sys.argv else []):
 from urllib.parse import urlencode
 url='https://ytguide-five.vercel.app/api/recommend?'+urlencode({'topic':topic,'goal':goal,'source':'live','language':'en'})
 try:
  response=json.load(urllib.request.urlopen(url,timeout=35))
  assert response['source']=='youtube'
  for v in response['videos']:
   v={k:value for k,value in v.items() if k not in ['similarity','reason','matched']}
   v['metadataCheckedAt']=time.strftime('%Y-%m-%d',time.gmtime());v['source']='catalogue';v['tags']=('python decorators functions' if topic=='python' else 'sql joins tables' if topic=='sql' else 'kubernetes networking pods services dns');v['metadataProvenance']='YouTube Data API via verified live retrieval';v['level']='unknown'
   byid[v['id']]=v
  print('Verified focused lessons',topic,len(response['videos']))
 except Exception as e:print('Focused topic unavailable',topic,type(e).__name__)
active=list(byid.values());Path('api/catalog.json').write_text(json.dumps(active,ensure_ascii=False,indent=2)+'\n')
manifest={'originalRows':176,'originalUniqueVideos':len(set(str(v).strip() for v in raw['videoId'].values())),'cleanedLegacyVideos':len(clean),'duplicateOccurrencesRemoved':176-len(set(str(v).strip() for v in raw['videoId'].values())),'malformedUniqueIdsRemoved':len(set(str(v).strip() for v in raw['videoId'].values()))-len(clean),'activeCatalogueVideos':len(active),'activeTopics':dict(Counter(v['topic'] for v in active)),'legacyPolicy':'Cleaned legacy candidates are preserved separately; no unverified legacy rows are silently promoted into the active catalogue.','training':'Pretrained embeddings are used for inference. No claim of training this neural model on the workshop dataset.','sources':['legacy/Ytvideoes2.pkl','api/catalog.json','YouTube Data API metadata']}
Path('data/dataset_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest))
