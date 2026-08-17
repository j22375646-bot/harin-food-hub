'use strict';

const PROVIDERS=Object.freeze({
  MFDS_NUTRITION:'MFDS_NUTRITION',
  FOOD_SAFETY_HACCP:'FOOD_SAFETY_HACCP',
  FOOD_SAFETY_INGREDIENT:'FOOD_SAFETY_INGREDIENT',
  USDA_FDC:'USDA_FDC'
});

const DEFINITIONS=Object.freeze([
  {provider:PROVIDERS.MFDS_NUTRITION,label:'식약처 영양성분',subtitle:'국내 식품 영양성분·품목보고번호',icon:'checklist',tone:'blue'},
  {provider:PROVIDERS.FOOD_SAFETY_HACCP,label:'HACCP 지정정보',subtitle:'제조업소·식품유형 지정상태',icon:'shield',tone:'mint'},
  {provider:PROVIDERS.FOOD_SAFETY_INGREDIENT,label:'식품 원재료 DB',subtitle:'원재료명·사용조건·학명',icon:'product',tone:'lavender'},
  {provider:PROVIDERS.USDA_FDC,label:'USDA FoodData Central',subtitle:'해외 영양성분 비교 참고',icon:'analysis',tone:'amber'}
]);

const text=(env,key)=>String(env?.[key]||'').trim();
const enabled=(env,key)=>text(env,key).toLowerCase()!=='false';

function providerConfig(provider,env=process.env){
  if(provider===PROVIDERS.MFDS_NUTRITION)return {provider,enabled:enabled(env,'MFDS_NUTRITION_ENABLED'),apiKey:text(env,'DATA_GO_KR_SERVICE_KEY')};
  if(provider===PROVIDERS.FOOD_SAFETY_HACCP)return {provider,enabled:enabled(env,'FOOD_SAFETY_HACCP_ENABLED'),apiKey:text(env,'FOOD_SAFETY_KOREA_API_KEY')};
  if(provider===PROVIDERS.FOOD_SAFETY_INGREDIENT)return {provider,enabled:enabled(env,'FOOD_SAFETY_INGREDIENT_ENABLED'),apiKey:text(env,'FOOD_SAFETY_KOREA_API_KEY')};
  if(provider===PROVIDERS.USDA_FDC)return {provider,enabled:enabled(env,'USDA_FDC_ENABLED'),apiKey:text(env,'USDA_FDC_API_KEY')};
  throw new Error(`Unsupported label Evidence provider: ${provider}`);
}

function missingFields(provider,config){
  if(provider===PROVIDERS.MFDS_NUTRITION)return config.apiKey?[]:['공공데이터포털 서비스키'];
  if(provider===PROVIDERS.FOOD_SAFETY_HACCP||provider===PROVIDERS.FOOD_SAFETY_INGREDIENT)return config.apiKey?[]:['식품안전나라 API 인증키'];
  if(provider===PROVIDERS.USDA_FDC)return config.apiKey?[]:['USDA FoodData Central API 키'];
  return ['공급자 설정'];
}

module.exports={PROVIDERS,DEFINITIONS,providerConfig,missingFields};
