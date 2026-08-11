'use strict';

const reportModule = require('../reports/weekly.js');
const { runJob } = require('./job-runner.js');

const iso = date => date.toISOString().slice(0, 10);
const PLATFORMS=['ALL','NAVER','CAFE24','COUPANG'];

async function generatePlatformSet({period,reportType,mode,deduplicate}){
  const results=await Promise.allSettled(PLATFORMS.map(platform=>reportModule.generateReport({period,platform,reportType,mode,deduplicate})));
  const reports=results.map((result,index)=>result.status==='fulfilled'?{platform:PLATFORMS[index],ok:true,...result.value}:{platform:PLATFORMS[index],ok:false,error:result.reason?.message||'보고서 생성 실패'});
  if(reports.every(item=>!item.ok))throw new Error(reports.map(item=>`${item.platform}: ${item.error}`).join(' / '));
  return {ok:reports.every(item=>item.ok),reports};
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

async function generateDaily({ triggerType = 'SYSTEM', deduplicate = true } = {}) {
  return runJob({ jobName: 'DAILY_PLATFORM_REPORTS', triggerType, maxAttempts: 2, work: () => generatePlatformSet({period:dailyPeriod(),reportType:'ADHOC',mode:triggerType==='MANUAL'?'DAILY_MANUAL':'DAILY_AUTO',deduplicate}) });
}

async function generateMonthly({ triggerType = 'SYSTEM', deduplicate = true } = {}) {
  return runJob({ jobName: 'MONTHLY_PLATFORM_REPORTS', triggerType, maxAttempts: 2, work: () => generatePlatformSet({period:previousMonth(),reportType:'MONTHLY',mode:triggerType==='MANUAL'?'MONTHLY_MANUAL':'MONTHLY_AUTO',deduplicate}) });
}

module.exports = { dailyPeriod, previousMonth, isFirstDayKst, generatePlatformSet, generateDaily, generateMonthly };
