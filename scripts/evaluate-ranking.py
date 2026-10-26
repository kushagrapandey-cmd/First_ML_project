"""A small, manually authored topic-relevance smoke benchmark, not a quality study."""
import json,sys,time,platform
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from api.recommend import rank,CATALOG
from lib import semantic
from lib.query import normalize,anchored
CASES=[
 ('decorate a function without rewriting it','decorators'),
 ('wrap functions to add extra behavior','decorators'),
 ('python decorators','decorators'),
 ('combine rows from two tables','sql'),
 ('matching records across database tables','sql'),
 ('दो तालिकाओं को जोड़ना','sql'),
 ('डेटाबेस से जानकारी निकालना','sql'),
 ('sql joins','sql'),
 ('how pods communicate in a cluster','kubernetes'),
 ('traffic between containers and services','kubernetes'),
 ('kubernetes networking','kubernetes'),
 ('learn to write command line automation','linux'),
 ('automate repetitive terminal tasks with scripts','linux'),
 ('linux commands','linux'),
 ('make web pages with markup and styling','web'),
 ('html css website','web'),
 ('understand neural networks and gradient descent','ml'),
 ('how a model learns by correcting its errors','ml'),
 ('efficient algorithms and data structures','dsa'),
 ('graphs and shortest paths','dsa'),
 ('learn java object oriented programming','java'),
 ('पायथन सीखना है','python'),
 ('python programming for a beginner','python'),
 ('जावा प्रोग्रामिंग सीखना','java')]
def relevant(row,label):
 if label=='decorators':return 'decorator' in row['title'].casefold()
 if label=='kubernetes':return 'kubernetes' in (row['title']+' '+row.get('tags','')).casefold()
 return row['topic']==label
results=[];cold=None
for text,label in CASES:
 query=normalize(text);rows=anchored(CATALOG,query)
 lexical=rank(rows,query)
 started=time.perf_counter();neural=semantic.rank(rows,query,rank);ms=(time.perf_counter()-started)*1000
 if cold is None:cold=ms
 result={'query':text,'expected':label,'lexicalTop1':bool(lexical and relevant(lexical[0],label)),'hybridTop1':bool(neural and relevant(neural[0],label)),'lexicalRR':next((1/(i+1) for i,r in enumerate(lexical) if relevant(r,label)),0),'hybridRR':next((1/(i+1) for i,r in enumerate(neural) if relevant(r,label)),0),'hybridMs':round(ms,2),'lexicalIds':[r['id'] for r in lexical],'hybridIds':[r['id'] for r in neural]}
 results.append(result)
summary={'model':semantic.MODEL_ID,'cases':len(results),'candidateVideos':len(CATALOG),'method':'Manually authored topic/intent relevance smoke set. Same candidate catalogue and technology-name normalization for both rankers. Not independently judged teaching quality or a broad held-out study.','lexicalTop1':sum(r['lexicalTop1'] for r in results),'hybridTop1':sum(r['hybridTop1'] for r in results),'lexicalMRR5':round(sum(r['lexicalRR'] for r in results)/len(results),3),'hybridMRR5':round(sum(r['hybridRR'] for r in results)/len(results),3),'coldInferenceMs':round(cold,2),'warmMedianMs':round(sorted(r['hybridMs'] for r in results[1:])[len(results[1:])//2],2),'environment':platform.platform(),'casesDetailed':results}
Path('data/ranking_evaluation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='casesDetailed'},indent=2))
print('Hybrid misses:',[(r['query'],r['hybridIds'][:1]) for r in results if not r['hybridTop1']])
if summary['hybridTop1']<summary['lexicalTop1'] or summary['hybridMRR5']<summary['lexicalMRR5']:raise SystemExit('Semantic release gate failed: worse relevance on smoke set')
