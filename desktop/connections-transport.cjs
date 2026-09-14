'use strict';
const URL='https://harin-cafe24-sync.vercel.app/api/moaon/connections';
const FIELDS={COUPANG:['vendorId','accessKey','secretKey'],NAVER:['clientId','clientSecret','customerId','apiKey','secretKey'],CAFE24:['mallId','clientId','clientSecret'],EPOST:['customerNo','approvalNo','officeSerial','apiKey','securityKey','trackingApiKey'],CLOVA:['apiKey','accountId','inputKrwPerMillion','outputKrwPerMillion','pricingVersion','creditExpiresAt'],GEMINI:['apiKey','projectId'],OPENAI:['apiKey']};
const AI=['CLOVA','GEMINI','OPENAI'];
function validInput(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const expected={LIST:['action'],REVEAL:['action','provider'],CHECK:['action','provider'],SAVE:['action','provider','revision','fields','expiresAt']}[v.action];
 if(!expected||Object.keys(v).length!==expected.length||!expected.every(k=>Object.hasOwn(v,k)))return false;
 if(v.action==='LIST')return true;if(!FIELDS[v.provider])return false;if(v.action==='REVEAL'&&AI.includes(v.provider))return false;if(v.action!=='SAVE')return true;if(AI.includes(v.provider)&&v.expiresAt!==null)return false;
 return Number.isSafeInteger(v.revision)&&v.revision>=0&&v.fields&&Object.keys(v.fields).length===FIELDS[v.provider].length&&FIELDS[v.provider].every(k=>typeof v.fields[k]==='string'&&v.fields[k].length<=2048&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v.fields[k]))&&(v.expiresAt===null||typeof v.expiresAt==='string'&&v.expiresAt.length<=40&&Number.isFinite(Date.parse(v.expiresAt)));
}
const stamp=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))?v:null;
const bounded=(v,n=200)=>typeof v==='string'?v.slice(0,n):'';
const AI_REASONS=['MANAGED_KEYS_DISABLED','KEY_NOT_SAVED','KEY_UNAVAILABLE','ACTIVATION_CONFIRMATION_REQUIRED','EMERGENCY_STOP','CREDIT_EXPIRED','PRICING_REQUIRED','FREE_CONFIRMATION_EXPIRED','PROJECT_REQUIRED','OPENAI_UNUSED'];
function aiState(v){if(!v||!['READY','SETUP_REQUIRED','DISABLED','KEY_SAVED_DISABLED'].includes(v.status))throw Error();return {status:v.status,enabled:v.enabled===true,ready:v.ready===true,reasonCodes:Array.isArray(v.reasonCodes)?v.reasonCodes.filter(r=>AI_REASONS.includes(r)).slice(0,10):[],checkedAt:null};}
function project(result,input){
 if(input.action==='LIST'){
  if(!Array.isArray(result.cards)||result.cards.length!==4||result.cards.some(c=>AI.includes(c.provider))||new Set(result.cards.map(c=>c.provider)).size!==4)throw Error();
  if(result.aiCards!==undefined&&(!Array.isArray(result.aiCards)||result.aiCards.length!==3||result.aiCards.some(c=>!AI.includes(c.provider))||new Set(result.aiCards.map(c=>c.provider)).size!==3))throw Error();
  const cards=[...result.cards,...(result.aiCards||[])].map(c=>{
   if(!FIELDS[c.provider]||!Number.isSafeInteger(c.revision)||c.revision<0||!Array.isArray(c.fields)||c.fields.length!==FIELDS[c.provider].length||!FIELDS[c.provider].every(k=>c.fields.includes(k)))throw Error();
   const ai=AI.includes(c.provider);
   return {provider:c.provider,name:bounded(c.name,80),revision:c.revision,expiresAt:ai?null:stamp(c.expiresAt),fields:[...FIELDS[c.provider]],identity:ai?[]:(Array.isArray(c.identity)?c.identity.filter(k=>FIELDS[c.provider].includes(k)):[]),editable:c.editable===true,
    check:ai?(c.check?aiState(c.check):{status:'SETUP_REQUIRED',enabled:false,ready:false,reasonCodes:['KEY_UNAVAILABLE'],checkedAt:null}):c.check?{status:['CONNECTED','CHECK_FAILED','QUEUED','WORKER_CHECK_REQUIRED'].includes(c.check.status)?c.check.status:'UNKNOWN',checkedAt:stamp(c.check.checkedAt),checks:(Array.isArray(c.check.checks)?c.check.checks:[]).slice(0,12).map(r=>({label:bounded(r.label,80),status:r.status==='CONNECTED'?'CONNECTED':'CHECK_FAILED',httpStatus:Number.isInteger(r.httpStatus)&&r.httpStatus>=100&&r.httpStatus<=599?r.httpStatus:null}))}:null,
    collection:{status:['READY','ON_DEMAND','UNAVAILABLE'].includes(c.collection?.status)?c.collection.status:'UNAVAILABLE',jobs:(Array.isArray(c.collection?.jobs)?c.collection.jobs:[]).slice(0,12).map(r=>({label:bounded(r.label,80),status:['SUCCESS','PARTIAL','FAILED','RUNNING'].includes(r.status)?r.status:'UNKNOWN',startedAt:stamp(r.startedAt),finishedAt:stamp(r.finishedAt)}))}};
  });
  const services=Array.isArray(result.services)?result.services.slice(0,20).map(r=>({provider:bounded(r.provider,40),label:bounded(r.label,80),usage:bounded(r.usage),status:['CONFIGURED','DISABLED','SETUP_REQUIRED'].includes(r.status)?r.status:'SETUP_REQUIRED'})):undefined;
  return {ok:true,cards:cards.filter(c=>!AI.includes(c.provider)),aiCards:result.aiCards?cards.filter(c=>AI.includes(c.provider)):undefined,services};
 }
 if(input.action==='REVEAL'){
  if(result.provider!==input.provider||!Number.isSafeInteger(result.revision)||result.revision<0||!result.fields||!FIELDS[input.provider].every(k=>typeof result.fields[k]==='string'&&result.fields[k].length<=2048))throw Error();
  return {ok:true,provider:input.provider,revision:result.revision,fields:Object.fromEntries(FIELDS[input.provider].map(k=>[k,result.fields[k]]))};
 }
 if(input.action==='SAVE'){
  if(!Number.isSafeInteger(result.revision)||result.revision<=input.revision)throw Error();
  return {ok:true,revision:result.revision,...(AI.includes(input.provider)?aiState(result):{status:'SAVED_UNVERIFIED'})};
 }
 if(AI.includes(input.provider))return {ok:true,...aiState(result)};
 const allowed=['CONNECTED','CHECK_FAILED','WORKER_CHECK_REQUIRED','QUEUED'];
 if(!allowed.includes(result.status))throw Error();
 return {ok:true,status:result.status,checkedAt:stamp(result.checkedAt)};
}
async function command(fetch,input,signal){
 if(!validInput(input))return {ok:false,code:'KEYS_INVALID'};
 try{const r=await fetch(URL,{method:'POST',credentials:'include',cache:'no-store',redirect:'error',signal,headers:{Origin:'https://harin-cafe24-sync.vercel.app','Content-Type':'application/json'},body:JSON.stringify(input)});const text=await r.text();if(text.length>60000)throw Error();const result=JSON.parse(text);if(!r.ok||!result.ok)return {ok:false,code:r.status===401?'KEYS_AUTH_REQUIRED':['KEYS_AUTH_REQUIRED','KEYS_SETUP_REQUIRED','KEYS_CONFLICT','KEYS_RATE_LIMITED','KEYS_INVALID'].includes(result.code)?result.code:'KEYS_UNAVAILABLE'};
 return project(result,input);
 }catch{return {ok:false,code:input.action==='SAVE'?'KEYS_RESULT_UNKNOWN':'KEYS_UNAVAILABLE'};}
}
module.exports={URL,FIELDS,validInput,command,project};
