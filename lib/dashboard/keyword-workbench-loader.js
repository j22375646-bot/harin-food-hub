'use strict';
const {keywordWorkbench}=require('../analytics/keyword-workbench.js');
async function loadKeywordWorkbench(db,source='KEYWORDS',scope){
 try{
  scope=scope||await require('./active-ad-scope.js').loadActiveAdScope(db);if(!scope.ready)throw Error('Active campaign status unavailable');
  const search=source==='SEARCH_TERMS',table=search?'naver_search_terms':'naver_keyword_stats';
  const allowed=search?scope.groups.map(r=>r.ncc_adgroup_id):scope.keywords.map(r=>r.ncc_keyword_id);
  if(!allowed.length)return keywordWorkbench({ready:true,total:0});
  const period=await db.from(table).select('period_start,period_end').in(search?'ncc_adgroup_id':'ncc_keyword_id',allowed).order('period_end',{ascending:false}).order('period_start',{ascending:true}).limit(1);
  if(period.error||!Array.isArray(period.data))throw Error('Keyword period unavailable');
  if(!period.data.length)return keywordWorkbench({ready:true,total:0});
  const {period_start:start,period_end:end}=period.data[0];
  const columns=search?'id,ncc_adgroup_id,period_start,period_end,search_term,campaign_type,raw_data':'ncc_keyword_id,period_start,period_end,keyword,campaign_type,raw_data';
  let query=db.from(table).select(columns,{count:'exact'}).eq('period_start',start).eq('period_end',end).in(search?'ncc_adgroup_id':'ncc_keyword_id',allowed);
  if(source==='CONVERTED')query=query.gt('conversions',0);
  const result=await query.order(source==='CONVERTED'?'conversions':'cost',{ascending:false}).order(search?'id':'ncc_keyword_id').limit(200);
  if(result.error||!Array.isArray(result.data))throw Error('Keyword rows unavailable');
  const rows=search?result.data.map(r=>({...r,ncc_keyword_id:String(r.id),keyword:r.search_term,raw_data:{data:Array.isArray(r.raw_data?.samples)&&r.raw_data.samples.length<5?r.raw_data.samples:[]}})):result.data;
  const output=keywordWorkbench({ready:true,rows,total:result.count});
  for(let i=0;i<output.rows.length;i++){const item=output.rows[i],raw=rows[i],k=scope.keywords.find(k=>k.ncc_keyword_id===item.id),group=scope.groups.find(g=>g.ncc_adgroup_id===(search?raw.ncc_adgroup_id:k?.ncc_adgroup_id)),campaign=scope.campaigns.find(c=>c.ncc_campaign_id===group?.ncc_campaign_id);item.campaignId=campaign?.ncc_campaign_id||'';item.campaignName=String(campaign?.name||'캠페인 확인 필요').slice(0,120);item.adgroupId=group?.ncc_adgroup_id||'';item.bid=typeof k?.bid_amount==='number'?k.bid_amount:null;}
  return output;
 }catch{return keywordWorkbench();}
}
module.exports={loadKeywordWorkbench};
