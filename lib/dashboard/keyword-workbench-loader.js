'use strict';
const {keywordWorkbench}=require('../analytics/keyword-workbench.js');
async function loadKeywordWorkbench(db,source='KEYWORDS'){
 try{
  const search=source==='SEARCH_TERMS',table=search?'naver_search_terms':'naver_keyword_stats';
  const period=await db.from(table).select('period_start,period_end').order('period_end',{ascending:false}).order('period_start',{ascending:true}).limit(1);
  if(period.error||!Array.isArray(period.data))throw Error('Keyword period unavailable');
  if(!period.data.length)return keywordWorkbench({ready:true,total:0});
  const {period_start:start,period_end:end}=period.data[0];
  const columns=search?'id,period_start,period_end,search_term,campaign_type,raw_data':'ncc_keyword_id,period_start,period_end,keyword,campaign_type,raw_data';
  const result=await db.from(table).select(columns,{count:'exact'}).eq('period_start',start).eq('period_end',end).order('cost',{ascending:false}).order(search?'id':'ncc_keyword_id').limit(200);
  if(result.error||!Array.isArray(result.data))throw Error('Keyword rows unavailable');
  const rows=search?result.data.map(r=>({...r,ncc_keyword_id:String(r.id),keyword:r.search_term,raw_data:{data:Array.isArray(r.raw_data?.samples)&&r.raw_data.samples.length<5?r.raw_data.samples:[]}})):result.data;
  return keywordWorkbench({ready:true,rows,total:result.count});
 }catch{return keywordWorkbench();}
}
module.exports={loadKeywordWorkbench};
