'use strict';
const execution=require('../naver/bid-execution.js');
const financial=require('../changes/financial-change.js');
const workbench=require('../marketing/naver-bid-workbench.js');
const client=require('../naver/client.js');
const {loadActiveAdScope}=require('./active-ad-scope.js');
const fail=code=>{throw Object.assign(Error(code),{code});};
const summary=r=>({requestId:r.id,state:r.status,currentBid:r.before_value?.values?.bid_amount??null,bid:r.proposed_value?.values?.bid_amount??null});
function createKeywordBidOperations({db,api=client,changes=financial,live=execution,loadScope=loadActiveAdScope}={}){
 const read=async keywordId=>{
  const scope=await loadScope(db);if(!scope.ready)fail('CAMPAIGN_STATE_UNAVAILABLE');
  const stored=scope.keywords.find(k=>k.ncc_keyword_id===keywordId);if(!stored)fail('KEYWORD_NOT_ACTIVE');
  const group=scope.groups.find(g=>g.ncc_adgroup_id===stored.ncc_adgroup_id),campaign=scope.campaigns.find(c=>c.ncc_campaign_id===group?.ncc_campaign_id);
  const keyword=await live.fetchKeyword(keywordId,api);
  const [g,c]=await Promise.all([api.request('GET',`/ncc/adgroups/${stored.ncc_adgroup_id}`),api.request('GET',`/ncc/campaigns/${campaign.ncc_campaign_id}`)]);
  const liveGroup=g.data,liveCampaign=c.data;
  if(keyword.nccAdgroupId!==stored.ncc_adgroup_id||liveGroup?.nccCampaignId!==campaign.ncc_campaign_id||liveCampaign?.nccCampaignId!==campaign.ncc_campaign_id)fail('CAMPAIGN_STATE_CHANGED');
  if(liveCampaign.status!=='ELIGIBLE'||liveCampaign.userLock!==false||liveGroup.status!=='ELIGIBLE'||liveGroup.userLock!==false||keyword.raw?.userLock!==false)fail('CAMPAIGN_NOT_ACTIVE');
  live.assertLiveEligibility({keyword,group:liveGroup,targetBid:keyword.bidAmt,expectedBid:keyword.bidAmt});
  if(keyword.useGroupBidAmt)fail('GROUP_BID_IN_USE');
  // Reuse the web hub's direct-lowering gate. Missing financial evidence must
  // never be promoted to recommendation readiness merely to enable increases.
  const candidate=workbench.candidateFor({keyword:{...stored,bid_amount:keyword.bidAmt,status:keyword.status,user_lock:keyword.userLock},adgroup:group,campaign,executionEnabled:live.configuration().write_enabled});
  if(!candidate.can_request_approval)fail('BID_POLICY_BLOCKED');
  candidate.minimum_owner_bid=Math.max(candidate.minimum_owner_bid,live.minimumBidFor(liveGroup));
  return {candidate,view:{keywordId,name:String(stored.keyword||'키워드').slice(0,120),currentBid:keyword.bidAmt,minBid:candidate.minimum_owner_bid,maxBid:candidate.maximum_owner_bid,writeEnabled:live.configuration().write_enabled,mode:'DIRECT_LOWER_ONLY',checkedAt:new Date().toISOString()}};
 };
 const owned=async(id,actor)=>{const result=await db.from('financial_change_requests').select('*').eq('id',id).maybeSingle();if(result.error||!result.data||result.data.change_type!=='NAVER_BID'||result.data.requested_by!==actor)fail('BID_REQUEST_NOT_FOUND');return result.data;};
 return async(input,{actor,check})=>{
  if(input.action==='READ'){const r=await read(input.keywordId);await check();return r.view;}
  if(input.action==='PREVIEW'){
   const r=await read(input.keywordId);if(r.view.currentBid!==input.currentBid)fail('BID_SNAPSHOT_STALE');
   if(input.bid>=input.currentBid||input.bid<r.view.minBid)fail('BID_OUTSIDE_SAFE_RANGE');
   await check();const result=await changes.createNaverBidPreview(workbench.proposalSnapshot(r.candidate),input.bid,{db,actor,idempotencyKey:'moaon-bid:'+require('node:crypto').createHash('sha256').update(actor+':'+input.key).digest('hex')});
   // A reused key must identify exactly this owner's unchanged proposal.
   const saved=await owned(result.request.id,actor);if(saved.target_key!==input.keywordId||saved.proposed_value?.values?.bid_amount!==input.bid||saved.before_value?.values?.bid_amount!==input.currentBid)fail('BID_IDEMPOTENCY_CONFLICT');
   return {...summary(saved),writeEnabled:r.view.writeEnabled};
  }
  const saved=await owned(input.requestId,actor);
  if(input.action==='STATUS'){await check();return summary(saved);}
  if(saved.status==='VERIFIED')return summary(saved);
  if(saved.status!=='PREVIEWED')fail('BID_RESULT_REQUIRES_REVIEW');
  if(!live.configuration().write_enabled)fail('NAVER_BID_WRITE_DISABLED');
  const current=await read(saved.target_key);if(current.view.currentBid!==saved.before_value?.values?.bid_amount)fail('BID_SNAPSHOT_STALE');
  await check();const result=await changes.confirmAndExecute(saved.id,{db,actor});return summary(result.request);
 };
}
module.exports={createKeywordBidOperations};
