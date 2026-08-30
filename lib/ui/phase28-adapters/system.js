'use strict';

const CORE_SERVICES=Object.freeze([
  Object.freeze({id:'cafe24',label:'Cafe24',meta:'자사몰 Admin API · OAuth',brand:'CAFE24',tone:'mint',datasets:['상품','주문','문의','클레임'],action:'OAuth 읽기 권한과 최근 수집 성공을 확인한 뒤 필요한 작업만 실행해요.'}),
  Object.freeze({id:'naver-ads',label:'네이버 검색광고',meta:'캠페인 · 광고그룹 · 키워드 · 입찰',brand:'NAVER',tone:'green',datasets:['캠페인','광고그룹','키워드','광고비'],action:'검색광고 읽기 전용 검증을 먼저 확인하고 입찰 변경 잠금은 유지해요.'}),
  Object.freeze({id:'naver-commerce',label:'네이버 커머스',meta:'스마트스토어 운영 API · 고정 IP',brand:'NAVER',tone:'green',datasets:['상품','주문','문의','클레임','정산'],action:'서울 고정 IP의 커머스 읽기 결과를 확인하고 쓰기는 사장님 승인 뒤에만 열어요.'}),
  Object.freeze({id:'coupang',label:'쿠팡',meta:'WING Open API · 서울 고정 IP',brand:'COUPANG',tone:'orange',datasets:['상품','주문','문의','클레임','정산','로켓그로스 재고'],action:'서울 고정 IP 워커와 읽기 수집 상태를 확인하고 실패한 작업만 다시 요청해요.'}),
  Object.freeze({id:'epost',label:'우체국택배',meta:'계약소포 · 운송장 · 배송조회',brand:'EPOST',tone:'blue',datasets:['운송장','배송조회 결과'],action:'읽기 전용 점검과 고정 IP 상태를 확인한 뒤 실제 발급 잠금은 그대로 유지해요.'}),
  Object.freeze({id:'supabase',label:'Supabase',meta:'운영 저장소 · 작업 큐 · 이력',brand:'SUPABASE',tone:'purple',datasets:['수집 스냅샷','정규화 테이블','작업 큐','알림','실행 이력'],action:'서비스 키는 서버에만 두고 저장·큐·감시 결과만 이 화면에서 확인해요.'})
]);
const CORE_SERVICE_IDS=Object.freeze(CORE_SERVICES.map(item=>item.id));
const WORKSPACES=Object.freeze([
  Object.freeze({id:'connections',label:'핵심 연결',description:'실제로 쓰는 API와 저장소'}),
  Object.freeze({id:'datasets',label:'받는 자료',description:'채널별 수집 범위와 반영 상태'}),
  Object.freeze({id:'jobs',label:'작업·스케줄',description:'실행 위치와 다음 주기'}),
  Object.freeze({id:'recovery',label:'오류·복구',description:'이전 성공·재시도·실패 격리'})
]);
const FLOW=Object.freeze([
  Object.freeze({id:'api',label:'외부 API',description:'채널별 자격증명 격리'}),
  Object.freeze({id:'probe',label:'읽기 검증',description:'쓰기 전에 실제 조회 확인'}),
  Object.freeze({id:'job',label:'수집 작업',description:'중복 방지 작업 큐'}),
  Object.freeze({id:'store',label:'Supabase 저장',description:'스냅샷·정규화·이력'}),
  Object.freeze({id:'hub',label:'허브 반영',description:'최신성 확인 뒤 화면 반영'})
]);
const DATASETS=Object.freeze([
  Object.freeze({id:'products',label:'상품',sources:['Cafe24','네이버 커머스','쿠팡'],contents:['상품','옵션','판매상태']}),
  Object.freeze({id:'orders',label:'주문·배송',sources:['Cafe24','네이버 커머스','쿠팡','우체국택배'],contents:['주문','운송장','배송조회 결과']}),
  Object.freeze({id:'cs',label:'고객·CS',sources:['Cafe24','네이버 커머스','쿠팡'],contents:['문의','클레임','취소·반품·교환']}),
  Object.freeze({id:'finance',label:'정산·광고',sources:['네이버 검색광고','네이버 커머스','쿠팡'],contents:['정산','광고비','캠페인·키워드']}),
  Object.freeze({id:'inventory',label:'재고',sources:['Cafe24','네이버 커머스','쿠팡'],contents:['판매재고','로켓그로스 재고']}),
  Object.freeze({id:'operations',label:'운영 기록',sources:['Supabase'],contents:['작업 큐','API','FILE/MANUAL','실행 이력']})
]);
const DEFAULT_JOBS=Object.freeze([
  Object.freeze({id:'vercel-cron',label:'Vercel Cron',status:'VERIFY_REQUIRED',schedule:'매일·매주 예약 작업',route:'허브 서버'}),
  Object.freeze({id:'fixed-ip',label:'서울 고정 IP 워커',status:'VERIFY_REQUIRED',schedule:'대기열 상시 확인',route:'쿠팡·네이버 커머스·우체국'}),
  Object.freeze({id:'systemd',label:'systemd',status:'VERIFY_REQUIRED',schedule:'워커 프로세스 자동 복구',route:'고정 IP 서버'}),
  Object.freeze({id:'watchdog',label:'Supabase 워치독',status:'VERIFY_REQUIRED',schedule:'10분 간격',route:'생존 신호·장기 작업'})
]);

const text=value=>String(value==null?'':value).trim();
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const status=value=>text(value||'VERIFY_REQUIRED').toUpperCase();
const good=value=>['READY','READ_READY','WRITE_READY','RUNNING','WATCHING'].includes(status(value));
const dateLabel=value=>{
  if(!value)return '확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
};
const freshness=(value,now)=>{
  const at=new Date(value||0),current=new Date(now||Date.now());
  if(!value||Number.isNaN(at.getTime())||Number.isNaN(current.getTime()))return 'NO_DATA';
  const minutes=Math.max(0,(current-at)/60000);
  return minutes<=90?'LIVE':minutes<=24*60?'FRESH':minutes<=72*60?'STALE':'EXPIRED';
};
function serviceSource(data,id){
  if(Array.isArray(data.services))return data.services.find(item=>text(item.id)===id)||{};
  if(['cafe24','coupang'].includes(id)){
    const platform=id==='cafe24'?'CAFE24':'COUPANG';
    const row=data.collectionCenter?.channels?.find(item=>item.platform===platform)||{};
    const connection=data.channelConnections?.channels?.find(item=>item.platform===platform)||{};
    const connected=['READ_READY','WRITE_READY'].includes(connection.status);
    return {
      id,status:row.health_status==='RUNNING'?'RUNNING':row.health_status==='READY'&&connected?'READY':row.health_status||connection.status||'VERIFY_REQUIRED',
      summary:row.connection_summary||connection.summary||row.latest_collection_summary,lastSuccessAt:row.last_success_at,
      configuration:connection.status==='SETUP_REQUIRED'?'SETUP_REQUIRED':'CONFIGURED',read:connected?'READ_READY':'UNVERIFIED',write:connection.status==='WRITE_READY'?'GUARDED':'LOCKED',job:row.health_status==='RUNNING'?'RUNNING':'IDLE',previousSuccess:row.data_mode==='PREVIOUS'
    };
  }
  if(['naver-ads','naver-commerce'].includes(id)){
    const key=id==='naver-ads'?'searchAds':'commerce';
    const row=data.naverApiCenter?.services?.find(item=>item.key===key)||{};
    return {id,status:row.status,summary:row.summary,lastSuccessAt:row.lastSuccessAt,configuration:row.credentialReady?'CONFIGURED':'SETUP_REQUIRED',read:row.status==='READY'?'READ_READY':'UNVERIFIED',write:row.writeEnabled?'OWNER_APPROVAL':'LOCKED',job:row.status==='RUNNING'?'RUNNING':'IDLE',previousSuccess:row.previousSuccess};
  }
  if(id==='supabase')return {id,status:data.generatedAt?'READY':'VERIFY_REQUIRED',summary:data.generatedAt?'운영 데이터가 서버에서 정규화됐어요.':'저장 상태 확인 필요',lastSuccessAt:data.generatedAt,configuration:data.generatedAt?'CONFIGURED':'SETUP_REQUIRED',read:data.generatedAt?'READ_READY':'UNVERIFIED',write:'SERVICE_ROLE_ONLY',job:data.generatedAt?'WATCHING':'IDLE'};
  return {};
}

function normalizeService(definition,data){
  const source=serviceSource(data,definition.id);
  const serviceStatus=status(source.status);
  return Object.freeze({
    id:definition.id,label:definition.label,meta:definition.meta,brand:definition.brand,tone:definition.tone,
    status:serviceStatus,statusLabel:{READY:'정상',RUNNING:'작업 중',PARTIAL:'일부 확인',STALE:'갱신 필요',FAILED:'오류 확인',SETUP_REQUIRED:'설정 필요',VERIFY_REQUIRED:'읽기 확인 필요'}[serviceStatus]||'확인 필요',
    lastSuccessAt:source.lastSuccessAt||null,lastSuccessLabel:dateLabel(source.lastSuccessAt),
    previousSuccess:Boolean(source.previousSuccess),configuration:status(source.configuration),read:status(source.read),write:status(source.write),job:status(source.job),
    summary:text(source.summary)||({READY:'최근 읽기와 저장 흐름이 확인됐어요.',RUNNING:'현재 수집 작업이 진행 중이에요.',FAILED:'최근 시도가 실패해 이전 성공 자료를 유지해요.',SETUP_REQUIRED:'서버 연결 정보를 확인해야 해요.'}[serviceStatus]||'첫 읽기 검증이 필요해요.')
  });
}

function flowModel(services){
  const configured=services.filter(item=>item.configuration==='CONFIGURED').length;
  const readable=services.filter(item=>['READY','READ_READY'].includes(item.read)).length;
  const running=services.filter(item=>item.job==='RUNNING').length;
  const store=services.find(item=>item.id==='supabase');
  const reflected=services.filter(item=>['READY','RUNNING'].includes(item.status)).length;
  const values=[`${configured}/${services.length}`,`${readable}/${services.length}`,running?`${running}개 실행 중`:'대기 중',good(store?.status)?'저장 준비':'확인 필요',`${reflected}/${services.length}`];
  const states=[configured===services.length?'READY':'ATTENTION',readable===services.length?'READY':'ATTENTION',running?'RUNNING':'IDLE',good(store?.status)?'READY':'ATTENTION',reflected===services.length?'READY':'ATTENTION'];
  return Object.freeze(FLOW.map((item,index)=>Object.freeze({...item,value:values[index],status:states[index]})));
}

function buildPhase28SystemModel(data={},options={}){
  const services=Object.freeze(CORE_SERVICES.map(definition=>normalizeService(definition,data)));
  const inputJobs=Array.isArray(data.jobs)?data.jobs:[];
  const jobs=Object.freeze(DEFAULT_JOBS.map(definition=>Object.freeze({...definition,...(inputJobs.find(item=>item.id===definition.id)||{})})));
  const recoverySource=data.recovery||{};
  const recovery=Object.freeze([
    Object.freeze({id:'previous',label:'이전 성공 자료',value:finite(recoverySource.previousSuccess),unit:'개 연결',description:'새 요청 실패 시 마지막 성공 표본을 구분해 유지'}),
    Object.freeze({id:'retry',label:'재시도 대기',value:finite(recoverySource.retryWaiting),unit:'건',description:'중복 실행 없이 다음 재시도 시각까지 대기'}),
    Object.freeze({id:'dead-letter',label:'DEAD_LETTER',value:finite(recoverySource.deadLetters),unit:'건',description:'반복 실패 작업을 격리해 사장님이 확인'}),
    Object.freeze({id:'read-only',label:'읽기 전용 점검',value:finite(recoverySource.readOnlyChecks)||services.length,unit:'개 연결',description:'실제 쓰기 없이 설정·읽기·최신성을 독립 확인'})
  ]);
  return Object.freeze({
    generatedAt:data.generatedAt||null,error:text(data.error),writePolicy:'GUARDED',services,workspaces:WORKSPACES,
    initialWorkspace:WORKSPACES.some(item=>item.id===text(options.workspace||data.loadedWorkspace))?text(options.workspace||data.loadedWorkspace):'connections',
    flow:flowModel(services),datasets:DATASETS,jobs,recovery,
    summary:Object.freeze({ready:services.filter(item=>item.status==='READY').length,running:services.filter(item=>item.status==='RUNNING').length,attention:services.filter(item=>!['READY','RUNNING'].includes(item.status)).length,deadLetters:finite(recoverySource.deadLetters)}),
    policy:Object.freeze({coreOnly:true,providerIsolation:true,detailLoading:'ON_DEMAND',detailCache:'SESSION',missingAsZero:false,rawCredentialsExposed:false,externalWrites:false})
  });
}

function buildPhase28SystemProviderDetail(data={},providerId){
  const definition=CORE_SERVICES.find(item=>item.id===text(providerId));
  if(!definition)throw new Error('지원하지 않는 핵심 연결입니다.');
  const service=normalizeService(definition,data);
  const source=serviceSource(data,definition.id);
  return Object.freeze({
    id:definition.id,label:definition.label,meta:definition.meta,brand:definition.brand,tone:definition.tone,status:service.status,statusLabel:service.statusLabel,summary:service.summary,
    axes:Object.freeze({configuration:service.configuration,read:service.read,freshness:freshness(service.lastSuccessAt,data.generatedAt),write:service.write,job:service.job}),
    facts:Object.freeze([
      Object.freeze({label:'자격증명 위치',value:'서버 환경변수 · 화면 비노출'}),
      Object.freeze({label:'마지막 성공',value:service.lastSuccessLabel}),
      Object.freeze({label:'실행 위치',value:text(source.executor)||({cafe24:'Vercel 서버','naver-ads':'Vercel 서버','naver-commerce':'서울 고정 IP 워커',coupang:'서울 고정 IP 워커',epost:'서울 고정 IP 워커',supabase:'서버측 저장소'}[definition.id])}),
      Object.freeze({label:'보호 장치',value:text(source.guard)||'읽기 우선 · 중복 방지 · 쓰기 잠금'})
    ]),
    datasets:Object.freeze([...definition.datasets]),action:definition.action,previousSuccess:service.previousSuccess,lastSuccessAt:service.lastSuccessAt
  });
}

module.exports={CORE_SERVICES,CORE_SERVICE_IDS,WORKSPACES,FLOW,DATASETS,buildPhase28SystemModel,buildPhase28SystemProviderDetail};
