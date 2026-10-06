'use strict';
const {loadActiveAdScope}=require('./active-ad-scope.js');
const live=require('../naver/bid-execution.js'),client=require('../naver/client.js');
const fail=code=>{throw Object.assign(Error(code),{code});};
const amount=n=>Number.isInteger(n)&&n>=70&&n<=100000&&n%10===0;
const view=r=>({requestId:r.id,state:r.status,currentBid:r.before_bid,bid:r.bid});
function createGroupBidOperations({db,api=client,loadScope=loadActiveAdScope,configuration=live.configuration,now=()=>Date.now()}={}){
 const table=()=>db.from('moaon_group_bid_requests');
 const scope=async()=>{const s=await loadScope(db);if(!s.ready)fail('CAMPAIGN_STATE_UNAVAILABLE');const ids=new Set(s.campaigns.filter(c=>c.campaign_type==='SHOPPING').map(c=>c.ncc_campaign_id));return {...s,groups:s.groups.filter(g=>ids.has(g.ncc_campaign_id))};};
 const read=async id=>{const s=await scope(),stored=s.groups.find(g=>g.ncc_adgroup_id===id);if(!stored)fail('GROUP_NOT_ACTIVE');const [gr,cr]=await Promise.all([api.request('GET','/ncc/adgroups/'+id),api.request('GET','/ncc/campaigns/'+stored.ncc_campaign_id)]);const g=gr.data,c=cr.data;
 if(g?.nccAdgroupId!==id||g.nccCampaignId!==stored.ncc_campaign_id||c?.nccCampaignId!==stored.ncc_campaign_id)fail('CAMPAIGN_STATE_CHANGED');
 if(g.status!=='ELIGIBLE'||g.userLock!==false||c.status!=='ELIGIBLE'||c.userLock!==false)fail('CAMPAIGN_NOT_ACTIVE');
 if(g.adgroupType!=='SHOPPING')fail('GROUP_TYPE_UNSUPPORTED');
 if(g.autobidStrategy?.isAutobidActive||g.autobidStrategy?.active||g.isAutobidActive||['ML','MAXCONV'].includes(String(g.autoBidType||'').toUpperCase()))fail('NAVER_AUTOBID_ACTIVE');
 if(!amount(g.bidAmt))fail('BID_UNAVAILABLE');return {group:g,view:{keywordId:id,name:String(g.name||stored.name).slice(0,120),currentBid:g.bidAmt,minBid:70,maxBid:100000,writeEnabled:configuration().write_enabled,mode:'GROUP_MANUAL',checkedAt:new Date(now()).toISOString()}};};
 const owned=async(id,actor)=>{const r=await table().select('*').eq('id',id).eq('actor',actor).maybeSingle();if(r.error||!r.data)fail('BID_REQUEST_NOT_FOUND');return r.data;};
 const save=async(id,status)=>{const r=await table().update({status,updated_at:new Date(now()).toISOString()}).eq('id',id).select('*').single();if(r.error||!r.data)fail('BID_RESULT_UNKNOWN');return r.data;};
 return async(input,{actor,check})=>{
 if(input.action==='GROUP_LIST'){const s=await scope();await check();return {groups:s.groups.map(g=>({id:g.ncc_adgroup_id,name:String(g.name).slice(0,120),campaignName:String(s.campaigns.find(c=>c.ncc_campaign_id===g.ncc_campaign_id)?.name||'').slice(0,120)})).sort((a,b)=>a.campaignName.localeCompare(b.campaignName,'ko')||a.name.localeCompare(b.name,'ko'))};}
 if(input.action==='GROUP_READ'){const r=await read(input.keywordId);await check();return r.view;}
 if(input.action==='GROUP_PREVIEW'){const r=await read(input.keywordId);if(r.view.currentBid!==input.currentBid)fail('BID_SNAPSHOT_STALE');if(!amount(input.bid)||input.bid===input.currentBid)fail('BID_OUTSIDE_SAFE_RANGE');await check();const inserted=await table().upsert({actor,request_key:input.key,group_id:input.keywordId,campaign_id:r.group.nccCampaignId,group_name:r.view.name,before_bid:input.currentBid,bid:input.bid},{onConflict:'actor,request_key',ignoreDuplicates:true});if(inserted.error)fail('BID_UNAVAILABLE');const found=await table().select('*').eq('actor',actor).eq('request_key',input.key).single();const saved=found.data;if(found.error||!saved)fail('BID_UNAVAILABLE');if(saved.group_id!==input.keywordId||saved.before_bid!==input.currentBid||saved.bid!==input.bid)fail('BID_IDEMPOTENCY_CONFLICT');return {...view(saved),writeEnabled:r.view.writeEnabled};}
 let saved=await owned(input.requestId,actor);await check();
 if(input.action==='GROUP_STATUS'){
 if(['APPLYING','UNKNOWN'].includes(saved.status)){const current=await read(saved.group_id);await check();if(current.group.nccCampaignId===saved.campaign_id&&current.view.currentBid===saved.bid)saved=await save(saved.id,'VERIFIED');}return view(saved);}
 if(saved.status==='VERIFIED')return view(saved);
 if(saved.status!=='PREVIEWED')fail('BID_RESULT_REQUIRES_REVIEW');
 if(!configuration().write_enabled)fail('NAVER_BID_WRITE_DISABLED');
 if(now()-Date.parse(saved.created_at)>5*60*1000)fail('BID_PREVIEW_EXPIRED');
 const current=await read(saved.group_id);if(current.view.currentBid!==saved.before_bid||current.group.nccCampaignId!==saved.campaign_id)fail('BID_SNAPSHOT_STALE');await check();
 const claim=await table().update({status:'APPLYING',updated_at:new Date(now()).toISOString()}).eq('id',saved.id).eq('status','PREVIEWED').select('*').maybeSingle();if(claim.error||!claim.data)fail('BID_BUSY');
 let sent=false;
 try{await check();if(!configuration().write_enabled)fail('NAVER_BID_WRITE_DISABLED');sent=true;await api.request('PUT','/ncc/adgroups/'+saved.group_id,{fields:'bidAmt'},{nccAdgroupId:saved.group_id,bidAmt:saved.bid});const observed=await api.request('GET','/ncc/adgroups/'+saved.group_id);if(observed.data?.nccAdgroupId!==saved.group_id||observed.data.nccCampaignId!==saved.campaign_id||observed.data.bidAmt!==saved.bid)fail('BID_RESULT_UNKNOWN');return view(await save(saved.id,'VERIFIED'));}
 catch(e){await save(saved.id,sent?'UNKNOWN':'CANCELLED').catch(()=>{});if(sent)fail('BID_RESULT_UNKNOWN');throw e;}
 };
}
module.exports={createGroupBidOperations};
