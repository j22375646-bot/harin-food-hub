'use strict';

const {createHash}=require('node:crypto');
const {buildDeferredCredentialChecklist}=require('./deferred-credential-checklist.js');

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
  WORKER_WATCHDOG:{mode:'ALERT_DEDUPE',label:'10분 호출 버킷·알림 지문 중복 차단',phase:'21-5'},
  REPORT_SCHEDULES:{mode:'AUTOMATION_RUN_LEASE',label:'일·주·월 예약 키 단일 실행 임대',phase:'21-5'}
};

function laneAutomationRuns(laneKey,runs=[]){
  const exact=`EXECUTION_LANE_${laneKey}`;
  if(laneKey==='REPORT_SCHEDULES')return runs.filter(row=>row.job_name===exact||contains(row.job_name,'PLATFORM_REPORTS'));
  if(laneKey==='WORKER_WATCHDOG')return runs.filter(row=>row.job_name===exact||contains(row.job_name,'WORKER_WATCHDOG'));
  return runs.filter(row=>row.job_name===exact);
}

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

function topologyFingerprint(lanes=[]){
  const snapshot=lanes.map(lane=>({lane_key:lane.lane_key,ownerKey:lane.ownerKey,guardMode:lane.guardMode,mode:lane.mode,migration_authorized:Boolean(lane.migration_authorized)}));
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0,12);
}

function buildExecutionTopology({controls=[],syncRequests=[],operationRequests=[],automationRuns=[],heartbeats=[],syncLogs=[],issues=[],env=process.env,nativeQueueEnabled=false,now=new Date()}={}){
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
    const guardedRuns=laneAutomationRuns(control.lane_key,automationRuns),recoveries=guardedRuns.reduce((sum,row)=>sum+Number(row.recovery_count||0),0),latestFailure=latest(guardedRuns.filter(row=>row.status==='FAILED'));
    return {...control,state,guardMode:strategy.mode,guardLabel:strategy.label,guardPhase:strategy.phase,recoveryCount:recoveries,recoveryState:latestFailure&&stamp(latestFailure)===stamp(latest(guardedRuns))?'CHECK':recoveries?'RECOVERED':'READY',lastFailureAt:stamp(latestFailure),protectionState:state==='COLLISION_RISK'||state==='BLOCKED'?'BLOCKED':state==='CHECK'?'CHECK':'PROTECTED',ownerKey:`${control.current_trigger}:${control.current_executor}:${control.queue_backend}`,lastEvidenceAt:stamp(evidence),evidenceStatus:evidence?.status||null,evidenceLabel:evidence?`${evidence.operation_type||evidence.request_type||evidence.job_type||evidence.job_name||evidence.service_name||'실행 신호'} · ${evidence.status||'확인'}`:'운영 설정만 확인됨'};
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
  const nowMs=new Date(now).getTime(),recentFailures=automationRuns.filter(row=>row.status==='FAILED'&&nowMs-new Date(stamp(row)||0).getTime()<=24*60*60*1000),recentRecoveries=automationRuns.filter(row=>Number(row.recovery_count||0)>0&&nowMs-new Date(stamp(row)||0).getTime()<=7*24*60*60*1000);
  const recovery={phase:'21-6',status:recentFailures.length?'CHECK':'READY',failedRuns24h:recentFailures.length,recoveredRuns7d:recentRecoveries.reduce((sum,row)=>sum+Number(row.recovery_count||0),0),previousSuccessPreserved:true,rules:['현재 실패를 성공으로 표시하지 않음','이전 성공 자료와 저장 결과 유지','정체 임대는 다음 동일 요청이 회수','부분 실행 묶음은 통째로 자동 재시도하지 않음']};
  const hardBlocked=collisionKeys.length>0||lanes.some(item=>item.mode!=='OBSERVE'&&!item.migration_authorized);
  const handoverChecks=[
    {key:'OWNERS',label:'현재 실행 소유자 6개 확인',ready:lanes.every(item=>Boolean(item.current_trigger&&item.current_executor))},
    {key:'GUARDS',label:'모든 경로 단일 실행 보호',ready:protectedLanes===lanes.length},
    {key:'COLLISIONS',label:'활성 멱등키 중복 없음',ready:collisionKeys.length===0},
    {key:'WORKER',label:'고정 IP 워커 최근 신호',ready:workerReady},
    {key:'QUEUE',label:'인수 전 진행 작업 비움',ready:activeQueue===0},
    {key:'FAILURES',label:'최근 24시간 실패 확인',ready:recentFailures.length===0},
    {key:'DATASETS',label:'전환 근거 조회 오류 없음',ready:issues.length===0}
  ];
  const handoverStatus=hardBlocked?'BLOCKED':handoverChecks.every(item=>item.ready)?'READY':'WAIT';
  const handover={
    phase:'21-7',status:handoverStatus,checks:handoverChecks,
    readyChecks:handoverChecks.filter(item=>item.ready).length,totalChecks:handoverChecks.length,
    snapshotHash:topologyFingerprint(lanes),ownershipChanges:0,changesApplied:false,
    message:handoverStatus==='READY'?'소유권을 바꾸기 전 검토 조건이 모두 준비됐어요.':handoverStatus==='BLOCKED'?'중복 또는 승인되지 않은 경로 때문에 인수를 차단했어요.':'현재 실행은 유지하고 남은 조건을 기다리고 있어요.'
  };
  const credentialChecklist=buildDeferredCredentialChecklist(env);
  return {
    phase:'21-7 · 21-8',generatedAt:new Date(now).toISOString(),mode:'FINAL_READINESS',lanes,dryRun,recovery,handover,credentialChecklist,issues,
    summary:{lanes:lanes.length,activeLanes:lanes.filter(item=>item.state==='ACTIVE').length,protectedLanes,collisionKeys:collisionKeys.length,activeQueue,legacyWithoutKey:legacyWithoutKey(syncRequests)+legacyWithoutKey(operationRequests)+legacyWithoutKey(automationRuns),workerReady,nativeQueueEnabled:Boolean(nativeQueueEnabled),switchReady,manualLocks:0,recoveredRuns:recovery.recoveredRuns7d,failedRuns:recovery.failedRuns24h,handoverReady:handover.status==='READY',credentialGroups:credentialChecklist.groups.length,credentialFields:credentialChecklist.total,missingCredentialFields:credentialChecklist.missing},
    worker:{ready:workerReady,ageMinutes:workerAgeMinutes,lastSeenAt:heartbeat?.last_seen_at||heartbeat?.updated_at||null,sourceIp:heartbeat?.source_ip||null},
    collisions:collisionKeys,
    protections:[
      '21-3 드라이런은 현재 systemd·Vercel Cron·Supabase 실행 경로를 바꾸지 않고 전환 조건만 확인합니다.',
      '21-4 단일 실행 임대는 같은 시간·날짜 작업이 다시 들어오면 기존 결과를 재사용합니다.',
      '21-5는 일·주·월 보고서와 워커 감시 호출까지 같은 단일 실행 규칙으로 보호합니다.',
      '21-6은 실패를 성공으로 바꾸지 않고 이전 성공 자료를 유지하며 정체 임대만 다음 요청이 회수합니다.',
      '21-7은 소유자를 바꾸지 않고 현재 경로·중복·워커·실패 근거를 스냅샷으로 대조합니다.',
      '21-8은 유예한 외부 API 키의 이름과 입력 위치만 보여주며 키 값은 서버 밖으로 보내지 않습니다.',
      '같은 멱등키가 활성 상태로 두 번 존재하면 전환을 차단합니다.',
      '새 경로는 기존 경로를 끄고 최신 읽기 확인을 마치기 전에는 쓰기를 맡지 않습니다.',
      '과거 멱등키 없는 행은 운영 대기열과 분리해 참고 기록으로만 표시합니다.',
      'Supabase 네이티브 Queue는 현재 사용하지 않으며 검증 전 연결 완료로 표시하지 않습니다.'
    ]
  };
}

module.exports={ACTIVE_STATUSES,FALLBACK_CONTROLS,GUARD_STRATEGIES,laneAutomationRuns,buildExecutionTopology,duplicateKeys,legacyWithoutKey,topologyFingerprint};
