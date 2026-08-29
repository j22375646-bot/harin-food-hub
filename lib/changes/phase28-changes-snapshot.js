'use strict';

const REQUEST_FIELDS='id,change_type,platform,target_key,status,before_value,proposed_value,rollback_value,impact_preview,idempotency_key,created_at,approved_at,executed_at,verified_at,rolled_back_at,verification_result,error_message';
const AUDIT_FIELDS='id,change_request_id,event_type,from_status,to_status,created_at';

async function loadPhase28ChangesSnapshot({db,now=new Date(),naverWriteEnabled=false}={}){
  if(!db||typeof db.from!=='function')throw new Error('변경 기록 저장소를 확인할 수 없습니다.');
  const requestsPromise=db.from('financial_change_requests').select(REQUEST_FIELDS).order('created_at',{ascending:false}).limit(50);
  const auditsPromise=db.from('financial_change_audit_logs').select(AUDIT_FIELDS).order('created_at',{ascending:false}).limit(300);
  const [requestsResult,auditsResult]=await Promise.all([requestsPromise,auditsPromise]);
  if(requestsResult?.error)throw new Error(requestsResult.error.message||'변경 기록을 불러오지 못했습니다.');
  return {
    generatedAt:new Date(now).toISOString(),
    requests:requestsResult?.data||[],
    audits:auditsResult?.error?[]:auditsResult?.data||[],
    auditsError:auditsResult?.error?.message||null,
    naverWriteEnabled:naverWriteEnabled===true
  };
}

module.exports={REQUEST_FIELDS,AUDIT_FIELDS,loadPhase28ChangesSnapshot};
