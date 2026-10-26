"""Quantized multilingual sentence embeddings with bounded in-process caching.

No remote inference service, user-note training, or generative text is involved.
"""
import importlib.util
import os
import threading
from collections import OrderedDict,Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/'models'/'semantic'
MODEL_ID='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
LOCK=threading.RLock()
SESSION=None
TOKENIZER=None
VECTORS=OrderedDict()

def available():
    return os.environ.get('YTGUIDE_SEMANTIC_ENABLED','1')!='0' and (ROOT/'model.onnx').is_file() and (ROOT/'tokenizer.json').is_file() and importlib.util.find_spec('onnxruntime') is not None and importlib.util.find_spec('tokenizers') is not None

def embeddings(texts):
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer
    global SESSION,TOKENIZER
    texts=[' '.join(str(t).split())[:2000] for t in texts]
    with LOCK:
        if SESSION is None:
            options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
            options.add_session_config_entry('session.intra_op.allow_spinning','0')
            SESSION=ort.InferenceSession(str(ROOT/'model.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
            TOKENIZER=Tokenizer.from_file(str(ROOT/'tokenizer.json'));TOKENIZER.enable_truncation(max_length=128);TOKENIZER.enable_padding()
        missing=list(dict.fromkeys(t for t in texts if t not in VECTORS))
        for offset in range(0,len(missing),16):
            batch=missing[offset:offset+16];encoded=TOKENIZER.encode_batch(batch)
            ids=np.asarray([e.ids for e in encoded],dtype=np.int64)
            mask=np.asarray([e.attention_mask for e in encoded],dtype=np.int64)
            feed={'input_ids':ids,'attention_mask':mask}
            if any(i.name=='token_type_ids' for i in SESSION.get_inputs()):feed['token_type_ids']=np.asarray([e.type_ids for e in encoded],dtype=np.int64)
            hidden=SESSION.run(None,feed)[0]
            weighted=mask[...,None].astype(np.float32)
            pooled=(hidden*weighted).sum(axis=1)/np.maximum(weighted.sum(axis=1),1)
            pooled/=np.maximum(np.linalg.norm(pooled,axis=1,keepdims=True),1e-12)
            for text,vector in zip(batch,pooled):VECTORS[text]=vector.astype(np.float32)
        result=np.stack([VECTORS[t] for t in texts])
        for text in texts:VECTORS.move_to_end(text)
        while len(VECTORS)>1024:VECTORS.popitem(last=False)
        return result

def rank(rows,query,lexical_rank,limit=5):
    if not rows:return []
    vectors=embeddings([query]+[' '.join([r['title'],r.get('tags',''),r.get('description','')]) for r in rows])
    similarities=vectors[1:]@vectors[0]
    lexical={r['id']:r['similarity'] for r in lexical_rank(rows,query,limit=len(rows))}
    candidates=[]
    for row,similarity in zip(rows,similarities):
        semantic=float(similarity)
        if semantic<0.30:continue
        score=.8*semantic+.2*lexical.get(row['id'],0)
        candidates.append((score,semantic,row))
    selected=[];channels=Counter()
    while candidates and len(selected)<limit:
        candidates.sort(key=lambda v:(-v[0]/(1+.15*channels[v[2]['channel']]),v[2]['id']))
        score,semantic,row=candidates.pop(0)
        selected.append({**row,'similarity':round(score,4),'semanticSimilarity':round(semantic,4),'reason':'Meaning-aware match to your learning goal, combined with keyword relevance','ranking':'hybrid'})
        channels[row['channel']]+=1
    return selected
