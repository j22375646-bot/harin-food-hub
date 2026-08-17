'use strict';

const {cleanText}=require('../public-evidence/candidate-utils.js');
const BASE_URL='https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

class DataGoApiError extends Error{
  constructor(message,status=502,code='DATA_GO_READ_FAILED'){super(message);this.name='DataGoApiError';this.status=status;this.code=code;}
}

function requestUrl({apiKey,pageNo=1,numOfRows=20,filters={}}){
  const url=new URL(BASE_URL);url.searchParams.set('serviceKey',apiKey);url.searchParams.set('pageNo',String(Math.max(1,Number(pageNo)||1)));url.searchParams.set('numOfRows',String(Math.min(100,Math.max(1,Number(numOfRows)||20))));url.searchParams.set('type','json');
  for(const [key,value] of Object.entries(filters))if(String(value||'').trim())url.searchParams.set(key,String(value).trim());
  return url.toString();
}

async function fetchNutrition({apiKey,filters,fetchImpl=fetch,timeoutMs=15000}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(requestUrl({apiKey,filters}),{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});
    const payload=await response.json().catch(()=>({})),root=payload?.response||payload,header=root?.header||payload?.header||{},body=root?.body||payload?.body||{};
    const resultCode=cleanText(header.resultCode||header.result_code,40),resultMessage=cleanText(header.resultMsg||header.result_msg,220);
    if(!response.ok)throw new DataGoApiError(`식약처 영양성분 읽기 요청에 실패했습니다. (${response.status})`,response.status);
    if(resultCode&&!['00','0000','NORMAL_SERVICE'].includes(resultCode)){
      if(/KEY|AUTH|SERVICE_KEY|등록되지/iu.test(`${resultCode} ${resultMessage}`))throw new DataGoApiError('공공데이터포털 서비스키를 다시 확인해주세요.',412,'DATA_GO_CONFIG_INVALID');
      if(/LIMIT|QUOTA|초과/iu.test(`${resultCode} ${resultMessage}`))throw new DataGoApiError('공공데이터포털 호출 한도를 확인해주세요. 이전 저장 근거는 유지됩니다.',429,'DATA_GO_QUOTA_EXHAUSTED');
      throw new DataGoApiError(resultMessage||'식약처 영양성분 응답을 확인하지 못했습니다.',502,`DATA_GO_${resultCode}`);
    }
    const raw=body?.items?.item??body?.items??payload?.items??[],rows=Array.isArray(raw)?raw:raw?[raw]:[];
    return {status:rows.length?'SUCCESS':'NO_DATA',rows,totalCount:Number(body.totalCount??payload.totalCount)||rows.length,sourceTimestamp:new Date().toISOString()};
  }catch(error){
    if(error instanceof DataGoApiError)throw error;
    if(controller.signal.aborted)throw new DataGoApiError('식약처 영양성분 응답 시간이 길어 중단했습니다. 이전 저장 근거는 유지됩니다.',504,'DATA_GO_TIMEOUT');
    throw new DataGoApiError('식약처 영양성분 자료를 읽지 못했습니다. 잠시 뒤 다시 확인해주세요.',502,'DATA_GO_NETWORK_ERROR');
  }finally{clearTimeout(timer);}
}

module.exports={BASE_URL,DataGoApiError,requestUrl,fetchNutrition};
