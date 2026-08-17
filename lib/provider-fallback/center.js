'use strict';

const clean=value=>String(value??'').trim();
const isEnabled=value=>clean(value).toLowerCase()==='true';

const PROVIDERS=Object.freeze([
  Object.freeze({
    key:'BRAVE_SEARCH',capability:'search',label:'Brave Search API',icon:'search',tone:'blue',
    category:'웹·뉴스 보완 검색',subtitle:'네이버 밖의 공개 웹 자료가 꼭 필요할 때만',
    fields:['BRAVE_SEARCH_API_KEY'],switchEnv:'BRAVE_SEARCH_ENABLED',
    officialUrl:'https://api-dashboard.search.brave.com/app/documentation',
    priceUrl:'https://api-dashboard.search.brave.com/app/documentation',
    priceLabel:'현재 0원 · 사용 전 요금제 가입 필요',
    activateWhen:'네이버 검색·공식 자료를 확인해도 해외 또는 비네이버 공개 출처가 부족할 때',
    freeRoute:'/market-intelligence',freeAction:'네이버·공식 근거 먼저 확인',
    privacy:'상품명·일반 검색어만 전송 · 고객정보 금지'
  }),
  Object.freeze({
    key:'NAVER_CLOVA_OCR',capability:'ocr',label:'NAVER CLOVA OCR',icon:'scan',tone:'mint',
    category:'이미지·표 자동 판독',subtitle:'반복되는 스캔 문서와 표 판독을 줄일 때만',
    fields:['NAVER_CLOVA_OCR_INVOKE_URL','NAVER_CLOVA_OCR_SECRET'],switchEnv:'NAVER_CLOVA_OCR_ENABLED',
    officialUrl:'https://api.ncloud-docs.com/docs/ai-application-service-ocr',
    priceUrl:'https://www.ncloud.com/api-cms/service-product/static/ocr',
    priceLabel:'현재 0원 · General OCR 글자·표 각각 월 100회 무료 제공',
    activateWhen:'스캔 PDF·이미지·표가 반복되고 수동 판독 대기량이 실제 운영을 늦출 때',
    freeRoute:'/market-intelligence',freeAction:'자료실 수동 판독 먼저 사용',
    privacy:'상품·시장 자료만 전송 · 주문서·연락처·주소 금지'
  }),
  Object.freeze({
    key:'SEMRUSH',capability:'seo',label:'Semrush API',icon:'analysis',tone:'lavender',
    category:'경쟁 SEO·PPC 자료',subtitle:'경쟁 도메인 격차를 숫자로 확인해야 할 때만',
    fields:['SEMRUSH_API_KEY'],switchEnv:'SEMRUSH_ENABLED',
    officialUrl:'https://developer.semrush.com/api/v4/',
    priceUrl:'https://developer.semrush.com/api/v4/introduction/semrush-api-overview/',
    priceLabel:'현재 0원 · 유료 구독과 API units 필요',
    activateWhen:'자사몰·네이버 자료만으로 경쟁 도메인의 키워드·백링크·유료검색 격차를 검증할 수 없을 때',
    freeRoute:'/data-collection/owned-site',freeAction:'자사몰 무료 분석 먼저 확인',
    privacy:'도메인·일반 키워드만 전송 · 고객정보 금지'
  })
]);

function serviceStatus(center,key){
  return center?.services?.find(item=>item.key===key)?.status||'NOT_TESTED';
}
function providerReadiness(definition,env){
  const missing=definition.fields.filter(name=>!clean(env?.[name]));
  const switchEnabled=isEnabled(env?.[definition.switchEnv]);
  let status='SETUP_REQUIRED';
  if(!missing.length&&!switchEnabled)status='LOCKED';
  if(!missing.length&&switchEnabled)status='READ_PROBE_REQUIRED';
  return {status,credentialReady:missing.length===0,switchEnabled,missingCount:missing.length};
}
function freeSources(capability,{naverApiCenter={},ownedSiteCenter={}}={}){
  if(capability==='search')return [
    {label:'NAVER API HUB 공개 검색',status:serviceStatus(naverApiCenter,'apiHub'),route:'/data-collection/naver-api'},
    {label:'공식 Evidence·원문 검수',status:'READY',route:'/market-intelligence'}
  ];
  if(capability==='ocr')return [
    {label:'TXT·MD 자동 추출',status:'READY',route:'/market-intelligence'},
    {label:'PDF·이미지 수동 판독·사장님 확인',status:'READY',route:'/market-intelligence'}
  ];
  return [
    {label:'Google Search Console',status:serviceStatus(ownedSiteCenter,'searchConsole'),route:'/data-collection/owned-site'},
    {label:'GA4·PageSpeed·CrUX',status:['ga4','pageSpeed','crux'].some(key=>serviceStatus(ownedSiteCenter,key)==='READY')?'READY':'NOT_TESTED',route:'/data-collection/owned-site'},
    {label:'네이버 검색 트렌드·광고 성과',status:serviceStatus(naverApiCenter,'apiHub'),route:'/data-collection/naver-api'}
  ];
}

function buildProviderFallbackCenter({naverApiCenter={},ownedSiteCenter={},env=process.env,now=new Date()}={}){
  const providers=PROVIDERS.map(definition=>{
    const readiness=providerReadiness(definition,env);
    const sources=freeSources(definition.capability,{naverApiCenter,ownedSiteCenter});
    const freeReady=sources.some(item=>item.status==='READY');
    return {
      ...definition,...readiness,freeSources:sources,freeReady,
      decisionStatus:'FREE_FIRST',currentCost:0,
      summary:freeReady
        ?'무료·공식 기능을 먼저 사용할 수 있어요. 부족함을 확인하기 전에는 유료 호출을 열지 않습니다.'
        :'무료 기능의 연결과 표본부터 확인해야 해요. 유료 공급자로 바로 넘어가지 않습니다.'
    };
  });
  return {
    phase:'19-8',generatedAt:new Date(now).toISOString(),providers,
    summary:{
      providers:providers.length,active:0,currentCost:0,
      freeReady:providers.filter(item=>item.freeReady).length,
      setupRequired:providers.filter(item=>item.status==='SETUP_REQUIRED').length
    },
    rules:[
      '무료·공식 자료로 해결되지 않는 필요를 사장님이 확인한 뒤에만 유료 후보를 검토합니다.',
      '키와 안전 스위치가 있어도 첫 읽기 검증 전에는 연결 완료로 표시하지 않습니다.',
      '상품명·일반 검색어·문서 근거만 보내며 고객 주문정보·이름·연락처·주소는 보내지 않습니다.',
      '공급자별 자격증명·사용량·결과·오류를 분리하고 한 공급자 실패가 다른 화면을 막지 않습니다.'
    ],
    deferredKeys:providers.flatMap(item=>item.fields)
  };
}

module.exports={PROVIDERS,buildProviderFallbackCenter,providerReadiness,freeSources};
