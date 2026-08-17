'use strict';

const text=(env,key)=>String(env?.[key]||'').trim();

const GROUPS=[
  {
    key:'GOOGLE_OWNED_SITE',label:'구글 자사몰 분석',icon:'analysis',destination:'Vercel 운영 환경 변수',
    description:'Search Console·GA4·PageSpeed·CrUX를 실제 자사몰 데이터로 연결할 때 입력합니다.',
    fields:[
      {name:'HUB_OWNED_SITE_URL',alternatives:['GOOGLE_SEARCH_CONSOLE_SITE_URL'],label:'자사몰 주소',secret:false},
      {name:'GOOGLE_SERVICE_ACCOUNT_EMAIL',label:'서비스 계정 이메일',secret:false},
      {name:'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',label:'서비스 계정 비밀키',secret:true},
      {name:'GOOGLE_GA4_PROPERTY_ID',label:'GA4 속성 ID',secret:false},
      {name:'GOOGLE_PAGESPEED_API_KEY',label:'PageSpeed API 키',secret:true},
      {name:'GOOGLE_CRUX_API_KEY',label:'CrUX API 키',secret:true}
    ]
  },
  {
    key:'KOREAN_PUBLIC_DATA',label:'국내 공공·식품·배송 자료',icon:'document',destination:'Vercel 운영 환경 변수',
    description:'공식 원재료·식품·회수·휴일·주소 근거를 보강하는 읽기 전용 연결입니다.',
    fields:[
      {name:'DATA_GO_KR_SERVICE_KEY',label:'공공데이터포털 서비스키',secret:true},
      {name:'FOOD_SAFETY_KOREA_API_KEY',label:'식품안전나라 인증키',secret:true},
      {name:'KASI_HOLIDAY_API_KEY',label:'공휴일 API 키',secret:true},
      {name:'JUSO_ROAD_ADDRESS_API_KEY',label:'도로명주소 승인키',secret:true},
      {name:'KOREAN_LAW_API_OC',label:'국가법령정보 OC',secret:false}
    ]
  },
  {
    key:'MARKET_CONTEXT',label:'시장·날씨·검색 근거',icon:'growth',destination:'Vercel 운영 환경 변수',
    description:'가격·날씨·영상·통계 근거를 상품별 시장 분석에 추가합니다.',
    fields:[
      {name:'KAMIS_API_KEY',label:'KAMIS 인증키',secret:true},
      {name:'KAMIS_API_ID',label:'KAMIS 요청자 ID',secret:false},
      {name:'KMA_API_HUB_KEY',label:'기상청 API Hub 키',secret:true},
      {name:'YOUTUBE_DATA_API_KEY',label:'YouTube Data API 키',secret:true},
      {name:'KOREA_EXIM_API_KEY',label:'수출입은행 OpenAPI 키',secret:true},
      {name:'KOSIS_API_KEY',label:'KOSIS 공유서비스 키',secret:true}
    ]
  },
  {
    key:'RESEARCH_EVIDENCE',label:'연구·영양 근거',icon:'ai',destination:'Vercel 운영 환경 변수',
    description:'자동 판매문구가 아니라 Evidence 근거함에서만 사용하는 선택 연결입니다.',
    optional:true,
    fields:[
      {name:'USDA_FDC_API_KEY',label:'USDA FoodData Central 키',secret:true},
      {name:'NCBI_EUTILS_API_KEY',label:'NCBI E-utilities 키',secret:true},
      {name:'NCBI_EUTILS_EMAIL',label:'NCBI 연락 이메일',secret:false},
      {name:'CROSSREF_MAILTO',label:'Crossref 연락 이메일',secret:false}
    ]
  },
  {
    key:'OPERATIONS_HEALTH',label:'운영 상태·배포 감시',icon:'server',destination:'Vercel 운영 환경 변수',
    description:'AWS·Vercel·GitHub·외부 가동상태를 읽기 전용으로 대조합니다.',
    optional:true,
    fields:[
      {name:'AWS_CLOUDWATCH_ACCESS_KEY_ID',label:'CloudWatch 읽기 Access Key',secret:true},
      {name:'AWS_CLOUDWATCH_SECRET_ACCESS_KEY',label:'CloudWatch 읽기 Secret Key',secret:true},
      {name:'AWS_CLOUDWATCH_INSTANCE_ID',label:'EC2 인스턴스 ID',secret:false},
      {name:'VERCEL_HEALTH_TOKEN',label:'Vercel 읽기 토큰',secret:true},
      {name:'VERCEL_HEALTH_PROJECT_ID',label:'Vercel 프로젝트 ID',secret:false},
      {name:'VERCEL_HEALTH_TEAM_ID',label:'Vercel 팀 ID',secret:false},
      {name:'GITHUB_RELEASE_TOKEN',label:'GitHub 릴리스 읽기 토큰',secret:true},
      {name:'UPTIMEROBOT_READ_ONLY_API_KEY',label:'UptimeRobot 읽기 전용 키',secret:true}
    ]
  },
  {
    key:'NOTIFICATION_AND_OPTIONAL',label:'알림·번역·B2B 선택 기능',icon:'alerts',destination:'Vercel 운영 환경 변수',
    description:'필요한 기능만 켜며, 비어 있어도 현재 허브 운영은 멈추지 않습니다.',
    optional:true,
    fields:[
      {name:'TELEGRAM_BOT_TOKEN',label:'Telegram Bot 토큰',secret:true},
      {name:'TELEGRAM_ALERT_CHAT_ID',label:'Telegram 채팅 ID',secret:false},
      {name:'RESEND_API_KEY',label:'Resend API 키',secret:true},
      {name:'REPORT_FROM_EMAIL',label:'보고서 발신 이메일',secret:false},
      {name:'DEEPL_API_KEY',label:'DeepL API Free 키',secret:true},
      {name:'PUBLIC_PROCUREMENT_SERVICE_KEY',alternatives:['DATA_GO_KR_SERVICE_KEY'],label:'나라장터 공공데이터 키',secret:true}
    ]
  }
];

function fieldState(field,env){
  const names=[field.name,...(field.alternatives||[])];
  const configured=names.some(name=>Boolean(text(env,name)));
  return {
    name:field.name,
    alternatives:field.alternatives||[],
    label:field.label,
    secret:Boolean(field.secret),
    configured,
    valueExposed:false
  };
}

function buildDeferredCredentialChecklist(env=process.env){
  const groups=GROUPS.map(group=>{
    const fields=group.fields.map(field=>fieldState(field,env));
    const ready=fields.filter(field=>field.configured).length;
    return {
      key:group.key,label:group.label,icon:group.icon,destination:group.destination,
      description:group.description,optional:Boolean(group.optional),fields,
      ready,total:fields.length,missing:fields.length-ready,
      status:ready===fields.length?'READY':ready?'PARTIAL':'SETUP_REQUIRED'
    };
  });
  const total=groups.reduce((sum,group)=>sum+group.total,0);
  const ready=groups.reduce((sum,group)=>sum+group.ready,0);
  return {
    phase:'21-8',status:ready===total?'READY':'SETUP_REQUIRED',groups,total,ready,missing:total-ready,
    secretValuesExposed:false,writesUnlocked:false,
    entryWindow:'Phase 18~21 개발 검증 뒤 한 번에 입력',
    rules:['키 값은 화면·로그·Git에 표시하지 않음','입력 전까지 연결 성공으로 꾸미지 않음','키 입력 뒤 읽기 확인부터 실행','플랫폼 쓰기는 별도 사장님 승인 유지']
  };
}

module.exports={GROUPS,buildDeferredCredentialChecklist};
