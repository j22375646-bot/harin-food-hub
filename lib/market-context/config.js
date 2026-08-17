'use strict';

const PROVIDERS=Object.freeze({KAMIS_PRICE:'KAMIS_PRICE',KMA_WEATHER:'KMA_WEATHER',YOUTUBE_SEARCH:'YOUTUBE_SEARCH'});
const DEFINITIONS=Object.freeze([
  {provider:PROVIDERS.KAMIS_PRICE,label:'KAMIS 원재료 가격',subtitle:'공식 농산물 소매·도매 가격',icon:'price',tone:'amber'},
  {provider:PROVIDERS.KMA_WEATHER,label:'기상청 중기예보',subtitle:'광주·전남 날씨와 계절 맥락',icon:'clock',tone:'blue'},
  {provider:PROVIDERS.YOUTUBE_SEARCH,label:'YouTube 공개 영상',subtitle:'선택 상품 관련 공개 콘텐츠 후보',icon:'image',tone:'pink'}
]);
const text=(env,key)=>String(env?.[key]||'').trim();
const enabled=(env,key)=>text(env,key).toLowerCase()!=='false';

function providerConfig(provider,env=process.env){
  if(provider===PROVIDERS.KAMIS_PRICE)return {provider,enabled:enabled(env,'KAMIS_PRICE_ENABLED'),apiKey:text(env,'KAMIS_API_KEY'),apiId:text(env,'KAMIS_API_ID'),ttlHours:12};
  if(provider===PROVIDERS.KMA_WEATHER)return {provider,enabled:enabled(env,'KMA_WEATHER_ENABLED'),authKey:text(env,'KMA_API_HUB_KEY'),regionCode:text(env,'KMA_FORECAST_REGION_CODE')||'11F20000',regionLabel:text(env,'KMA_FORECAST_REGION_LABEL')||'광주·전남',ttlHours:3};
  if(provider===PROVIDERS.YOUTUBE_SEARCH)return {provider,enabled:enabled(env,'YOUTUBE_EVIDENCE_ENABLED'),apiKey:text(env,'YOUTUBE_DATA_API_KEY'),ttlHours:24};
  throw new Error(`Unsupported market context provider: ${provider}`);
}

function missingFields(provider,config){
  if(provider===PROVIDERS.KAMIS_PRICE)return [!config.apiKey&&'KAMIS 인증키',!config.apiId&&'KAMIS 요청자 ID'].filter(Boolean);
  if(provider===PROVIDERS.KMA_WEATHER)return config.authKey?[]:['기상청 API허브 인증키'];
  if(provider===PROVIDERS.YOUTUBE_SEARCH)return config.apiKey?[]:['YouTube Data API 키'];
  return ['공급자 설정'];
}

module.exports={PROVIDERS,DEFINITIONS,providerConfig,missingFields};
