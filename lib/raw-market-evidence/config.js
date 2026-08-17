'use strict';

const PROVIDERS=Object.freeze({
  KCS_TRADE:'KCS_TRADE',
  KOREA_EXIM_FX:'KOREA_EXIM_FX',
  KOSIS_SEARCH:'KOSIS_SEARCH'
});

const DEFINITIONS=Object.freeze([
  {provider:PROVIDERS.KCS_TRADE,label:'관세청 품목별 무역통계',subtitle:'HS 코드·국가별 월간 수출입 실적',icon:'truck',tone:'blue'},
  {provider:PROVIDERS.KOREA_EXIM_FX,label:'한국수출입은행 환율',subtitle:'원재료 매입비 비교용 공식 환율',icon:'price',tone:'amber'},
  {provider:PROVIDERS.KOSIS_SEARCH,label:'KOSIS 국가통계',subtitle:'원재료·시장 관련 공식 통계표 후보',icon:'analysis',tone:'lavender'}
]);

const text=(env,key)=>String(env?.[key]||'').trim();
const enabled=(env,key)=>text(env,key).toLowerCase()!=='false';

function providerConfig(provider,env=process.env){
  if(provider===PROVIDERS.KCS_TRADE)return {provider,enabled:enabled(env,'KCS_TRADE_ENABLED'),apiKey:text(env,'DATA_GO_KR_SERVICE_KEY')};
  if(provider===PROVIDERS.KOREA_EXIM_FX)return {provider,enabled:enabled(env,'KOREA_EXIM_FX_ENABLED'),apiKey:text(env,'KOREA_EXIM_API_KEY')};
  if(provider===PROVIDERS.KOSIS_SEARCH)return {provider,enabled:enabled(env,'KOSIS_MARKET_ENABLED'),apiKey:text(env,'KOSIS_API_KEY')};
  throw new Error(`Unsupported raw market provider: ${provider}`);
}

function missingFields(provider,config){
  if(provider===PROVIDERS.KCS_TRADE)return config.apiKey?[]:['공공데이터포털 서비스키·관세청 API 활용신청'];
  if(provider===PROVIDERS.KOREA_EXIM_FX)return config.apiKey?[]:['한국수출입은행 OpenAPI 인증키'];
  if(provider===PROVIDERS.KOSIS_SEARCH)return config.apiKey?[]:['KOSIS 공유서비스 인증키'];
  return ['공급자 설정'];
}

module.exports={PROVIDERS,DEFINITIONS,providerConfig,missingFields};
