'use strict';

const reportModule = require('../reports/weekly.js');
const { runJob } = require('./job-runner.js');
const notificationService = require('../notifications/service.js');

const iso = date => date.toISOString().slice(0, 10);
const PLATFORMS=['ALL','NAVER','CAFE24','COUPANG'];

async function generatePlatformSet({period,reportType,mode,deduplicate,revisionNote}){
  const results=await Promise.allSettled(PLATFORMS.map(platform=>reportModule.generateReport({period,platform,reportType,mode,deduplicate,revisionNote})));
  const reports=results.map((result,index)=>result.status==='fulfilled'?{platform:PLATFORMS[index],ok:true,...result.value}:{platform:PLATFORMS[index],ok:false,error:result.reason?.message||'보고서 생성 실패'});
  if(reports.every(item=>!item.ok))throw new Error(reports.map(item=>`${item.platform}: ${item.error}`).join(' / '));
  const allReport=reports.find(item=>item.platform==='ALL'&&item.ok)?.report;
  const cadence=mode.startsWith('DAILY')?'DAILY':mode.startsWith('MONTHLY')?'MONTHLY':reportType;
  const delivery=allReport?await notificationService.deliverReport(allReport.id,{cadence,triggerType:mode.includes('MANUAL')?'MANUAL':'CRON'}).catch(error=>({status:'FAILED',error:error.message})):null;
  return {ok:reports.every(item=>item.ok),reports,delivery};
}

function dailyPeriod(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600000);
  const end = new Date(kst); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - 6);
  return { start: iso(start), end: iso(end) };
}

function previousMonth(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600000);
  const end = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { start: iso(start), end: iso(end) };
}

function isFirstDayKst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).getUTCDate() === 1;
}

function monthlyStage(now = new Date()) {
  const day=new Date(now.getTime()+9*3600000).getUTCDate();
  return day===1?'PROVISIONAL':day===5?'FINAL':null;
}

async function generateDaily({ triggerType = 'SYSTEM', deduplicate = true, runOptions = {} } = {}) {
  return runJob({ jobName: 'DAILY_PLATFORM_REPORTS', triggerType, maxAttempts: 2, ...runOptions, work: () => generatePlatformSet({period:dailyPeriod(),reportType:'ADHOC',mode:triggerType==='MANUAL'?'DAILY_MANUAL':'DAILY_AUTO',deduplicate}) });
}

async function generateMonthly({ triggerType = 'SYSTEM', stage = 'PROVISIONAL', deduplicate, runOptions = {}, now = new Date() } = {}) {
  const normalizedStage=String(stage||'').toUpperCase();
  if(!['PROVISIONAL','FINAL'].includes(normalizedStage))throw new Error('월간 보고서 단계를 확인해주세요.');
  const final=normalizedStage==='FINAL';
  const jobName=`MONTHLY_PLATFORM_REPORTS_${normalizedStage}`;
  const shouldDeduplicate=deduplicate==null?!final:Boolean(deduplicate);
  const mode=triggerType==='MANUAL'?`MONTHLY_${normalizedStage}_MANUAL`:`MONTHLY_${normalizedStage}_AUTO`;
  const revisionNote=final?'월간 확정본 · 5일 정산자료 반영':'월간 잠정본 · 1일 우선 확인';
  return runJob({ jobName, triggerType, maxAttempts: 2, ...runOptions, work: () => generatePlatformSet({period:previousMonth(now),reportType:'MONTHLY',mode,deduplicate:shouldDeduplicate,revisionNote}) });
}

module.exports = { dailyPeriod, previousMonth, isFirstDayKst, monthlyStage, generatePlatformSet, generateDaily, generateMonthly };
