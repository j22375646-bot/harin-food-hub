'use strict';
const client=require('./client.js');
const supabase=require('../cafe24/supabase.js');

async function raw(endpoint,result,error) {
  await supabase.insertRaw({platform:'NAVER',endpoint,http_status:result?.status||error?.status||null,response_json:result?.data||error?.response||null,error_message:error?.message||null});
}
async function get(uri,query){try{const result=await client.request('GET',uri,query);await raw(uri,result);return result.data||[];}catch(error){await raw(uri,null,error);throw error;}}
async function mapLimit(items,limit,work){const results=[];for(let i=0;i<items.length;i+=limit)results.push(...await Promise.all(items.slice(i,i+limit).map(work)));return results;}
const num=value=>value==null?null:Number(value);
const date=value=>new Date(value).toISOString().slice(0,10);

async function syncStats(db,campaigns,days=30){
  const until=new Date(); const since=new Date(until); since.setDate(until.getDate()-Math.max(1,Math.min(days,90))+1);
  const fields=['impCnt','clkCnt','salesAmt','ccnt','convAmt'];
  const responses=await mapLimit(campaigns,4,async campaign=>({campaign,result:await get('/stats',{id:campaign.nccCampaignId,fields,timeRange:{since:date(since),until:date(until)},timeIncrement:1})}));
  const rows=[];
  for(const {campaign,result} of responses){
    const entity=Array.isArray(result)?result[0]:result;
    const points=entity?.data||entity?.stats||[];
    for(const point of points){
      const day=point.period||point.date||point.statDt||point.dateStart;
      if(!day)continue;
      rows.push({date:String(day).slice(0,10),entity_id:campaign.nccCampaignId,entity_type:'CAMPAIGN',impressions:num(point.impCnt)||0,clicks:num(point.clkCnt)||0,cost:num(point.salesAmt)||0,conversions:num(point.ccnt)||0,conversion_revenue:num(point.convAmt)||0,raw_data:point,updated_at:new Date().toISOString()});
    }
  }
  for(let i=0;i<rows.length;i+=500){const result=await db.from('naver_stats_daily').upsert(rows.slice(i,i+500),{onConflict:'date,entity_id,entity_type'});if(result.error)throw result.error;}
  return rows.length;
}

async function allRows(db,table,columns){const rows=[];for(let from=0;;from+=1000){const result=await db.from(table).select(columns).range(from,from+999);if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<1000)break;}return rows;}
async function syncKeywordStats(db,days=7){
  const [keywords,groups,campaigns]=await Promise.all([allRows(db,'naver_keywords','ncc_keyword_id,ncc_adgroup_id,keyword'),allRows(db,'naver_adgroups','ncc_adgroup_id,ncc_campaign_id'),allRows(db,'naver_campaigns','ncc_campaign_id,campaign_type')]);
  const groupCampaign=new Map(groups.map(item=>[item.ncc_adgroup_id,item.ncc_campaign_id])); const campaignType=new Map(campaigns.map(item=>[item.ncc_campaign_id,item.campaign_type||'UNKNOWN']));
  const grouped=new Map(); for(const item of keywords){const type=campaignType.get(groupCampaign.get(item.ncc_adgroup_id))||'UNKNOWN';if(!grouped.has(type))grouped.set(type,[]);grouped.get(type).push(item);}
  const until=new Date();const since=new Date(until);since.setDate(until.getDate()-Math.max(1,Math.min(days,30))+1);const periodStart=date(since),periodEnd=date(until);const fields=['impCnt','clkCnt','salesAmt','ccnt','convAmt'];const rows=[];
  for(const [type,items] of grouped){for(let i=0;i<items.length;i+=100){const batch=items.slice(i,i+100);const result=await get('/stats',{ids:batch.map(item=>item.ncc_keyword_id),fields,timeRange:{since:periodStart,until:periodEnd}});const entities=Array.isArray(result)?result:(Array.isArray(result?.data)&&result.data.some(item=>item?.id)?result.data:[result]);for(let index=0;index<entities.length;index++){const entity=entities[index]||{};const id=entity.id||entity.nccKeywordId||batch[index]?.ncc_keyword_id;const source=batch.find(item=>item.ncc_keyword_id===id)||batch[index];if(!source)continue;const points=Array.isArray(entity.data)?entity.data:[entity.data||entity];const total=points.reduce((sum,point)=>({impressions:sum.impressions+(num(point.impCnt)||0),clicks:sum.clicks+(num(point.clkCnt)||0),cost:sum.cost+(num(point.salesAmt)||0),conversions:sum.conversions+(num(point.ccnt)||0),revenue:sum.revenue+(num(point.convAmt)||0)}),{impressions:0,clicks:0,cost:0,conversions:0,revenue:0});rows.push({period_start:periodStart,period_end:periodEnd,ncc_keyword_id:source.ncc_keyword_id,keyword:source.keyword,campaign_type:type,impressions:total.impressions,clicks:total.clicks,cost:total.cost,conversions:total.conversions,conversion_revenue:total.revenue,roas:total.cost?total.revenue/total.cost*100:0,ctr:total.impressions?total.clicks/total.impressions*100:0,raw_data:entity,updated_at:new Date().toISOString()});}}}
  for(let i=0;i<rows.length;i+=500){const result=await db.from('naver_keyword_stats').upsert(rows.slice(i,i+500),{onConflict:'period_start,period_end,ncc_keyword_id'});if(result.error)throw result.error;}
  return {rows:rows.length,periodStart,periodEnd};
}

async function syncAll(){
  const db=supabase.getSupabase();
  const log=await db.from('sync_logs').insert({platform:'NAVER',job_type:'FETCH_ALL',status:'RUNNING'}).select('id').single();
  if(log.error)throw log.error;
  try{
    const campaigns=await get('/ncc/campaigns');
    const campaignRows=campaigns.map(item=>({ncc_campaign_id:item.nccCampaignId,name:item.name,campaign_type:item.campaignTp,status:item.status,user_lock:item.userLock,daily_budget:num(item.dailyBudget),raw_data:item,updated_at:new Date().toISOString()}));
    if(campaignRows.length){const result=await db.from('naver_campaigns').upsert(campaignRows,{onConflict:'ncc_campaign_id'});if(result.error)throw result.error;}
    const groupLists=await mapLimit(campaigns,4,item=>get('/ncc/adgroups',{nccCampaignId:item.nccCampaignId}));
    const groups=groupLists.flat();
    const groupRows=groups.map(item=>({ncc_adgroup_id:item.nccAdgroupId,ncc_campaign_id:item.nccCampaignId,name:item.name,status:item.status,user_lock:item.userLock,bid_amount:num(item.bidAmt),raw_data:item,updated_at:new Date().toISOString()}));
    if(groupRows.length){const result=await db.from('naver_adgroups').upsert(groupRows,{onConflict:'ncc_adgroup_id'});if(result.error)throw result.error;}
    const keywordLists=await mapLimit(groups,4,item=>get('/ncc/keywords',{nccAdgroupId:item.nccAdgroupId}));
    const keywords=keywordLists.flat();
    const keywordRows=keywords.map(item=>({ncc_keyword_id:item.nccKeywordId,ncc_adgroup_id:item.nccAdgroupId,keyword:item.keyword,bid_amount:num(item.bidAmt),status:item.status,user_lock:item.userLock,raw_data:item,updated_at:new Date().toISOString()}));
    for(let i=0;i<keywordRows.length;i+=500){const result=await db.from('naver_keywords').upsert(keywordRows.slice(i,i+500),{onConflict:'ncc_keyword_id'});if(result.error)throw result.error;}
    const stats=await syncStats(db,campaigns,30);
    const counts={campaigns:campaigns.length,adgroups:groups.length,keywords:keywords.length,stats};
    await db.from('platform_accounts').upsert({platform:'NAVER',account_name:'harinfood',external_account_id:client.config().customerId,is_connected:true,last_synced_at:new Date().toISOString()},{onConflict:'platform'});
    await db.from('sync_logs').update({status:'SUCCESS',finished_at:new Date().toISOString(),rows_received:counts.campaigns+counts.adgroups+counts.keywords,metadata:{counts}}).eq('id',log.data.id);
    return counts;
  }catch(error){await db.from('sync_logs').update({status:'FAILED',finished_at:new Date().toISOString(),error_message:error.message}).eq('id',log.data.id);throw error;}
}
module.exports={syncAll,syncStats,syncKeywordStats};
