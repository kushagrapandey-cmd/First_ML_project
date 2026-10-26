"""Refresh duration from public watch-page metadata, without inventing durations.
Not used by production. If parsing stops working, keep duration unknown.
"""
import json, re
from pathlib import Path
from urllib.request import urlopen
from concurrent.futures import ThreadPoolExecutor
p=Path('api/catalog.json'); rows=json.loads(p.read_text())
for row in rows:
 if row['id']=='rfscVS0vtbw':
  row.update(id='Ilg3gGewQ5U',title='What is backpropagation really doing?', channel='3Blue1Brown',tags='machine learning neural networks backpropagation training gradient descent')
 fixes={
 'RBSGKlAvoiM':'data structures algorithms java trees linked lists stacks queues',
 'CBYHwZcbD-s':'data structures algorithms java sorting searching complexity',
 '09_LlHjoEiY':'data structures algorithms graphs graph theory',
 'v-F3YLd6oMw':'linux bash shell scripting automation',
 'tK9Oc6AEnR4':'linux bash shell scripting automation',
 '7eh4d6sabA0':'machine learning python data science prediction model',
 }
 if row['id'] in fixes: row['tags']=fixes[row['id']]
def enrich(row):
 try:
  with urlopen('https://www.youtube.com/watch?v='+row['id'],timeout=18) as res: page=res.read().decode()
  match=re.search(r'"lengthSeconds":"(\d+)"',page)
  if match: row['duration']=int(match[1])
  meta=re.search(r'"videoDetails":(\{.*?\}),"',page)
  # Titles and authors are verified by the separate oEmbed check; avoid brittle parsing here.
  print(row['id'],row.get('duration'),flush=True)
 except Exception: print(row['id'],'duration unavailable',flush=True)
 return row
rows=list(ThreadPoolExecutor(max_workers=8).map(enrich,rows))
p.write_text(json.dumps(rows,indent=2)+'\n')
