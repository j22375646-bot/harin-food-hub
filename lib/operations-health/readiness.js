'use strict';

const configModule=require('./config.js');
const cloudWatch=require('./cloudwatch-client.js');
const vercel=require('./vercel-client.js');
const reliability=require('../operations/reliability-center.js');

const DEFINITIONS=[
  {key:'worker',provider:'WORKER_HEARTBEAT',label:'서울 고정 IP 워커',subtitle:'쿠팡 수집·출고 작업 생존 신호',icon:'server'},
  {key:'cloudwatch',provider:'AWS_CLOUDWATCH',label:'AWS CloudWatch',subtitle:'EC2 CPU·상태검사·경보 집계',icon:'analysis',endpoint:'/api/operations-health/cloudwatch/probe'},
  {key:'vercel',provider:'VERCEL',label:'Vercel 운영 상태',subtitle:'운영 주소 응답·최근 운영 배포',icon:'speed',endpoint:'/api/operations-health/vercel/probe'}
];

const ADAPTERS={AWS_CLOUDWATCH:cloudWatch,VERCEL:vercel};
const time=row=>new Date(row?.fetched_at||row?.created_at||0).getTime()||0;
const latest=rows=>[...rows].sort((a,b)=>time(b)-time(a))[0]||null;
const publicError=error=>{
  const message=String(error?.message||'운영 상태 확인에 실패했습니다.').replace(/\s+/g,' ').slice(0,180);
  if(/credential|signature|access.?key|secret|unauthorized|permission|401|403/i.test(message))return '읽기 전용 권한 또는 서버 연결 정보를 다시 확인해주세요.';
  if(/quota|rate.?limit|429/i.test(message))return '공급자 호출 한도를 확인해주세요. 이전 성공 자료는 그대로 보존됩니다.';
  if(/^\s*[<{[]/.test(message))return '공급자 오류 응답을 받았습니다. 잠시 뒤 다시 확인해주세요.';
  return message;
};

function workerService(heartbeats=[],now=new Date()){
  const health=reliability.buildWorkerHealth(heartbeats,new Date(now).getTime());const worker=health.workers[0]||null;
  const status=!worker?'VERIFY_REQUIRED':worker.stale?'FAILED':'READY';
  return {...DEFINITIONS[0],status,summary:{READY:'고정 IP 워커가 정상 신호를 보내고 있어요.',FAILED:'워커 생존 신호가 오래되었습니다.',VERIFY_REQUIRED:'워커 생존 신호가 아직 없어요.'}[status],detail:worker?`${worker.silence_minutes}분 전 신호 · ${worker.current_job_type||'대기 중'}`:'worker_heartbeats 첫 신호를 기다리고 있어요.',lastAttemptAt:worker?.last_seen_at||null,lastSuccessAt:worker?.last_success_at||null,previousSuccess:false,errorMessage:worker?.last_error||null,checks:[{key:'heartbeat',label:'생존 신호',status},{key:'fixed-ip',label:'서울 고정 IP 작업',status:worker?'READY':'VERIFY_REQUIRED'},{key:'privacy',label:'고객정보 없는 상태 집계',status:'READY'}],capabilities:[{key:'queue',label:'수집·출고 작업 생존 상태',readStatus:status,writeStatus:'NOT_APPLICABLE'}],action:null};
}

function providerStatus(provider,attempt,enabled,missing){
  if(!enabled)return 'LOCKED';
  if(provider==='VERCEL'&&attempt?.status==='PARTIAL')return 'PARTIAL';
  if(missing.length)return 'SETUP_REQUIRED';
  if(!attempt)return 'VERIFY_REQUIRED';
  if(attempt.status==='SUCCESS')return 'READY';
  if(attempt.status==='PARTIAL')return 'PARTIAL';
  if(attempt.status==='NO_DATA')return 'NO_DATA';
  return 'FAILED';
}

function providerSummary(provider,status,metric={}){
  if(provider==='AWS_CLOUDWATCH'){
    if(status==='READY')return `CPU ${metric.cpu_average_percent==null?'확인 필요':`${Number(metric.cpu_average_percent).toFixed(1)}%`} · 상태검사 ${Number(metric.status_check_failed||0)}건`;
    if(status==='PARTIAL')return `경보 ${Number(metric.alarm_counts?.alarm||0)}건 · 상태검사 ${Number(metric.status_check_failed||0)}건`;
  }
  if(provider==='VERCEL'){
    if(status==='READY')return `운영 주소 ${metric.public_status||200} · 최근 배포 ${metric.deployment_state||'READY'}`;
    if(status==='PARTIAL'&&metric.public_ok)return `운영 주소 ${metric.public_status||200} 정상 · 배포 API 설정 대기`;
  }
  return {FAILED:'최근 읽기 확인이 실패했어요.',VERIFY_REQUIRED:'첫 읽기 확인이 필요해요.',SETUP_REQUIRED:'읽기 전용 연결 정보를 나중에 입력하면 돼요.',LOCKED:'공급자 확인이 서버에서 중지되어 있어요.',NO_DATA:'사용할 운영 표본이 아직 없어요.',PARTIAL:'일부 신호만 확인했어요.'}[status]||'운영 상태를 확인해주세요.';
}

function providerService(def,snapshots,env){
  const config=configModule.providerConfig(def.provider,env);const missing=configModule.missingFields(def.provider,config);const rows=snapshots.filter(row=>row.provider===def.provider);const attempt=latest(rows);const success=latest(rows.filter(row=>row.status==='SUCCESS'));const status=providerStatus(def.provider,attempt,config.enabled,missing);const metric=attempt?.metric_summary||{};
  return {...def,status,credentialReady:missing.length===0,killSwitchEnabled:config.enabled,missingFields:missing,summary:providerSummary(def.provider,status,metric),detail:attempt?providerSummary(def.provider,status,metric):missing.length?`나중에 입력 · ${missing.join(' · ')}`:'첫 읽기 확인을 실행해주세요.',previousSuccess:Boolean(success&&success!==attempt),lastAttemptAt:attempt?.fetched_at||null,lastSuccessAt:success?.fetched_at||null,errorMessage:status==='FAILED'?publicError({message:attempt?.error_message}):null,checks:[{key:'credentials',label:'읽기 전용 연결 정보',status:missing.length?'SETUP_REQUIRED':'READY'},{key:'read',label:'공급자 읽기 확인',status},{key:'privacy',label:'집계값만 저장',status:attempt?'READY':'VERIFY_REQUIRED'}],capabilities:[{key:'health',label:def.provider==='AWS_CLOUDWATCH'?'CPU·상태검사·경보':'운영 응답·배포 상태',readStatus:['READY','PARTIAL'].includes(status)?status:'NOT_TESTED',writeStatus:'NOT_APPLICABLE'}],action:{endpoint:def.endpoint,label:def.provider==='AWS_CLOUDWATCH'?'AWS 상태 읽기 확인':'Vercel 상태 읽기 확인'}};
}

function buildOperationsHealth({snapshots=[],heartbeats=[],env=process.env,now=new Date()}={}){
  const services=[workerService(heartbeats,now),...DEFINITIONS.slice(1).map(def=>providerService(def,snapshots,env))];
  return {phase:'19-4',generatedAt:new Date(now).toISOString(),services,summary:{ready:services.filter(item=>item.status==='READY').length,attention:services.filter(item=>!['READY','NO_DATA'].includes(item.status)).length,setup:services.filter(item=>item.status==='SETUP_REQUIRED').length},rules:['워커·CloudWatch·Vercel은 자격증명과 결과를 서로 섞지 않습니다.','고객 주문·이름·연락처·주소와 원문 로그는 이 화면에 저장하지 않습니다.','한 공급자가 실패해도 다른 신호와 허브 화면은 계속 열립니다.','키 입력은 18~21단계 완료 뒤 한 번에 안내하며, 지금은 설정 필요로 정직하게 표시합니다.']};
}

async function saveSnapshot(db,row){const result=await db.from('operations_health_snapshots').insert(row).select('id,provider,status,fetched_at').single();if(result.error){const error=new Error(`운영 상태 저장 실패: ${result.error.message}`);error.code='OPERATIONS_HEALTH_SAVE_FAILED';throw error;}return result.data;}

async function probeProvider(provider,{db,env=process.env,fetchImpl=fetch,now=new Date()}={}){
  const config=configModule.providerConfig(provider,env);const missing=configModule.missingFields(provider,config);
  if(!config.enabled){const error=new Error('이 공급자는 서버 안전 스위치로 중지되어 있습니다.');error.code='PROVIDER_DISABLED';error.status=423;throw error;}
  if(provider!=='VERCEL'&&missing.length){const error=new Error(`필요한 서버 설정: ${missing.join(', ')}`);error.code='CONFIG_REQUIRED';error.status=412;throw error;}
  console.info('[operations-health] probe started',{provider,readOnly:true});
  try{
    const result=await ADAPTERS[provider].probe({config,missingFields:missing,fetchImpl,now});
    const stored=await saveSnapshot(db,{provider,status:result.status,metric_summary:result.metricSummary||{},source_timestamp:result.sourceTimestamp||null,fetched_at:new Date(now).toISOString(),metadata:{read_only:true,provider_isolated:true,no_raw_logs:true}});
    console.info('[operations-health] probe completed',{provider,status:result.status});return {provider,status:result.status,snapshot:stored};
  }catch(error){
    console.error('[operations-health] probe failed',{provider,code:error.code||'PROVIDER_READ_FAILED'});
    await saveSnapshot(db,{provider,status:'FAILED',metric_summary:{},fetched_at:new Date(now).toISOString(),error_code:error.code||'PROVIDER_READ_FAILED',error_message:publicError(error),metadata:{read_only:true,provider_isolated:true,no_raw_logs:true}}).catch(()=>{});throw error;
  }
}

module.exports={DEFINITIONS,buildOperationsHealth,probeProvider,publicError};
