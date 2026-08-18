'use strict';

const PROVIDERS=Object.freeze({DEEPL:'DEEPL',GOOGLE_TRENDS_ALPHA:'GOOGLE_TRENDS_ALPHA',PUBLIC_PROCUREMENT:'PUBLIC_PROCUREMENT'});
const value=(env,key)=>String(env?.[key]||'').trim();
const flag=(env,key)=>value(env,key).toLowerCase()==='true';

function providerConfig(provider,env=process.env){
  if(provider===PROVIDERS.DEEPL)return {provider,enabled:flag(env,'DEEPL_TRANSLATION_ENABLED'),apiKey:value(env,'DEEPL_API_KEY'),endpoint:value(env,'DEEPL_API_BASE_URL')||'https://api-free.deepl.com'};
  if(provider===PROVIDERS.GOOGLE_TRENDS_ALPHA)return {provider,accessConfirmed:flag(env,'GOOGLE_TRENDS_ALPHA_ACCESS_CONFIRMED')};
  if(provider===PROVIDERS.PUBLIC_PROCUREMENT)return {provider,businessActive:flag(env,'PUBLIC_PROCUREMENT_B2B_ACTIVE'),enabled:flag(env,'PUBLIC_PROCUREMENT_ENABLED'),apiKey:value(env,'PUBLIC_PROCUREMENT_SERVICE_KEY')||value(env,'DATA_GO_KR_SERVICE_KEY'),endpoint:'https://apis.data.go.kr/1230000/ao/CntrctProcssIntgOpenService/getCntrctProcssIntgOpenThng'};
  throw new Error(`Unsupported optional provider: ${provider}`);
}

function missingFields(provider,config){
  if(provider===PROVIDERS.DEEPL)return config.apiKey?[]:['DeepL API Free 키'];
  if(provider===PROVIDERS.GOOGLE_TRENDS_ALPHA)return config.accessConfirmed?[]:['Google Trends API 알파 승인'];
  if(provider===PROVIDERS.PUBLIC_PROCUREMENT)return config.apiKey?[]:['공공데이터포털 서비스 키'];
  return ['지원하지 않는 공급자'];
}

module.exports={PROVIDERS,providerConfig,missingFields};
