'use strict';
// Only the established Harin business uses this legacy runtime. Never accept a tenant from the browser.
const TENANT='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const context=new (require('node:async_hooks').AsyncLocalStorage)();
const definitions={
 COUPANG:{name:'쿠팡',fields:{vendorId:'COUPANG_VENDOR_ID',accessKey:'COUPANG_ACCESS_KEY',secretKey:'COUPANG_SECRET_KEY'},identity:['vendorId']},
 NAVER:{name:'네이버 커머스 · 광고',fields:{clientId:'NAVER_COMMERCE_CLIENT_ID',clientSecret:'NAVER_COMMERCE_CLIENT_SECRET',customerId:'NAVER_CUSTOMER_ID',apiKey:'NAVER_API_KEY',secretKey:'NAVER_SECRET_KEY'},identity:['customerId','clientId']},
 CAFE24:{name:'카페24',fields:{mallId:'CAFE24_MALL_ID',clientId:'CAFE24_CLIENT_ID',clientSecret:'CAFE24_CLIENT_SECRET'},identity:['mallId','clientId']},
 EPOST:{name:'우체국',fields:{customerNo:'EPOST_CUSTOMER_NO',approvalNo:'EPOST_CONTRACT_APPROVAL_NO',officeSerial:'EPOST_OFFICE_SERIAL',apiKey:'EPOST_API_KEY',securityKey:'EPOST_SECURITY_KEY',trackingApiKey:'EPOST_TRACKING_API_KEY'},identity:['customerNo']}
};
function fail(code='KEYS_UNAVAILABLE'){return Object.assign(new Error(code),{code});}
function cipher(env=process.env){return require('../tenancy/credential-envelope.js').createCredentialCipher({activeKeyId:'managed-v1',keys:{'managed-v1':env.MOAON_MANAGED_KEY}});}
function baseline(provider,env=process.env){const d=definitions[provider];if(!d)throw fail('KEYS_INVALID');return Object.fromEntries(Object.entries(d.fields).map(([k,v])=>[k,env[v]||({approvalNo:env.EPOST_APPROVAL_NO,officeSerial:env.EPOST_OFFICE_SER,apiKey:provider==='EPOST'?env.EPOST_OPEN_API_KEY:'',securityKey:env.EPOST_SEED_KEY}[k])||'']));}
function decode(provider,row,env=process.env){return {...baseline(provider,env),...(row?cipher(env).open({tenantId:TENANT,provider,revision:row.revision},row.envelope):{})};}
function validInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return false;
 const keys={LIST:['action'],REVEAL:['action','provider'],CHECK:['action','provider'],SAVE:['action','provider','revision','fields','expiresAt']}[input.action];
 if(!keys||keys.length!==Object.keys(input).length||!keys.every(k=>Object.hasOwn(input,k)))return false;
 if(input.action==='LIST')return true;if(!definitions[input.provider])return false;if(input.action!=='SAVE')return true;
 const {fields}=input,names=Object.keys(definitions[input.provider].fields);
 return Number.isSafeInteger(input.revision)&&input.revision>=0&&fields&&Object.getPrototypeOf(fields)===Object.prototype&&Object.keys(fields).length===names.length&&names.every(k=>typeof fields[k]==='string'&&fields[k].length<=2048&&!/[\u0000-\u001f\u007f-\u009f]/u.test(fields[k]))&&(input.expiresAt===null||typeof input.expiresAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(input.expiresAt)&&Number.isFinite(Date.parse(input.expiresAt)));
}
async function environment(provider,env=process.env,db){
 if(context.getStore()?.provider===provider)return context.getStore().env;
 if(env.MOAON_MANAGED_KEYS_ENABLED!=='1')return env;
 const {data,error}=await (db||require('../cafe24/supabase.js').getSupabase()).from('moaon_managed_keys').select('revision,envelope').eq('tenant_id',TENANT).eq('provider',provider).maybeSingle();
 if(error)throw fail();if(!data)return env;
 const fields=decode(provider,data,env);
 return {...env,...Object.fromEntries(Object.entries(definitions[provider].fields).map(([k,v])=>[v,fields[k]]))};
}
const withEnvironment=(provider,env,work)=>context.run({provider,env},work);
module.exports={TENANT,definitions,fail,cipher,baseline,decode,validInput,environment,withEnvironment};
