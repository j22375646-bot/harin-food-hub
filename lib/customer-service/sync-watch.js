'use strict';

const PENDING=new Set(['PENDING','RUNNING','RETRYING']);
const CHANNEL_NAMES={CAFE24:'Cafe24',COUPANG:'쿠팡',NAVER:'네이버'};
const STATUS_LABELS={SUCCESS:'수집 완료',PARTIAL:'일부 확인 필요',FAILED:'수집 실패',CANCELLED:'수집 취소',SETUP_REQUIRED:'설정 필요',PENDING:'수집 대기',RUNNING:'수집 중',RETRYING:'재시도 중',CHECK_REQUIRED:'결과 확인 필요'};

function collectionJobs(result={}){
  return (result.jobs||[]).map(job=>({
    platform:job.platform,id:job.data?.request?.id||job.id||null,
    status:job.skipped?'SETUP_REQUIRED':job.ok===false?'FAILED':job.data?.request?.id?'PENDING':job.data?.status||job.status||'CHECK_REQUIRED'
  }));
}

function collectionSummary(jobs=[]){
  return jobs.map(job=>`${CHANNEL_NAMES[job.platform]||'채널'} ${STATUS_LABELS[job.status]||'결과 확인 필요'}`).join(' · ');
}

function replyBlockedReason(row){
  if(!row||row.kind!=='INQUIRY')return '답변할 문의를 선택하세요.';
  if(row.completed)return '이미 처리 완료된 문의입니다. 최신 상태를 확인하세요.';
  if(row.platform!=='COUPANG'||row.source?.inquiryType!=='CALL_CENTER')return '';
  if(row.source.statusVerified!==true)return '고객센터 문의 상태를 확인하지 못했습니다. 문의를 다시 수집하세요.';
  if(!row.source.parentAnswerId)return '현재 답변 대상이 확인되지 않았습니다. 문의를 다시 수집하세요.';
  if(row.source.canReply!==true||row.source.replyRequired!==true)return '현재 상태에서는 고객센터 답변이 허용되지 않습니다. 원본 처리 상태를 확인하세요.';
  return '';
}

function waitForPoll(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason||new Error('수집 확인 중단'));return;}
    const abort=()=>{clearTimeout(timer);reject(signal.reason||new Error('수집 확인 중단'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});
  });
}

async function watchCustomerServiceSync(initial,{fetchImpl=fetch,wait=waitForPoll,signal,onUpdate=()=>{},maxAttempts=60,intervalMs=2000}={}){
  signal?.throwIfAborted();
  let jobs=collectionJobs(initial);
  onUpdate(jobs);
  for(let attempt=0;attempt<maxAttempts;attempt+=1){
    const pending=jobs.filter(job=>PENDING.has(job.status));
    if(!pending.length)return {jobs,timedOut:false};
    if(pending.some(job=>!job.id||!['COUPANG','NAVER'].includes(job.platform)))throw new Error('수집 작업 번호를 확인하지 못했습니다. 시스템 처리기록을 확인하세요.');
    await wait(intervalMs,signal);
    signal?.throwIfAborted();
    const query=new URLSearchParams(pending.map(job=>[job.platform==='COUPANG'?'coupangId':'naverId',job.id]));
    const timeout=AbortSignal.timeout(10000);
    const response=await fetchImpl(`/api/customer-service/sync?${query}`,{cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout});
    const result=await response.json();
    signal?.throwIfAborted();
    if(!response.ok)throw new Error(result.error||'수집 결과를 확인하지 못했습니다.');
    jobs=jobs.map(job=>{
      if(!PENDING.has(job.status))return job;
      const updated=(result.jobs||[]).find(item=>item.platform===job.platform&&item.id===job.id);
      return {...job,status:updated?.status||'CHECK_REQUIRED'};
    });
    onUpdate(jobs);
  }
  return {jobs,timedOut:jobs.some(job=>PENDING.has(job.status))};
}

module.exports={collectionJobs,collectionSummary,watchCustomerServiceSync,replyBlockedReason};
