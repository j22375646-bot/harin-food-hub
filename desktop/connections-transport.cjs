'use strict';
const URL='https://harin-cafe24-sync.vercel.app/api/moaon/connections';
const FIELDS={COUPANG:['vendorId','accessKey','secretKey'],NAVER:['clientId','clientSecret','customerId','apiKey','secretKey'],CAFE24:['mallId','clientId','clientSecret'],EPOST:['customerNo','approvalNo','officeSerial','apiKey','securityKey','trackingApiKey']};
function validInput(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const expected={LIST:['action'],REVEAL:['action','provider'],CHECK:['action','provider'],SAVE:['action','provider','revision','fields','expiresAt']}[v.action];
 if(!expected||Object.keys(v).length!==expected.length||!expected.every(k=>Object.hasOwn(v,k)))return false;
 if(v.action==='LIST')return true;if(!FIELDS[v.provider])return false;if(v.action!=='SAVE')return true;
 return Number.isSafeInteger(v.revision)&&v.revision>=0&&v.fields&&Object.keys(v.fields).length===FIELDS[v.provider].length&&FIELDS[v.provider].every(k=>typeof v.fields[k]==='string'&&v.fields[k].length<=2048&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v.fields[k]))&&(v.expiresAt===null||typeof v.expiresAt==='string'&&v.expiresAt.length<=40&&Number.isFinite(Date.parse(v.expiresAt)));
}
async function command(fetch,input,signal){
 if(!validInput(input))return {ok:false,code:'KEYS_INVALID'};
 try{const r=await fetch(URL,{method:'POST',credentials:'include',cache:'no-store',redirect:'error',signal,headers:{Origin:'https://harin-cafe24-sync.vercel.app','Content-Type':'application/json'},body:JSON.stringify(input)});const text=await r.text();if(text.length>60000)throw Error();const result=JSON.parse(text);if(!r.ok||!result.ok)return {ok:false,code:r.status===401?'KEYS_AUTH_REQUIRED':['KEYS_AUTH_REQUIRED','KEYS_SETUP_REQUIRED','KEYS_CONFLICT','KEYS_RATE_LIMITED','KEYS_INVALID'].includes(result.code)?result.code:'KEYS_UNAVAILABLE'};
 if(input.action==='LIST'&&(!Array.isArray(result.cards)||result.cards.length!==4||result.cards.some(c=>!FIELDS[c.provider]||!Number.isSafeInteger(c.revision)||c.revision<0)))throw Error();
 if(input.action==='REVEAL'&&(result.provider!==input.provider||!result.fields||!FIELDS[input.provider].every(k=>typeof result.fields[k]==='string'&&result.fields[k].length<=2048)))throw Error();
 return result;
 }catch{return {ok:false,code:input.action==='SAVE'?'KEYS_RESULT_UNKNOWN':'KEYS_UNAVAILABLE'};}
}
module.exports={URL,FIELDS,validInput,command};
