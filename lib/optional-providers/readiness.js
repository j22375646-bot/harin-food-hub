'use strict';

const configModule=require('./config.js');
const deepl=require('./deepl-client.js');
const procurement=require('./procurement-client.js');

const DEFINITIONS=[
  {key:'deepl',provider:'DEEPL',label:'DeepL API Free',subtitle:'외국어 연구·시장 Evidence를 읽을 때만 번역',icon:'document',tone:'lavender',officialUrl:'https://developers.deepl.com/docs/resources/usage-limits'},
  {key:'googleTrends',provider:'GOOGLE_TRENDS_ALPHA',label:'Google Trends API',subtitle:'공식 알파 승인을 받은 뒤 검색 관심도 보완',icon:'growth',tone:'blue',officialUrl:'https://developers.google.com/search/apis/trends'},
  {key:'procurement',provider:'PUBLIC_PROCUREMENT',label:'나라장터 공공조달',subtitle:'B2B·급식 납품을 시작할 때만 입찰·낙찰·계약 확인',icon:'store',tone:'amber',officialUrl:'https://www.data.go.kr/data/15058815/openapi.do'}
];
const time=row=>new Date(row?.fetched_at||row?.created_at||0).getTime()||0;
const latest=rows=>[...rows].sort((a,b)=>time(b)-time(a))[0]||null;
function publicError(error,provider){const message=String(error?.message||'선택형 API 확인에 실패했습니다.').replace(/\s+/g,' ').slice(0,180);if(provider==='PUBLIC_PROCUREMENT'){if(/SERVICE ACCESS DENIED|활용승인|등록되지 않은 서비스|30|31/i.test(message))return '나라장터 계약과정통합공개서비스 활용승인 상태를 확인해주세요.';if(/key|인증|SERVICE_KEY/i.test(message))return '공공데이터포털 서비스 키를 확인해주세요.';return message;}if(/403|auth|key|credential/i.test(message))return 'DeepL API Free 키 또는 계정 상태를 확인해주세요.';if(/456|quota/i.test(message))return '이번 달 무료 번역 한도를 모두 사용했습니다. 자동 번역은 계속 잠금 상태입니다.';return message;}

function statusFor(def,config,attempt){
  if(def.provider==='DEEPL'){
    if(!config.enabled&&!config.apiKey)return 'NOT_NEEDED';
    if(!config.enabled)return 'LOCKED';
    if(!config.apiKey)return 'SETUP_REQUIRED';
    if(!attempt)return 'VERIFY_REQUIRED';
    if(attempt.status==='SUCCESS')return 'READY';
    if(attempt.status==='NO_DATA')return 'NO_DATA';
    return 'FAILED';
  }
  if(def.provider==='GOOGLE_TRENDS_ALPHA')return config.accessConfirmed?'READ_PROBE_REQUIRED':'ELIGIBILITY_REQUIRED';
  if(!config.businessActive)return 'NOT_NEEDED';
  if(!config.enabled)return 'LOCKED';
  if(!config.apiKey)return 'SETUP_REQUIRED';
  if(!attempt)return 'READ_PROBE_REQUIRED';
  if(attempt.status==='SUCCESS')return 'READY';
  if(attempt.status==='NO_DATA')return 'NO_DATA';
  return 'FAILED';
}

function summaryFor(provider,status,metric={}){
  if(provider==='DEEPL'&&status==='READY')return `이번 달 ${Number(metric.character_count||0).toLocaleString('ko-KR')}자 사용 · ${Number(metric.remaining_characters||0).toLocaleString('ko-KR')}자 남음`;
  const text={NOT_NEEDED:'현재 운영에는 필요하지 않아 비용·호출 없이 닫아뒀어요.',LOCKED:'조건은 갖췄지만 서버 안전 스위치가 잠겨 있어요.',SETUP_REQUIRED:'18~21단계가 끝난 뒤 키를 한 번에 입력하면 돼요.',VERIFY_REQUIRED:'키가 준비되어 읽기 전용 사용량 확인이 필요해요.',READ_PROBE_REQUIRED:'사용 조건은 충족됐고 공식 연결 절차 확인이 필요해요.',ELIGIBILITY_REQUIRED:'제한된 알파 접근 승인을 먼저 받아야 해요.',FAILED:'최근 읽기 확인이 실패했어요.',NO_DATA:'연결은 됐지만 확인할 자료가 없어요.'};
  if(provider==='PUBLIC_PROCUREMENT'&&status==='READY')return `물품 계약과정 읽기 연결 확인 · ${Number(metric.item_count||0).toLocaleString('ko-KR')}건 응답`;
  return text[status]||'상태를 확인해주세요.';
}

function detailFor(provider,status){
  if(provider==='DEEPL')return '상품명·논문 제목·공개 Evidence만 대상으로 하며 고객 이름·주소·주문정보는 보내지 않습니다.';
  if(provider==='GOOGLE_TRENDS_ALPHA')return status==='ELIGIBILITY_REQUIRED'?'공식 알파 승인 전에는 비공식 크롤링이나 pytrends로 우회하지 않습니다.':'알파 제공 문서의 인증 방식이 확정된 뒤 별도 읽기 어댑터를 연결합니다.';
  if(status==='READY')return '나라장터 물품 계약과정통합공개서비스의 읽기 응답을 확인했습니다. 공고 검색·입찰 제출은 자동 실행하지 않습니다.';
  return status==='NOT_NEEDED'?'B2B·학교급식·공공납품을 시작하기 전에는 활용신청과 수집을 하지 않습니다.':'사업 시작 확인 뒤 무료 나라장터 입찰·낙찰·계약 자료만 읽습니다.';
}

function buildOptionalProviderCenter({snapshots=[],env=process.env,now=new Date()}={}){
  const services=DEFINITIONS.map(def=>{const config=configModule.providerConfig(def.provider,env);const attempt=latest(snapshots.filter(row=>row.provider===def.provider));const success=latest(snapshots.filter(row=>row.provider===def.provider&&row.status==='SUCCESS'));const status=statusFor(def,config,attempt);const metric=attempt?.metric_summary||{};const action=def.provider==='DEEPL'&&['VERIFY_REQUIRED','READY','FAILED','NO_DATA'].includes(status)?{endpoint:'/api/optional-providers/deepl/probe',label:'무료 사용량 읽기 확인'}:def.provider==='PUBLIC_PROCUREMENT'&&['READ_PROBE_REQUIRED','READY','FAILED','NO_DATA'].includes(status)?{endpoint:'/api/optional-providers/public-procurement/probe',label:'물품 계약 읽기 확인'}:null;return {...def,status,summary:summaryFor(def.provider,status,metric),detail:detailFor(def.provider,status),lastAttemptAt:attempt?.fetched_at||null,lastSuccessAt:success?.fetched_at||null,previousSuccess:Boolean(success&&success!==attempt),errorMessage:status==='FAILED'?publicError({message:attempt?.error_message},def.provider):null,quota:def.provider==='DEEPL'&&metric.character_limit?metric:null,action,checks:[{label:'현재 사용 조건',status},{label:'외부 자동 호출',status:action?'MANUAL_ONLY':'LOCKED'},{label:'고객정보 전송 금지',status:'READY'}]};});
  return {phase:'20-5',generatedAt:new Date(now).toISOString(),services,summary:{ready:services.filter(item=>item.status==='READY').length,dormant:services.filter(item=>['NOT_NEEDED','ELIGIBILITY_REQUIRED'].includes(item.status)).length,cost:0},rules:['페이지를 열거나 기준상품을 바꾸는 것만으로 외부 API를 호출하지 않습니다.','DeepL은 외국어 공개 Evidence 번역용이며 사용량 확인도 사장님이 버튼을 눌렀을 때만 실행합니다.','Google Trends는 공식 알파 승인 전까지 비공식 스크래핑으로 대체하지 않습니다.','나라장터는 B2B·급식 납품 사업이 실제 시작된 뒤에만 연결합니다.','고객 이름·연락처·주소·주문정보는 번역·트렌드·조달 공급자에 보내지 않습니다.']};
}

async function saveSnapshot(db,row){const result=await db.from('optional_provider_snapshots').insert(row).select('id,provider,status,fetched_at').single();if(result.error){const error=new Error(`선택형 API 상태 저장 실패: ${result.error.message}`);error.code='OPTIONAL_PROVIDER_SAVE_FAILED';throw error;}return result.data;}
async function probeDeepL({db,env=process.env,fetchImpl=fetch,now=new Date()}={}){const config=configModule.providerConfig('DEEPL',env);if(!config.enabled){const error=new Error('DeepL 번역 공급자는 현재 사용 중지 상태입니다.');error.code='PROVIDER_DISABLED';error.status=423;throw error;}if(!config.apiKey){const error=new Error('필요한 서버 설정: DeepL API Free 키');error.code='CONFIG_REQUIRED';error.status=412;throw error;}try{const result=await deepl.readUsage({config,fetchImpl});const stored=await saveSnapshot(db,{provider:'DEEPL',status:result.status,metric_summary:result.metricSummary,fetched_at:new Date(now).toISOString(),metadata:{read_only:true,usage_only:true,no_source_text:true,contains_customer_data:false}});return {provider:'DEEPL',status:result.status,snapshot:stored,usage:result.metricSummary};}catch(error){await saveSnapshot(db,{provider:'DEEPL',status:'FAILED',metric_summary:{},fetched_at:new Date(now).toISOString(),error_code:error.code||'DEEPL_USAGE_FAILED',error_message:publicError(error),metadata:{read_only:true,usage_only:true,no_source_text:true}}).catch(()=>{});throw error;}}

async function probeProcurement({db,env=process.env,fetchImpl=fetch,now=new Date()}={}){const config=configModule.providerConfig('PUBLIC_PROCUREMENT',env);if(!config.businessActive){const error=new Error('B2B·공공조달 사업 시작 확인이 필요합니다.');error.code='BUSINESS_NOT_ACTIVE';error.status=423;throw error;}if(!config.enabled){const error=new Error('나라장터 읽기 공급자는 현재 사용 중지 상태입니다.');error.code='PROVIDER_DISABLED';error.status=423;throw error;}if(!config.apiKey){const error=new Error('필요한 서버 설정: 공공데이터포털 서비스 키');error.code='CONFIG_REQUIRED';error.status=412;throw error;}try{const result=await procurement.probe({config,fetchImpl});const stored=await saveSnapshot(db,{provider:'PUBLIC_PROCUREMENT',status:result.status,metric_summary:{item_count:result.totalCount},source_data:{sample_notice_number:result.sampleNoticeNumber},source_timestamp:result.sourceTimestamp,fetched_at:new Date(now).toISOString(),metadata:{read_only:true,sample_probe:true,contains_customer_data:false,automatic_submission:false}});return {provider:'PUBLIC_PROCUREMENT',status:result.status,snapshot:stored,count:result.totalCount};}catch(error){await saveSnapshot(db,{provider:'PUBLIC_PROCUREMENT',status:'FAILED',metric_summary:{},source_data:{},fetched_at:new Date(now).toISOString(),error_code:error.code||'PROCUREMENT_READ_FAILED',error_message:publicError(error,'PUBLIC_PROCUREMENT'),metadata:{read_only:true,sample_probe:true,contains_customer_data:false}}).catch(()=>{});throw error;}}

module.exports={DEFINITIONS,buildOptionalProviderCenter,probeDeepL,probeProcurement,publicError,statusFor};
