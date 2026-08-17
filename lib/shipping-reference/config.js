'use strict';

const PROVIDERS=Object.freeze({HOLIDAY_CALENDAR:'HOLIDAY_CALENDAR',ROAD_ADDRESS:'ROAD_ADDRESS'});

function value(env,key){return String(env[key]||'').trim();}
function enabled(env,key){return value(env,key).toLowerCase()!=='false';}

function providerConfig(provider,env=process.env){
  if(provider===PROVIDERS.HOLIDAY_CALENDAR)return {
    provider,enabled:enabled(env,'HOLIDAY_CALENDAR_ENABLED'),apiKey:value(env,'KASI_HOLIDAY_API_KEY'),
    endpoint:'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'
  };
  if(provider===PROVIDERS.ROAD_ADDRESS)return {
    provider,enabled:enabled(env,'ROAD_ADDRESS_LOOKUP_ENABLED'),apiKey:value(env,'JUSO_ROAD_ADDRESS_API_KEY'),
    endpoint:'https://business.juso.go.kr/addrlink/addrLinkApi.do'
  };
  throw new Error(`Unsupported shipping reference provider: ${provider}`);
}

function missingFields(provider,config){
  if(provider===PROVIDERS.HOLIDAY_CALENDAR)return config.apiKey?[]:['공공데이터포털 특일 정보 키'];
  if(provider===PROVIDERS.ROAD_ADDRESS)return config.apiKey?[]:['도로명주소 검색 승인키'];
  return ['지원하지 않는 공급자'];
}

module.exports={PROVIDERS,providerConfig,missingFields};
