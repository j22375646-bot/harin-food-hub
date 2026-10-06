'use strict';
const {configuration:clovaConfiguration}=require('../ai/clova-client.js');
const {configuration:geminiConfiguration}=require('../ai/gemini-client.js');

// The save confirmation is an owner attestation, never a provider/billing verification.
const POLICY_VERSION='ai-save-activation-v1';
function resolve(provider,env,fields,row){
 const value={...env};
 if(provider==='OPENAI')return {...value,OPENAI_ANALYSIS_ENABLED:'false'};
 const confirmed=fields.managedPolicyVersion===POLICY_VERSION;
 if(provider==='CLOVA')Object.assign(value,{MOAON_ANALYSIS_AI_ENABLED:env.MOAON_ANALYSIS_AI_KILL_SWITCH==='true'?'false':'true',CLOVA_STUDIO_MODEL:'HCX-007',CLOVA_STUDIO_READY:confirmed?'true':'false',CLOVA_STUDIO_DATA_POLICY_CONFIRMED:confirmed?'true':'false'});
 if(provider==='GEMINI')Object.assign(value,{MOAON_MARKET_AI_ENABLED:env.MOAON_MARKET_AI_KILL_SWITCH==='true'?'false':'true',GEMINI_MODEL:'gemini-3.5-flash-lite',GEMINI_FREE_TIER_CONFIRMED:confirmed?'true':'false',GEMINI_DATA_POLICY_CONFIRMED:confirmed?'true':'false',GEMINI_FREE_PROJECT_CONFIRMED_AT:confirmed?(row.updated_at||row.updatedAt||''):''});
 return value;
}
function metadata(provider,env,fields,row,now=Date.now()){
 if(!row)return {status:'SETUP_REQUIRED',enabled:false,ready:false,reasonCodes:['KEY_NOT_SAVED'],checkedAt:null};
 if(provider==='OPENAI')return {status:'KEY_SAVED_DISABLED',enabled:false,ready:false,reasonCodes:['OPENAI_UNUSED'],checkedAt:null};
 const cfg=(provider==='CLOVA'?clovaConfiguration:geminiConfiguration)(env,now),reasonCodes=[];
 if(!cfg.enabled)reasonCodes.push('EMERGENCY_STOP');
 if(fields.managedPolicyVersion!==POLICY_VERSION)reasonCodes.push('ACTIVATION_CONFIRMATION_REQUIRED');
 if(provider==='CLOVA'){
  if(!env.CLOVA_STUDIO_PRICING_VERSION||!['CLOVA_STUDIO_INPUT_KRW_PER_MILLION','CLOVA_STUDIO_OUTPUT_KRW_PER_MILLION'].every(k=>Number.isFinite(Number(env[k]))&&Number(env[k])>0))reasonCodes.push('PRICING_REQUIRED');
  if(!(Date.parse(env.CLOVA_STUDIO_CREDIT_EXPIRES_AT)>now))reasonCodes.push('CREDIT_EXPIRED');
 }else{
  if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.GEMINI_FREE_PROJECT_ID||''))reasonCodes.push('PROJECT_REQUIRED');
  const at=Date.parse(env.GEMINI_FREE_PROJECT_CONFIRMED_AT||'');if(!Number.isFinite(at)||at>now||now-at>=30*86400000)reasonCodes.push('FREE_CONFIRMATION_EXPIRED');
 }
 return {status:cfg.status,enabled:cfg.enabled,ready:cfg.ready,reasonCodes,checkedAt:null};
}
module.exports={POLICY_VERSION,resolve,metadata};
