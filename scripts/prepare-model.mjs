import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
const revision='2c4055b12046f11709e9df2c122e59ffbdc2f900';
const root=new URL('../models/semantic/',import.meta.url);await mkdir(root,{recursive:true});
const files=[['onnx/model_quantized.onnx','model.onnx','66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc'],['tokenizer.json','tokenizer.json','b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441']];
for(const [remote,local,hash] of files){
 const destination=new URL(local,root);
 let current;try{current=await readFile(destination);}catch{}
 if(current&&createHash('sha256').update(current).digest('hex')===hash)continue;
 const response=await fetch(`https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/${revision}/${remote}`,{signal:AbortSignal.timeout(240000)});
 if(!response.ok)throw new Error('Pinned semantic asset download failed: HTTP '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('Semantic asset checksum mismatch');
 await writeFile(new URL(local+'.tmp',root),bytes);await rename(new URL(local+'.tmp',root),destination);
 console.log('Verified semantic asset',local,bytes.length,'bytes');
}
