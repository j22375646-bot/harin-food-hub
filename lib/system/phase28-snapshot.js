'use strict';

const {CORE_SERVICE_IDS}=require('../ui/phase28-adapters/system.js');

const ACTIVE=new Set(['PENDING','QUEUED','RUNNING','RETRYING']);
const SUCCESS=new Set(['SUCCESS','READY']);
const text=value=>String(value==null?'':value).trim();
const time=value=>new Date(value||0).getTime()||0;
const latest=rows=>[...(rows||[])].sort((a,b)=>time(b.finished_at||b.executed_at||b.last_seen_at||b.started_at||b.created_at)-time(a.finished_at||a.executed_at||a.last_seen_at||a.started_at||a.created_at))[0]||null;
const envReady=(env,names)=>names.every(name=>text(env[name]));
const jobTime=row=>row?.finished_at||row?.executed_at||row?.last_success_at||row?.started_at||row?.created_at||null;

async function settle(query){
  try{
    const result=await query;
    if(result?.error)return {data:[],error:true};
    return {data:result?.data??[],error:false};
  }catch{return {data:[],error:true};}
}

function syncRowsFor(syncs,id){
  if(id==='cafe24')return syncs.filter(row=>row.platform==='CAFE24');
  if(id==='naver-commerce')return syncs.filter(row=>row.platform==='NAVER'&&/COMMERCE/.test(row.job_type||''));
  if(id==='naver-ads')return syncs.filter(row=>row.platform==='NAVER'&&!/COMMERCE|API_HUB/.test(row.job_type||''));
  if(id==='coupang')return syncs.filter(row=>row.platform==='COUPANG');
  return [];
}

function statusFrom(attempt,configured){
  const value=text(attempt?.status).toUpperCase();
  if(ACTIVE.has(value))return 'RUNNING';
  if(value==='SUCCESS')return 'READY';
  if(value==='PARTIAL')return 'PARTIAL';
  if(value==='FAILED')return 'FAILED';
  return configured?'VERIFY_REQUIRED':'SETUP_REQUIRED';
}

function readFrom(status){
  return {READY:'READ_READY',RUNNING:'READ_READY',PARTIAL:'PARTIAL',FAILED:'FAILED',SETUP_REQUIRED:'SETUP_REQUIRED'}[status]||'UNVERIFIED';
}

function serviceRow(id,{syncs,oauth,heartbeats,operations,queryErrors,env,generatedAt}){
  const definitions={
    cafe24:{configured:Boolean(oauth?.token_data?.access_token),write:'GUARDED',executor:'Vercel 서버'},
    'naver-ads':{configured:envReady(env,['NAVER_CUSTOMER_ID','NAVER_API_KEY','NAVER_SECRET_KEY']),write:text(env.NAVER_SEARCH_AD_WRITE_ENABLED).toLowerCase()==='true'?'OWNER_APPROVAL':'LOCKED',executor:'Vercel 서버'},
    'naver-commerce':{configured:envReady(env,['NAVER_COMMERCE_CLIENT_ID','NAVER_COMMERCE_CLIENT_SECRET']),write:text(env.NAVER_COMMERCE_WRITE_ENABLED).toLowerCase()==='true'?'OWNER_APPROVAL':'LOCKED',executor:'서울 고정 IP 워커'},
    coupang:{configured:envReady(env,['COUPANG_VENDOR_ID','COUPANG_ACCESS_KEY','COUPANG_SECRET_KEY']),write:'GUARDED',executor:'서울 고정 IP 워커'},
    epost:{configured:Boolean(text(env.EPOST_API_KEY||env.EPOST_OPEN_API_KEY)&&text(env.EPOST_CUSTOMER_NO)&&text(env.EPOST_CONTRACT_APPROVAL_NO||env.EPOST_APPROVAL_NO)&&text(env.EPOST_OFFICE_SERIAL||env.EPOST_OFFICE_SER)),write:text(env.EPOST_LIVE_WRITES_ENABLED).toLowerCase()==='true'?'OWNER_APPROVAL':'LOCKED',executor:'서울 고정 IP 워커'},
    supabase:{configured:envReady(env,['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']),write:'SERVICE_ROLE_ONLY',executor:'서버측 저장소'}
  };
  const definition=definitions[id];
  let rows=syncRowsFor(syncs,id);
  if(id==='epost')rows=operations.filter(row=>String(row.operation_type||'').startsWith('EPOST_'));
  const attempt=latest(rows);
  const success=latest(rows.filter(row=>SUCCESS.has(text(row.status).toUpperCase())));
  const worker=latest(heartbeats);
  const workerAge=worker?Math.max(0,(time(generatedAt)-time(worker.last_seen_at))/60000):Infinity;
  let currentStatus=statusFrom(attempt,definition.configured);
  if(id==='supabase')currentStatus=definition.configured&&!queryErrors?'READY':definition.configured?'PARTIAL':'SETUP_REQUIRED';
  const workerJob=['naver-commerce','coupang','epost'].includes(id)&&worker?.current_job_type;
  const job=workerJob?'RUNNING':id==='supabase'&&definition.configured?'WATCHING':ACTIVE.has(text(attempt?.status).toUpperCase())?'RUNNING':'IDLE';
  const summary=currentStatus==='READY'?'최근 읽기와 저장 기록이 확인됐어요.'
    :currentStatus==='RUNNING'?'고정 IP 작업을 실행하고 있어요.'
    :currentStatus==='FAILED'?'최근 시도가 실패해 이전 성공 자료를 구분해 유지해요.'
    :currentStatus==='PARTIAL'?'일부 자료 또는 저장 경로를 다시 확인해야 해요.'
    :currentStatus==='SETUP_REQUIRED'?'서버 연결 정보를 확인해야 해요.':'설정 뒤 첫 읽기 검증이 필요해요.';
  return {
    id,status:currentStatus,summary,configuration:definition.configured?'CONFIGURED':'SETUP_REQUIRED',read:id==='supabase'?(currentStatus==='READY'?'READ_READY':'UNVERIFIED'):readFrom(currentStatus),write:definition.write,job,
    lastSuccessAt:id==='supabase'&&currentStatus==='READY'?generatedAt:jobTime(success),previousSuccess:Boolean(success&&attempt&&success!==attempt),executor:definition.executor,
    guard:id==='supabase'?'서비스 키 서버 전용 · 행 정책 분리':workerAge<15?'고정 IP 생존 신호 확인 · 중복 작업 방지':'읽기 우선 · 중복 작업 방지 · 쓰기 잠금'
  };
}

async function loadPhase28SystemSnapshot({db,env=process.env,now=new Date(),providerId=null}={}){
  if(providerId&&!CORE_SERVICE_IDS.includes(providerId))throw new Error('지원하지 않는 핵심 연결입니다.');
  if(!db||typeof db.from!=='function')throw new Error('시스템 상태 저장소를 확인할 수 없습니다.');
  const generatedAt=new Date(now).toISOString();
  const wants=id=>!providerId||providerId===id||id==='supabase';
  const empty=Promise.resolve({data:[],error:null});
  const [syncResult,oauthResult,heartbeatResult,operationResult,syncRequestResult,automationResult]=await Promise.all([
    settle(db.from('sync_logs').select('platform,job_type,status,started_at,finished_at,error_message,metadata').in('platform',['CAFE24','NAVER','COUPANG']).order('started_at',{ascending:false}).limit(providerId?60:140)),
    wants('cafe24')?settle(db.from('cafe24_oauth_tokens').select('token_data,updated_at').eq('mall_id',env.CAFE24_MALL_ID||'').maybeSingle()):settle(empty),
    (wants('coupang')||wants('naver-commerce')||wants('epost'))?settle(db.from('worker_heartbeats').select('worker_id,service_name,status,last_seen_at,last_success_at,last_error,current_job_type').order('last_seen_at',{ascending:false}).limit(8)):settle(empty),
    (wants('coupang')||wants('epost'))?settle(db.from('coupang_operation_requests').select('id,operation_type,status,created_at,started_at,executed_at,dead_lettered_at,attempt_count,error_message').order('created_at',{ascending:false}).limit(providerId?30:80)):settle(empty),
    wants('coupang')?settle(db.from('coupang_sync_requests').select('id,request_type,status,requested_at,started_at,finished_at,dead_lettered_at,attempt_count,error_message').order('requested_at',{ascending:false}).limit(providerId?30:80)):settle(empty),
    !providerId?settle(db.from('automation_runs').select('job_name,trigger_type,status,started_at,finished_at,scheduled_for,attempt_count').order('started_at',{ascending:false}).limit(80)):settle(empty)
  ]);
  const syncs=syncResult.data||[],oauth=oauthResult.data||null,heartbeats=heartbeatResult.data||[],operations=operationResult.data||[],syncRequests=syncRequestResult.data||[],automation=automationResult.data||[];
  const queryErrors=[syncResult,oauthResult,heartbeatResult,operationResult,syncRequestResult,automationResult].filter(item=>item.error).length;
  const ids=providerId?[providerId]:CORE_SERVICE_IDS;
  const services=ids.map(id=>serviceRow(id,{syncs,oauth,heartbeats,operations,queryErrors,env,generatedAt}));
  const worker=latest(heartbeats),workerAge=worker?Math.max(0,(time(generatedAt)-time(worker.last_seen_at))/60000):Infinity;
  const latestCron=latest(automation),cronStatus=latestCron?.status==='SUCCESS'?'READY':ACTIVE.has(latestCron?.status)?'RUNNING':'VERIFY_REQUIRED';
  const activeRows=[...operations,...syncRequests].filter(row=>ACTIVE.has(text(row.status).toUpperCase()));
  const deadRows=[...operations,...syncRequests].filter(row=>row.dead_lettered_at||(row.status==='FAILED'&&Number(row.attempt_count||0)>=3));
  const previousSuccess=services.filter(item=>item.previousSuccess).length;
  return {
    generatedAt,services,
    jobs:[
      {id:'vercel-cron',label:'Vercel Cron',status:cronStatus,schedule:'일간 수집 · 주간 인사이트',route:'Vercel 예약 경로'},
      {id:'fixed-ip',label:'서울 고정 IP 워커',status:workerAge<15?'READY':'VERIFY_REQUIRED',schedule:'대기열 상시 확인',route:'쿠팡·네이버 커머스·우체국'},
      {id:'systemd',label:'systemd',status:workerAge<15?'READY':'VERIFY_REQUIRED',schedule:'프로세스 자동 복구',route:'고정 IP 서버'},
      {id:'watchdog',label:'Supabase 워치독',status:workerAge<15?'READY':'VERIFY_REQUIRED',schedule:'10분 간격',route:'생존 신호·장기 작업'}
    ],
    recovery:{previousSuccess,retryWaiting:activeRows.length,deadLetters:deadRows.length,readOnlyChecks:services.filter(item=>item.configuration==='CONFIGURED').length},
    diagnostics:{queryErrors}
  };
}

module.exports={loadPhase28SystemSnapshot,statusFrom,readFrom,syncRowsFor};
