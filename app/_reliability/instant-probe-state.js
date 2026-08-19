'use client';

const SUCCESS_STATUSES=new Set(['READY','PARTIAL','NO_DATA']);

function normalizeStatus(value){
  const status=String(value||'READY').toUpperCase();
  if(status==='SUCCESS')return 'READY';
  if(status==='FAILED')return 'FAILED';
  return status;
}

function attemptAt(result){
  return result?.snapshot?.fetched_at||result?.verifiedAt||result?.fetched_at||new Date().toISOString();
}

function nextChecks(checks,status){
  return (checks||[]).map(item=>{
    if(['read','storage','privacy'].includes(item.key))return {...item,status:item.key==='read'?status:'READY'};
    if(['읽기 전용 확인','공급자 읽기 확인','현재 사용 조건'].includes(item.label))return {...item,status};
    if(/저장|개인정보|집계값/.test(item.label||''))return {...item,status:'READY'};
    return item;
  });
}

function nextCapabilities(capabilities,status){
  const readStatus=SUCCESS_STATUSES.has(status)?status:'NOT_TESTED';
  return (capabilities||[]).map(item=>({...item,readStatus}));
}

export function mergeProbeService(service,result,{summary}={}){
  const status=normalizeStatus(result?.status||result?.snapshot?.status);
  const at=attemptAt(result);
  const succeeded=SUCCESS_STATUSES.has(status);
  return {
    ...service,
    status,
    summary:summary||result?.summary||service.summary,
    errorMessage:null,
    previousSuccess:false,
    lastAttemptAt:at,
    lastSuccessAt:succeeded?at:service.lastSuccessAt,
    checks:nextChecks(service.checks,status),
    capabilities:nextCapabilities(service.capabilities,status),
    quota:result?.usage||service.quota
  };
}

export function failProbeService(service,error){
  return {
    ...service,
    status:'FAILED',
    errorMessage:String(error?.message||error||'연결 확인 실패'),
    previousSuccess:Boolean(service.lastSuccessAt),
    lastAttemptAt:new Date().toISOString(),
    checks:nextChecks(service.checks,'FAILED'),
    capabilities:nextCapabilities(service.capabilities,'FAILED')
  };
}

export function replaceProbeService(services,key,nextService){
  return (services||[]).map(service=>service.key===key?nextService:service);
}

export function serviceSummary(services,{noDataReady=true}={}){
  const readyStatuses=noDataReady?['READY','NO_DATA']:['READY'];
  return {
    ready:(services||[]).filter(item=>readyStatuses.includes(item.status)).length,
    attention:(services||[]).filter(item=>!readyStatuses.includes(item.status)).length
  };
}
