export const PLATFORM_LABEL={NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24',EPOST:'우체국',ALL:'전체'};

const HEALTH_LABEL={READY:'정상',RUNNING:'수집 중',PARTIAL:'일부 확인',FAILED:'수집 실패',STALE:'갱신 필요',WAITING:'수집 대기'};
const CONNECTION_LABEL={READ_READY:'읽기 연결',WRITE_READY:'읽기·쓰기 연결',RECONNECT_REQUIRED:'재연결 필요',SETUP_REQUIRED:'설정 필요',VERIFY_REQUIRED:'연결 확인',FAILED:'연결 실패'};

export function dateTime(value){
  if(!value)return '기록 없음';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '시각 확인 필요';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}`;
}

function channelTone(channel={}){
  if(['FAILED','PARTIAL'].includes(channel.health_status))return 'danger';
  if(['STALE','WAITING'].includes(channel.health_status)||!['READ_READY','WRITE_READY'].includes(channel.connection_status))return 'warning';
  if(channel.health_status==='RUNNING')return 'running';
  return 'ready';
}

function friendlyMessage(value){
  if(!value)return '';
  if(typeof value!=='string')return String(value);
  const trimmed=value.trim();
  if(!trimmed.startsWith('[')&&!trimmed.startsWith('{'))return trimmed;
  try{
    const parsed=JSON.parse(trimmed);
    const rows=Array.isArray(parsed)?parsed:[parsed];
    const messages=rows.map(item=>item?.message||item?.error).filter(Boolean);
    return messages.length?messages.join(' · '):trimmed;
  }catch{return trimmed;}
}

export function workerHeartbeatReady(reliability={}){
  const workers=reliability.worker?.workers||[];
  return workers.length>0&&workers.every(worker=>!worker.stale);
}

export function buildExceptions(center={},alerts=[]){
  const deadLetters=center.reliability?.dead_letters||[];
  const channelItems=(center.channels||[]).filter(item=>channelTone(item)!=='ready'&&channelTone(item)!=='running').map(item=>({
    id:`channel-${item.platform}`,kind:'CHANNEL',tone:channelTone(item),platform:item.platform,
    title:`${item.label||PLATFORM_LABEL[item.platform]} ${item.health_status==='READY'?(CONNECTION_LABEL[item.connection_status]||'연결 확인'):(HEALTH_LABEL[item.health_status]||'상태 확인')}`,
    message:friendlyMessage(item.error_message||item.action?.message||item.connection_summary),
    at:item.last_attempt_at
  }));
  const failedItems=deadLetters.map(item=>({id:`${item.kind}-${item.id}`,kind:'DEAD_LETTER',tone:'danger',platform:/EPOST/i.test(`${item.kind||''} ${item.title||''}`)?'EPOST':item.target||'COUPANG',title:item.title,message:friendlyMessage(item.error),at:item.failed_at,raw:item}));
  const alertItems=(alerts||[]).filter(item=>String(item.status||'OPEN').toUpperCase()==='OPEN').map(item=>({id:`alert-${item.id}`,kind:'ALERT',tone:item.severity==='ERROR'?'danger':'warning',platform:item.platform,title:item.title,message:friendlyMessage(item.message),at:item.created_at}));
  const seen=new Set();
  return [...failedItems,...channelItems,...alertItems].filter(item=>{
    const normalizedTitle=String(item.title||'').trim().replace(/\s+/g,' ').toLowerCase();
    const key=`${item.platform||'ALL'}:${normalizedTitle}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
