'use strict';

const {cleanText}=require('./candidate-utils.js');

const BASE_URL='https://openapi.foodsafetykorea.go.kr/api';

class FoodSafetyApiError extends Error{
  constructor(message,status=502,code='FOOD_SAFETY_READ_FAILED'){super(message);this.name='FoodSafetyApiError';this.status=status;this.code=code;}
}

function requestUrl({apiKey,serviceId,start=1,end=20,filter}){
  const boundedStart=Math.max(1,Number.parseInt(start,10)||1),boundedEnd=Math.min(1000,Math.max(boundedStart,Number.parseInt(end,10)||20));
  const base=`${BASE_URL}/${encodeURIComponent(apiKey)}/${encodeURIComponent(serviceId)}/json/${boundedStart}/${boundedEnd}`;
  if(!filter?.key||!filter?.value)return base;
  return `${base}/${encodeURIComponent(filter.key)}=${encodeURIComponent(String(filter.value).trim())}`;
}

function resultError(code,message){
  const safe=cleanText(message,220)||'식품안전나라 응답을 확인하지 못했습니다.';
  if(code==='INFO-100')return new FoodSafetyApiError('식품안전나라 API 인증키를 다시 확인해주세요.',412,'FOOD_SAFETY_CONFIG_INVALID');
  if(code==='INFO-300')return new FoodSafetyApiError('식품안전나라 API 호출 한도를 확인해주세요. 이전 저장 근거는 유지됩니다.',429,'FOOD_SAFETY_QUOTA_EXHAUSTED');
  return new FoodSafetyApiError(safe,502,`FOOD_SAFETY_${cleanText(code,30)||'READ_FAILED'}`);
}

async function fetchService({apiKey,serviceId,start=1,end=20,filter,fetchImpl=fetch,timeoutMs=15000}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(requestUrl({apiKey,serviceId,start,end,filter}),{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new FoodSafetyApiError(`식품안전나라 읽기 요청에 실패했습니다. (${response.status})`,response.status);
    const body=payload?.[serviceId]||{};const code=cleanText(body.RESULT?.CODE,30),message=cleanText(body.RESULT?.MSG,220);
    if(code==='INFO-200')return {status:'NO_DATA',rows:[],totalCount:0,sourceTimestamp:new Date().toISOString()};
    if(code&&code!=='INFO-000')throw resultError(code,message);
    const rows=Array.isArray(body.row)?body.row:body.row?[body.row]:[];
    return {status:rows.length?'SUCCESS':'NO_DATA',rows,totalCount:Number(body.total_count)||rows.length,sourceTimestamp:new Date().toISOString()};
  }catch(error){
    if(error instanceof FoodSafetyApiError)throw error;
    if(controller.signal.aborted)throw new FoodSafetyApiError('식품안전나라 응답 시간이 길어 중단했습니다. 이전 저장 근거는 유지됩니다.',504,'FOOD_SAFETY_TIMEOUT');
    throw new FoodSafetyApiError('식품안전나라 자료를 읽지 못했습니다. 잠시 뒤 다시 확인해주세요.',502,'FOOD_SAFETY_NETWORK_ERROR');
  }finally{clearTimeout(timer);}
}

module.exports={BASE_URL,FoodSafetyApiError,requestUrl,fetchService};
