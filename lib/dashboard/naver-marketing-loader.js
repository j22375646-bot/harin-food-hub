'use strict';
const {buildNaverMarketing,shift}=require('../analytics/naver-marketing.js');
async function loadNaverMarketing({db,now=new Date(),scope}={}){
 scope=scope||await require('./active-ad-scope.js').loadActiveAdScope(db);
 const activeIds=new Set(scope.campaigns.map(c=>c.ncc_campaign_id));
 const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10),start=shift(today,-60),end=shift(today,-1);
 const scan=async()=>{const rows=[];for(let offset=0;offset<20000;offset+=1000){const r=await db.from('naver_stats_daily').select('date,entity_id,entity_type,raw_data,updated_at').eq('entity_type','CAMPAIGN').gte('date',start).lte('date',end).order('date').order('entity_id').range(offset,offset+999);if(r.error)throw Error('Stats unavailable');rows.push(...r.data);if(r.data.length<1000)return rows;}throw Error('Stats truncated');};
 const results=await Promise.allSettled([scan(),Promise.resolve().then(()=>db.from('automation_runs').select('status,finished_at,result_json').eq('job_name','NAVER_MARKETING_DAILY').order('started_at',{ascending:false}).limit(1))]);
 const read=i=>results[i].status==='fulfilled'&&!results[i].value?.error?results[i].value.data||[]:[];
 const run=read(1)[0];if(run?.status==='SUCCESS'&&run.result_json?.reports?.some(r=>r.platform==='NAVER'&&r.ok===false))run.status='PARTIAL';
 return buildNaverMarketing({stats:results[0].status==='fulfilled'?results[0].value.filter(r=>activeIds.has(r.entity_id)):[],statsReady:results[0].status==='fulfilled'&&scope.ready,campaigns:scope.campaigns,keywords:[],keywordsReady:false,run,now});
}
module.exports={loadNaverMarketing};
