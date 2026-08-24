'use strict';

const NAVER='NAVER';
const text=value=>String(value??'').trim();
const finite=value=>{
  if(value===null||value===undefined||value==='')return null;
  return Number.isFinite(Number(value))?Number(value):null;
};
const same=(left,right)=>text(left)===text(right);
const occurredAt=run=>run?.finished_at||run?.started_at||run?.created_at||null;

function outcomeFor(run,action,result,blocked){
  if(blocked)return {status:'BLOCKED',verified:false,reason:text(blocked.reason||blocked.message)||'안전 조건에서 변경을 멈췄습니다.'};
  if(result?.ok===true&&result?.verified===true)return {status:'VERIFIED',verified:true,reason:'네이버 반영 뒤 입찰가를 다시 확인했습니다.'};
  if(result?.ok===false)return {status:'FAILED',verified:false,reason:text(result.error)||text(run?.error_message)||'자동입찰 실행 결과를 다시 확인해주세요.'};
  if(text(run?.mode).toUpperCase()==='OBSERVE'||text(run?.status).toUpperCase()==='OBSERVED')return {status:'OBSERVED',verified:null,reason:'입찰가를 바꾸지 않고 계획만 기록했습니다.'};
  if(['FAILED','PARTIAL','SETUP_REQUIRED'].includes(text(run?.status).toUpperCase()))return {status:'FAILED',verified:false,reason:text(run?.error_message)||'자동입찰 실행 결과를 다시 확인해주세요.'};
  return {status:'PLANNED',verified:null,reason:action?'변경 계획을 기록했습니다.':'실행 결과를 확인해주세요.'};
}

function buildNaverBidKeywordHistory({runs=[],keywordId='',adgroupId=''}={}){
  const scoped=[];
  for(const run of Array.isArray(runs)?runs:[]){
    if(text(run?.platform)&&text(run.platform).toUpperCase()!==NAVER)continue;
    if(adgroupId&&!same(run?.ncc_adgroup_id,adgroupId))continue;
    const details=run?.details&&typeof run.details==='object'?run.details:{};
    const action=(Array.isArray(details.actions)?details.actions:[]).find(item=>same(item?.ncc_keyword_id,keywordId));
    const result=(Array.isArray(details.results)?details.results:[]).find(item=>same(item?.ncc_keyword_id,keywordId));
    const blocked=(Array.isArray(details.blocked)?details.blocked:[]).find(item=>same(item?.ncc_keyword_id,keywordId));
    if(!action&&!result&&!blocked)continue;
    const outcome=outcomeFor(run,action,result,blocked);
    const beforeBid=finite(action?.current_bid);
    const afterBid=outcome.status==='BLOCKED'?null:finite(result?.proposed_bid??action?.proposed_bid);
    scoped.push({
      platform:NAVER,run_id:text(run?.id),run_slot:text(run?.run_slot)||null,ncc_adgroup_id:text(run?.ncc_adgroup_id),ncc_keyword_id:text(keywordId),
      keyword:text(action?.keyword||blocked?.keyword),mode:text(run?.mode).toUpperCase()||null,status:outcome.status,
      action:text(action?.action).toUpperCase()||null,before_bid:beforeBid,after_bid:afterBid,
      delta_bid:beforeBid!=null&&afterBid!=null?afterBid-beforeBid:null,target_rank:finite(action?.target_rank),
      verified:outcome.verified,request_id:text(result?.request_id)||null,reason:outcome.reason,
      error_code:text(result?.code||blocked?.code)||null,occurred_at:occurredAt(run)
    });
  }
  scoped.sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||''))||b.run_id.localeCompare(a.run_id));
  const summary={
    total:scoped.length,
    applied:scoped.filter(item=>item.status==='VERIFIED').length,
    observed:scoped.filter(item=>item.status==='OBSERVED').length,
    blocked:scoped.filter(item=>item.status==='BLOCKED'||item.status==='FAILED').length,
    latest_activity_at:scoped[0]?.occurred_at||null
  };
  return {platform:NAVER,status:scoped.length?'READY':'NO_DATA',ncc_keyword_id:text(keywordId),ncc_adgroup_id:text(adgroupId),summary,entries:scoped};
}

module.exports={buildNaverBidKeywordHistory,outcomeFor};
