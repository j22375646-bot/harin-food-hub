'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const MODEL='gemini-3.1-flash-image',LIMIT=10,MAX_BYTES=10*1024*1024;
const fail=code=>{throw Object.assign(Error(code),{code});};
async function generateImage({key,prompt,signal,fetchImpl=fetch}){
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(abort,90000);let reader;
 try{
  const r=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',redirect:'error',signal:controller.signal,headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:'Create exactly one editorial image for a Korean food brand blog. Do not invent certifications, health claims, product labels or customer reviews. No text or logos. Scene requested by the user: '+prompt}]}],generationConfig:{responseModalities:['IMAGE'],candidateCount:1,maxOutputTokens:2048,imageConfig:{aspectRatio:'1:1',imageSize:'1K'}}})});
  if(!r.ok)fail([401,403].includes(r.status)?'KEY_REQUIRED':r.status===429?'PROVIDER_LIMIT':'PROVIDER_ERROR');
  if(Number(r.headers.get('content-length'))>MAX_BYTES)fail('INVALID_OUTPUT');
  reader=r.body?.getReader();if(!reader)fail('INVALID_OUTPUT');let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)fail('INVALID_OUTPUT');chunks.push(Buffer.from(value));}
  const json=JSON.parse(Buffer.concat(chunks).toString('utf8'));const candidate=json.candidates?.[0];
  const parts=(candidate?.content?.parts||[]).filter(p=>p.inlineData&&!p.thought);
  if(json.promptFeedback?.blockReason||candidate?.finishReason!=='STOP'||parts.length!==1)fail('INVALID_OUTPUT');
  const {mimeType,data}=parts[0].inlineData;
  if(!['image/png','image/jpeg','image/webp'].includes(mimeType)||typeof data!=='string'||data.length>MAX_BYTES||! /^[A-Za-z0-9+/]+={0,2}$/.test(data))fail('INVALID_OUTPUT');
  return {dataUrl:`data:${mimeType};base64,${data}`};
 }catch(e){if(controller.signal.aborted)fail('TIMEOUT');if(['KEY_REQUIRED','PROVIDER_LIMIT','PROVIDER_ERROR','INVALID_OUTPUT'].includes(e.code))throw e;fail('PROVIDER_ERROR');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{await reader?.cancel();}catch{}}
}
function createImageService({read,write,generate=generateImage,now=Date.now}){
 let busy=false,controller=null,generation=0;
 const month=()=>new Date(now()+9*3600000).toISOString().slice(0,7);
 async function load(){const s=await read();if(!s)return {key:'',enabled:false,month:month(),requests:[]};if(typeof s.key!=='string'||typeof s.enabled!=='boolean'||!/^\d{4}-\d{2}$/.test(s.month)||!Array.isArray(s.requests)||s.requests.length>LIMIT||s.requests.some(x=>typeof x!=='string'))fail('STORAGE_ERROR');if(month()>s.month)return {...s,month:month(),requests:[]};return s;}
 const publicState=s=>({ok:true,enabled:s.enabled,keyPresent:!!s.key,model:MODEL,monthlyUsd:2,reserveUsd:.20,used:s.requests.length,remaining:LIMIT-s.requests.length,month:s.month});
 return {
  status:async()=>publicState(await load()),
  cancel:()=>{generation++;controller?.abort();return {ok:true};},
  async configure(v){if(busy)fail('PENDING');busy=true;try{if(!v||Object.keys(v).sort().join(',')!=='confirmed,enabled,key'||typeof v.key!=='string'||typeof v.enabled!=='boolean'||v.confirmed!==true||v.key&&!/^AIza[A-Za-z0-9_-]{30,100}$/.test(v.key))fail('INVALID_REQUEST');const s=await load();s.key=v.key||s.key;s.enabled=v.enabled;if(s.enabled&&!s.key)fail('KEY_REQUIRED');await write(s);return publicState(s);}finally{busy=false;}},
  async generate(v){if(busy)fail('PENDING');busy=true;const epoch=generation;try{
   if(!v||Object.keys(v).sort().join(',')!=='prompt,requestId'||typeof v.prompt!=='string'||!v.prompt.trim()||v.prompt.length>1000||! /^[0-9a-f-]{36}$/i.test(v.requestId||''))fail('INVALID_REQUEST');
   const s=await load();if(!s.enabled||!s.key)fail('SETUP_REQUIRED');if(s.requests.includes(v.requestId))fail('DUPLICATE');if(s.requests.length>=LIMIT)fail('QUOTA_BLOCKED');
   if(epoch!==generation)fail('CANCELLED');s.requests.push(v.requestId);await write(s);if(epoch!==generation)fail('CANCELLED');controller=new AbortController();
   const image=await generate({key:s.key,prompt:v.prompt.trim(),signal:controller.signal});return {...publicState(s),...image};
  }finally{busy=false;controller=null;}}
 };
}
function localImageService({directory,safeStorage}){
 const file=path.join(directory,'blog-image-budget-v1.bin');
 const protect=()=>{if(!safeStorage.isEncryptionAvailable())fail('STORAGE_ERROR');};
 return createImageService({read:async()=>{protect();try{return JSON.parse(safeStorage.decryptString(await fs.readFile(file)));}catch(e){if(e.code==='ENOENT')return null;fail('STORAGE_ERROR');}},write:async s=>{protect();await fs.mkdir(directory,{recursive:true});await fs.writeFile(file+'.pending',safeStorage.encryptString(JSON.stringify(s)));await fs.rename(file+'.pending',file);}});
}
module.exports={MODEL,LIMIT,generateImage,createImageService,localImageService};
