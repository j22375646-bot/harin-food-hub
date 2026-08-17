'use strict';

const ACTIVE_STATUSES=new Set(['PENDING','RUNNING','EXECUTING','RETRY_WAIT','QUEUED','PROCESSING']);
const time=value=>new Date(value||0).getTime()||0;
const latest=(rows,fields=['finished_at','executed_at','last_seen_at','started_at','requested_at','created_at'])=>[...rows].sort((a,b)=>{
  const stamp=row=>fields.map(field=>time(row?.[field])).find(Boolean)||0;
  return stamp(b)-stamp(a);
})[0]||null;
const stamp=row=>row&&(row.finished_at||row.executed_at||row.last_seen_at||row.started_at||row.requested_at||row.created_at)||null;
const isActive=row=>ACTIVE_STATUSES.has(String(row?.status||'').toUpperCase());
const keyOf=row=>String(row?.idempotency_key||'').trim();
function duplicateKeys(rows){const counts=new Map();for(const row of rows.filter(isActive)){const key=keyOf(row);if(key)counts.set(key,(counts.get(key)||0)+1);}return [...counts].filter(([,count])=>count>1).map(([key,count])=>({key,count}));}
function legacyWithoutKey(rows){return rows.filter(row=>!keyOf(row)).length;}
function contains(value,needle){return String(value||'').toLowerCase().includes(String(needle).toLowerCase());}

const FALLBACK_CONTROLS=[
  {lane_key:'HOURLY_ORDERS',label:'시간별 주문·CS·배송 추적',current_trigger:'AWS_SYSTEMD',current_executor:'VERCEL_FUNCTION',queue_backend:'SUPABASE_CUSTOM_TABLE',mode:'OBSERVE',migration_authorized:false,schedule_label:'매시 정각',source_path:'harin-orders-hourly.timer -> /api/cron/hourly-orders'},
  {lane_key:'DAILY_COLLECTION',label:'매일 전체 채널 수집',current_trigger:'VERCEL_CRON',current_executor:'VERCEL_FUNCTION',queue_backend:'SUPABASE_CUSTOM_TABLE',mode:'OBSERVE',migration_authorized:false,schedule_label:'매일 05:30 KST',source_path:'vercel.json -> /api/cron/daily-sync'},
  {lane_key:'COUPANG_FIXED_IP_QUEUE',label:'쿠팡 고정 IP 수집 큐',current_trigger:'SUPABASE_TABLE',current_executor:'AWS_FIXED_IP_WORKER',queue_backend:'SUPABASE_CUSTOM_TABLE',mode:'OBSERVE',migration_authorized:false,schedule_label:'계속 감시',source_path:'coupang_sync_requests -> harin-coupang-worker'},
  {lane_key:'CHANNEL_OPERATION_QUEUE',label:'채널 작업·우체국 추적 큐',current_trigger:'SUPABASE_TABLE',current_executor:'AWS_FIXED_IP_WORKER',queue_backend:'SUPABASE_CUSTOM_TABLE',mode:'OBSERVE',migration_authorized:false,schedule_label:'계속 감시',source_path:'coupang_operation_requests -> harin-coupang-worker'},
  {lane_key:'WORKER_WATCHDOG',label:'고정 IP 워커 생존 감시',current_trigger:'SUPABASE_CRON',current_executor:'SUPABASE_DATABASE',queue_backend:'NONE',mode:'OBSERVE',migration_authorized:false,schedule_label:'10분마다',source_path:'cron.job -> run_worker_heartbeat_watchdog()'},
  {lane_key:'REPORT_SCHEDULES',label:'보고서 예약 실행',current_trigger:'VERCEL_CRON',current_executor:'VERCEL_FUNCTION',queue_backend:'NONE',mode:'OBSERVE',migration_authorized:false,schedule_label:'일·주·월 예약',source_path:'vercel.json -> report cron routes'}
];

const GUARD_STRATEGIES={
  HOURLY_ORDERS:{mode:'AUTOMATION_RUN_LEASE',label:'시간 버킷 단일 실행 임대',phase:'21-4'},
  DAILY_COLLECTION:{mode:'AUTOMATION_RUN_LEASE',label:'한국 날짜 단일 실행 임대',phase:'21-4'},
  COUPANG_FIXED_IP_QUEUE:{mode:'QUEUE_IDEMPOTENCY',label:'요청 멱등키·고정 IP 워커 임대',phase:'EXISTING'},
  CHANNEL_OPERATION_QUEUE:{mode:'QUEUE_IDEMPOTENCY',label:'작업 종류별 멱등키·재시도 임대',phase:'EXISTING'},
  WORKER_WATCHDOG:{mode:'ALERT_DEDUPE',label:'알림 지문 중복 차단',phase:'EXISTING'},
  REPORT_SCHEDULES:{mode:'AUTOMATION_RUN_LEASE',label:'보고서 예약 키 단일 실행 임대',phase:'EXISTING'}
};

function evidenceFor(laneKey,{syncRequests,operationRequests,automationRuns,heartbeats,syncLogs}){
  if(laneKey==='HOURLY_ORDERS')return latest([
    ...syncRequests.filter(row=>contains(row.idempotency_key,'hourly:')||contains(row.idempotency_key,'orders-hourly')),
    ...operationRequests.filter(row=>contains(row.idempotency_key,'hourly:'))
  ]);
  if(laneKey==='DAILY_COLLECTION')return latest([
    ...automationRuns.filter(row=>contains(row.trigger_type,'cron')&&(contains(row.job_name,'sync')||contains(row.job_name,'daily'))),
    ...syncLogs.filter(row=>contains(row.job_type,'fetch_all')||contains(row.job_type,'commerce_sync'))
  ]);
  if(laneKey==='COUPANG_FIXED_IP_QUEUE')return latest(syncRequests);
  if(laneKey==='CHANNEL_OPERATION_QUEUE')return latest(operationRequests);
  if(laneKey==='WORKER_WATCHDOG')return latest(heartbeats);
  if(laneKey==='REPORT_SCHEDULES')return latest(automationRuns.filter(row=>contains(row.job_name,'report')));
  return null;
}

function buildExecutionTopology({controls=[],syncRequests=[],operationRequests=[],automationRuns=[],heartbeats=[],syncLogs=[],nativeQueueEnabled=false,now=new Date()}={}){
  const rows=controls.length?controls:FALLBACK_CONTROLS;
  const syncDuplicates=duplicateKeys(syncRequests),operationDuplicates=duplicateKeys(operationRequests),automationDuplicates=duplicateKeys(automationRuns);
  const collisionKeys=[...syncDuplicates.map(item=>({...item,source:'수집 큐'})),...operationDuplicates.map(item=>({...item,source:'작업 큐'})),...automationDuplicates.map(item=>({...item,source:'예약 실행'}))];
  const heartbeat=latest(heartbeats),workerAgeMinutes=heartbeat?Math.max(0,Math.floor((time(now)-time(heartbeat.last_seen_at||heartbeat.updated_at))/60000)):null;
  const workerReady=Boolean(heartbeat&&workerAgeMinutes<=15&&['ONLINE','READY','SUCCESS'].includes(String(heartbeat.status||'').toUpperCase()));
  const activeSync=syncRequests.filter(isActive).length,activeOperations=operationRequests.filter(isActive).length,activeAutomation=automationRuns.filter(isActive).length;
  const lanes=rows.map(control=>{
    const evidence=evidenceFor(control.lane_key,{syncRequests,operationRequests,automationRuns,heartbeats,syncLogs});
    const workerLane=['COUPANG_FIXED_IP_QUEUE','CHANNEL_OPERATION_QUEUE','HOURLY_ORDERS'].includes(control.lane_key);
    const unauthorizedMode=control.mode!=='OBSERVE'&&!control.migration_authorized;
    const state=collisionKeys.length?'COLLISION_RISK':unauthorizedMode?'BLOCKED':workerLane&&!workerReady?'CHECK':evidence?'ACTIVE':'OBSERVE';
    const strategy=GUARD_STRATEGIES[control.lane_key]||{mode:'OBSERVE',label:'실행 경로 관찰',phase:'EXISTING'};
    return {...control,state,guardMode:strategy.mode,guardLabel:strategy.label,guardPhase:strategy.phase,protectionState:state==='COLLISION_RISK'||state==='BLOCKED'?'BLOCKED':state==='CHECK'?'CHECK':'PROTECTED',ownerKey:`${control.current_trigger}:${control.current_executor}:${control.queue_backend}`,lastEvidenceAt:stamp(evidence),evidenceStatus:evidence?.status||null,evidenceLabel:evidence?`${evidence.operation_type||evidence.request_type||evidence.job_type||evidence.job_name||evidence.service_name||'실행 신호'} · ${evidence.status||'확인'}`:'운영 설정만 확인됨'};
  });
  const activeQueue=activeSync+activeOperations+activeAutomation;
  const protectedLanes=lanes.filter(item=>item.protectionState==='PROTECTED').length;
  const switchReady=collisionKeys.length===0&&workerReady&&activeQueue===0&&lanes.every(item=>item.mode==='OBSERVE');
  const blockers=[];
  if(collisionKeys.length)blockers.push(`활성 멱등키 충돌 ${collisionKeys.length}건`);
  if(activeQueue)blockers.push(`진행 중인 작업 ${activeQueue}건`);
  if(!workerReady)blockers.push('고정 IP 워커 신호 확인 필요');
  if(lanes.some(item=>item.mode!=='OBSERVE'))blockers.push('관찰 모드가 아닌 경로 존재');
  const dryRun={
    phase:'21-3',status:blockers.length?'BLOCKED':'PASS',blockers,
    checkedLanes:lanes.length,guardedLanes:lanes.filter(item=>item.guardMode!=='OBSERVE').length,
    sequence:['현재 소유자 확인','실행 임대 획득','작업 한 번 실행','완료 결과 저장'],
    changesApplied:false
  };
  return {
    phase:'21-3 · 21-4',generatedAt:new Date(now).toISOString(),mode:'DRY_RUN_GUARDED',lanes,dryRun,
    summary:{lanes:lanes.length,activeLanes:lanes.filter(item=>item.state==='ACTIVE').length,protectedLanes,collisionKeys:collisionKeys.length,activeQueue,legacyWithoutKey:legacyWithoutKey(syncRequests)+legacyWithoutKey(operationRequests)+legacyWithoutKey(automationRuns),workerReady,nativeQueueEnabled:Boolean(nativeQueueEnabled),switchReady,manualLocks:0},
    worker:{ready:workerReady,ageMinutes:workerAgeMinutes,lastSeenAt:heartbeat?.last_seen_at||heartbeat?.updated_at||null,sourceIp:heartbeat?.source_ip||null},
    collisions:collisionKeys,
    protections:[
      '21-3 드라이런은 현재 systemd·Vercel Cron·Supabase 실행 경로를 바꾸지 않고 전환 조건만 확인합니다.',
      '21-4 단일 실행 임대는 같은 시간·날짜 작업이 다시 들어오면 기존 결과를 재사용합니다.',
      '같은 멱등키가 활성 상태로 두 번 존재하면 전환을 차단합니다.',
      '새 경로는 기존 경로를 끄고 최신 읽기 확인을 마치기 전에는 쓰기를 맡지 않습니다.',
      '과거 멱등키 없는 행은 운영 대기열과 분리해 참고 기록으로만 표시합니다.',
      'Supabase 네이티브 Queue는 현재 사용하지 않으며 검증 전 연결 완료로 표시하지 않습니다.'
    ]
  };
}

module.exports={ACTIVE_STATUSES,FALLBACK_CONTROLS,GUARD_STRATEGIES,buildExecutionTopology,duplicateKeys,legacyWithoutKey};
