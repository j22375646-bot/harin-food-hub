'use strict';
const active=r=>r.status==='ELIGIBLE'&&r.user_lock===false;
async function loadActiveAdScope(db){
 const read=async(table,fields,key)=>{const rows=[];for(let from=0;from<5000;from+=1000){const result=await db.from(table).select(fields).order(key).range(from,from+999);if(result.error||!Array.isArray(result.data))throw Error('Advertising state unavailable');rows.push(...result.data);if(result.data.length<1000)return rows;}throw Error('Advertising state exceeds limit');};
 try{
  const [campaignRows,groupRows,keywordRows]=await Promise.all([read('naver_campaigns','ncc_campaign_id,name,campaign_type,status,user_lock','ncc_campaign_id'),read('naver_adgroups','ncc_adgroup_id,ncc_campaign_id,name,status,user_lock','ncc_adgroup_id'),read('naver_keywords','ncc_keyword_id,ncc_adgroup_id,keyword,status,user_lock,bid_amount,raw_data','ncc_keyword_id')]);
  const campaigns=campaignRows.filter(active),campaignIds=new Set(campaigns.map(r=>r.ncc_campaign_id)),groups=groupRows.filter(r=>active(r)&&campaignIds.has(r.ncc_campaign_id)),groupIds=new Set(groups.map(r=>r.ncc_adgroup_id));
  return {ready:true,campaigns,groups,keywords:keywordRows.filter(r=>active(r)&&groupIds.has(r.ncc_adgroup_id))};
 }catch{return {ready:false,campaigns:[],groups:[],keywords:[]};}
}
module.exports={loadActiveAdScope,active};
