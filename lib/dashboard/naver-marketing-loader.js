'use strict';
const {buildNaverMarketing,shift}=require('../analytics/naver-marketing.js');
async function loadNaverMarketing({db,now=new Date()}={}){
 const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10),start=shift(today,-60),end=shift(today,-1);
 const scan=async()=>{const rows=[];for(let offset=0;offset<20000;offset+=1000){const r=await db.from('naver_stats_daily').select('date,entity_id,entity_type,raw_data,updated_at').eq('entity_type','CAMPAIGN').gte('date',start).lte('date',end).order('date').order('entity_id').range(offset,offset+999);if(r.error)throw Error('Stats unavailable');rows.push(...r.data);if(r.data.length<1000)return rows;}throw Error('Stats truncated');};
 const results=await Promise.allSettled([scan(),Promise.resolve().then(()=>db.from('naver_campaigns').select('ncc_campaign_id,name,campaign_type').limit(1000)),Promise.resolve().then(()=>db.from('naver_keyword_stats').select('period_start,period_end,keyword,campaign_type,cost,clicks,conversions,conversion_revenue').order('period_end',{ascending:false}).order('period_start',{ascending:false}).order('cost',{ascending:false}).limit(40)),Promise.resolve().then(()=>db.from('automation_runs').select('status,finished_at,result_json').eq('job_name','NAVER_MARKETING_DAILY').order('started_at',{ascending:false}).limit(1))]);
 const read=i=>results[i].status==='fulfilled'&&!results[i].value?.error?results[i].value.data||[]:[];
 const run=read(3)[0];if(run?.status==='SUCCESS'&&run.result_json?.reports?.some(r=>r.platform==='NAVER'&&r.ok===false))run.status='PARTIAL';
 return buildNaverMarketing({stats:results[0].status==='fulfilled'?results[0].value:[],statsReady:results[0].status==='fulfilled',campaigns:read(1),keywords:read(2),keywordsReady:results[2].status==='fulfilled'&&!results[2].value.error,run,now});
}
module.exports={loadNaverMarketing};
