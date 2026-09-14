'use strict';
const {randomUUID}=require('node:crypto');
const {SYSTEM_PROMPT}=require('./insight-prompt.js');
const MODEL='HCX-007';
const MAX_BODY=24*1024, MAX_RESPONSE=128*1024, MAX_OUTPUT=1500;
function failure(code){const e=new Error(code);e.code=code;return e;}
function configuration(env=process.env,now=Date.now()){
 const enabled=env.MOAON_ANALYSIS_AI_ENABLED==='true';
 const inputRate=Number(env.CLOVA_STUDIO_INPUT_KRW_PER_MILLION),outputRate=Number(env.CLOVA_STUDIO_OUTPUT_KRW_PER_MILLION);
 const pricingVersion=String(env.CLOVA_STUDIO_PRICING_VERSION||'');
 const expires=Date.parse(env.CLOVA_STUDIO_CREDIT_EXPIRES_AT||'');
 const ready=Boolean(env.CLOVA_STUDIO_API_KEY&&env.CLOVA_STUDIO_ACCOUNT_ID&&env.CLOVA_STUDIO_READY==='true'&&env.CLOVA_STUDIO_DATA_POLICY_CONFIRMED==='true'&&pricingVersion&&inputRate>0&&Number.isFinite(inputRate)&&outputRate>0&&Number.isFinite(outputRate)&&expires>now&&(!env.CLOVA_STUDIO_MODEL||env.CLOVA_STUDIO_MODEL===MODEL));
 return {provider:'CLOVA',model:MODEL,enabled,ready,status:!enabled?'DISABLED':ready?'READY':'SETUP_REQUIRED',pricingVersion:pricingVersion||null,creditExpiresAt:Number.isFinite(expires)?new Date(expires).toISOString():null};
}
// CLOVA accepts a subset of JSON Schema. Length/extra-field validation remains server-side.
function providerSchema(value){if(Array.isArray(value))return value.map(providerSchema);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([key])=>!['additionalProperties','maxLength','uniqueItems'].includes(key)).map(([key,item])=>[key,providerSchema(item)]));}
function buildRequestBody({snapshot,question='',history=[],maxOutputTokens=MAX_OUTPUT}){
 const {INSIGHT_OUTPUT_SCHEMA}=require('./insight-contract.js');
 const body={messages:[{role:'system',content:SYSTEM_PROMPT},...history.flatMap(h=>[{role:'user',content:h.question||'보고서 요약'},{role:'assistant',content:JSON.stringify(h.output)}]),{role:'user',content:JSON.stringify({snapshot,question:question||'보고서를 근거 중심으로 요약해 주세요.'})}],maxCompletionTokens:Math.min(MAX_OUTPUT,Math.max(1,Math.floor(maxOutputTokens))),temperature:0.2,thinking:{effort:'none'},responseFormat:{type:'json',schema:providerSchema(INSIGHT_OUTPUT_SCHEMA)}};
 if(Buffer.byteLength(JSON.stringify(body),'utf8')>MAX_BODY)throw failure('INPUT_TOO_LARGE');
 return body;
}
function createClovaClient({env=process.env,fetchImpl=globalThis.fetch,now=Date.now}={}){
 const config=()=>configuration(env,now());
 function priceUsage(usage){if(!usage||!Number.isSafeInteger(usage.promptTokens)||usage.promptTokens<0||!Number.isSafeInteger(usage.completionTokens)||usage.completionTokens<0)return null;return Math.ceil((usage.promptTokens*Number(env.CLOVA_STUDIO_INPUT_KRW_PER_MILLION)+usage.completionTokens*Number(env.CLOVA_STUDIO_OUTPUT_KRW_PER_MILLION))/1e6);}
 function estimateMaxCost(args){const body=buildRequestBody(args);/* UTF-8 byte count plus framing upper bounds tokenization; output includes all generated tokens. */return priceUsage({promptTokens:Buffer.byteLength(JSON.stringify(body),'utf8')+1024,completionTokens:body.maxCompletionTokens});}
 async function generate(args){
  const cfg=config();if(!cfg.enabled)throw failure('DISABLED');if(!cfg.ready)throw failure('SETUP_REQUIRED');
  if(args.snapshot?.dataClass!=='INTERNAL_AGGREGATE'||args.snapshot?.scope!=='NAVER_AD_REPORT')throw failure('DATA_POLICY_BLOCKED');
  const body=buildRequestBody(args), controller=new AbortController();
  const remaining=Math.min(25000,(args.deadlineAt||now()+25000)-now());if(remaining<=0||args.signal?.aborted)throw failure('TIMEOUT');
  const abort=()=>controller.abort();args.signal?.addEventListener('abort',abort,{once:true});
  let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort();reject(failure('TIMEOUT'));},remaining);});
  try{return await Promise.race([timeout,(async()=>{
   const response=await fetchImpl(`https://clovastudio.stream.ntruss.com/v3/chat-completions/${MODEL}`,{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${env.CLOVA_STUDIO_API_KEY}`,'Content-Type':'application/json','Accept':'application/json','X-NCP-CLOVASTUDIO-REQUEST-ID':args.requestId||randomUUID()},body:JSON.stringify(body)});
   if(!response.ok)throw failure([401,403].includes(response.status)?'SETUP_REQUIRED':response.status===429?'QUOTA_BLOCKED':'UNAVAILABLE');
   if(Number(response.headers.get('content-length'))>MAX_RESPONSE)throw failure('INVALID_OUTPUT');
   let text='',size=0;const reader=response.body?.getReader();if(!reader)throw failure('INVALID_OUTPUT');
   const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE){await reader.cancel();throw failure('INVALID_OUTPUT');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
   if(controller.signal.aborted)throw failure('TIMEOUT');
   let json;try{json=JSON.parse(text);}catch{throw failure('INVALID_OUTPUT');}
   const result=json.result;if(json.status?.code!=='20000'||!result)throw failure('UNAVAILABLE');
   const usage=result.usage&&Number.isSafeInteger(result.usage.promptTokens)&&result.usage.promptTokens>=0&&Number.isSafeInteger(result.usage.completionTokens)&&result.usage.completionTokens>=0?{promptTokens:result.usage.promptTokens,completionTokens:result.usage.completionTokens,totalTokens:result.usage.totalTokens}:null;
   if(result.finishReason!=='stop'){const e=failure('INVALID_OUTPUT');e.usage=usage;throw e;}
   let output;try{output=JSON.parse(result.message.content);}catch{const e=failure('INVALID_OUTPUT');e.usage=usage;throw e;}
   return {output,usage,model:MODEL,responseId:null};
  })()]);}catch(error){if(controller.signal.aborted||error.name==='AbortError')throw failure('TIMEOUT');if(['SETUP_REQUIRED','QUOTA_BLOCKED','UNAVAILABLE','INVALID_OUTPUT','TIMEOUT'].includes(error.code))throw error;throw failure('UNAVAILABLE');}finally{clearTimeout(timer);args.signal?.removeEventListener('abort',abort);}
 }
 return {generate,configuration:config,estimateMaxCost,priceUsage};
}
module.exports={MODEL,MAX_BODY,MAX_RESPONSE,MAX_OUTPUT,configuration,buildRequestBody,createClovaClient};
