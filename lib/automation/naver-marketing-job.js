'use strict';
const {runJob}=require('./job-runner.js');
const {loadNaverMarketing}=require('../dashboard/naver-marketing-loader.js');
const naver=require('../naver/sync.js');
const reports=require('../reports/weekly.js');
async function runNaverMarketing({db,now=new Date(),syncStats=naver.syncStats,generateReport=reports.generateReport,load=loadNaverMarketing,runner=runJob}={}){
 const date=new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
 return runner({db,jobName:'NAVER_MARKETING_DAILY',triggerType:'CRON',maxAttempts:2,idempotencyKey:'NAVER_MARKETING_DAILY:'+date,kstExecutionDate:date,staleAfterMs:20*60000,work:async()=>{
  const result=await db.from('naver_campaigns').select('ncc_campaign_id').order('ncc_campaign_id').limit(1000);if(result.error||!result.data?.length||result.data.length===1000)throw Error('Campaign collection requires verification');
  const received=await syncStats(db,result.data.map(r=>({nccCampaignId:r.ncc_campaign_id})),61);
  if(!Number.isFinite(received)||received<=0)throw Error('No fresh advertising statistics received');
  const marketing=await load({db,now}),week=marketing.windows.find(w=>w.id==='WEEK');
  if(week?.status!=='OBSERVED')return {status:'PARTIAL',reason:'WEEK_COVERAGE_REQUIRED',period:week?{start:week.start,end:week.end}:null};
  const report=await generateReport({platform:'NAVER',reportType:'WEEKLY',period:{start:week.start,end:week.end},mode:'MOAON_AUTO',deduplicate:true,notify:false});
  return {status:'SUCCESS',period:{start:week.start,end:week.end},reportId:report.report?.id||null,created:report.created===true};
 }});
}
module.exports={runNaverMarketing};
