'use strict';
const crypto = require('node:crypto');
const BASE_URL = 'https://api.searchad.naver.com';

function config() {
  const customerId=process.env.NAVER_CUSTOMER_ID?.trim(), apiKey=process.env.NAVER_API_KEY?.trim(), secretKey=process.env.NAVER_SECRET_KEY?.trim();
  if(!customerId||!apiKey||!secretKey) throw new Error('네이버 광고 API 서버 환경변수가 아직 저장되지 않았습니다.');
  return {customerId,apiKey,secretKey};
}
function signature(timestamp,method,uri,secretKey) {
  return crypto.createHmac('sha256',secretKey).update(`${timestamp}.${method}.${uri}`).digest('base64');
}
async function request(method,uri,query,body) {
  const {customerId,apiKey,secretKey}=config();
  const timestamp=String(Date.now());
  const url=new URL(`${BASE_URL}${uri}`);
  for(const [key,value] of Object.entries(query||{})) if(value!==undefined&&value!==null){
    if(key==='ids'&&Array.isArray(value)){for(const id of value)url.searchParams.append('ids',id);}
    else url.searchParams.set(key,typeof value==='string'?value:JSON.stringify(value));
  }
  const headers={'X-Timestamp':timestamp,'X-API-KEY':apiKey,'X-Customer':customerId,'X-Signature':signature(timestamp,method,uri,secretKey)};
  const options={method,headers,cache:'no-store',signal:AbortSignal.timeout(20000)};
  if(body!==undefined){headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  const response=await fetch(url,options);
  const text=await response.text(); let data; try{data=text?JSON.parse(text):null;}catch{data={raw:text};}
  if(!response.ok){const error=new Error(data?.title||data?.detail||data?.message||`네이버 API ${response.status}`);error.status=response.status;error.response=data;throw error;}
  return {status:response.status,data};
}
module.exports={request,config};
