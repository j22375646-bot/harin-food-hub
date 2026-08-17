'use strict';

const PROVIDERS=Object.freeze({
  FOOD_SAFETY_PRODUCT:'FOOD_SAFETY_PRODUCT',
  FOOD_SAFETY_RECALL:'FOOD_SAFETY_RECALL',
  KOREAN_LAW:'KOREAN_LAW'
});

const DEFINITIONS=Object.freeze([
  {key:'foodProduct',provider:PROVIDERS.FOOD_SAFETY_PRODUCT,label:'식품 품목정보',subtitle:'품목제조보고·식품유형·원재료',icon:'product',tone:'mint'},
  {key:'foodRecall',provider:PROVIDERS.FOOD_SAFETY_RECALL,label:'회수·판매중지',subtitle:'공식 회수사유·등급·처리방법',icon:'warning',tone:'pink'},
  {key:'law',provider:PROVIDERS.KOREAN_LAW,label:'국가법령정보',subtitle:'표시광고·식품위생 관련 현행법령',icon:'document',tone:'lavender'}
]);

const text=(env,key)=>String(env?.[key]||'').trim();
const enabled=(env,key)=>text(env,key).toLowerCase()!=='false';

function providerConfig(provider,env=process.env){
  if(provider===PROVIDERS.FOOD_SAFETY_PRODUCT)return {provider,enabled:enabled(env,'FOOD_SAFETY_PRODUCT_ENABLED'),apiKey:text(env,'FOOD_SAFETY_KOREA_API_KEY')};
  if(provider===PROVIDERS.FOOD_SAFETY_RECALL)return {provider,enabled:enabled(env,'FOOD_SAFETY_RECALL_ENABLED'),apiKey:text(env,'FOOD_SAFETY_KOREA_API_KEY')};
  if(provider===PROVIDERS.KOREAN_LAW)return {provider,enabled:enabled(env,'KOREAN_LAW_ENABLED'),oc:text(env,'KOREAN_LAW_API_OC')};
  throw new Error(`Unsupported public Evidence provider: ${provider}`);
}

function missingFields(provider,config){
  if(provider===PROVIDERS.FOOD_SAFETY_PRODUCT||provider===PROVIDERS.FOOD_SAFETY_RECALL)return config.apiKey?[]:['식품안전나라 API 인증키'];
  if(provider===PROVIDERS.KOREAN_LAW)return config.oc?[]:['국가법령정보 공동활용 OC'];
  return ['공급자 설정'];
}

module.exports={PROVIDERS,DEFINITIONS,providerConfig,missingFields};
