'use strict';
const {buildPhase28InsightsModel}=require('../ui/phase28-adapters/insights.js');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const money=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null;
function timestamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return null;
 const time=Date.parse(value);if(!Number.isFinite(time))return null;
 return new Date(time).toISOString().slice(0,10)===value.slice(0,10)?new Date(time).toISOString():null;
}
function buildWorkspaceInsightsSummary(data={}){
 if(!Array.isArray(data.reports))throw TypeError('Insights reports unavailable');
 const reports=data.reports.filter(row=>object(row)&&row.platform==='NAVER'&&row.report_type==='WEEKLY').map(row=>{
  if(!object(row.summary_json))throw TypeError('Invalid insight report');
  const summary=row.summary_json,naver=object(summary.naver)?summary.naver:object(summary.NAVER)?summary.NAVER:{};
  const scoped=summary.channel_profitability?.NAVER||summary.channel_profitability?.naver||{};
  const profit=money(naver.contribution_profit??scoped.contribution_profit);
  return {...row,period_start:timestamp(row.period_start),period_end:timestamp(row.period_end),created_at:timestamp(row.created_at),summary_json:{...summary,channel_profitability:{NAVER:{contribution_profit:profit}},naver:{...naver,revenue:money(naver.revenue??naver.conversion_revenue),conversion_revenue:null,contribution_profit:profit}}};
 }).sort((a,b)=>(Date.parse(b.period_end||b.created_at)||0)-(Date.parse(a.period_end||a.created_at)||0)).slice(0,20);
 const model=buildPhase28InsightsModel({reports,generatedAt:timestamp(data.generatedAt)});
 const channel=model.channels[0],current=reports[0],source=current?.summary_json;
 const validPeriods=reports.length>=2
  &&reports.slice(0,2).every(report=>report.period_start&&report.period_end&&Date.parse(report.period_start)<=Date.parse(report.period_end))
  &&Date.parse(reports[1].period_end)<Date.parse(reports[0].period_start);
 const comparisonSafe=source?.comparison_guard?.safe!==false&&validPeriods;
 const profitReady=source?.financial_trust?.status==='READY';
 const caveats=['네이버 주간 저장 보고서만 조회합니다. 카페24·쿠팡 자료와 합산하지 않습니다.','현재 원천 수집 상태는 별도 확인이 필요합니다. 보고서 작성 시각은 실시간 수집 시각이 아닙니다.','보고서를 새로 생성하거나 광고 설정을 자동 변경하지 않습니다.'];
 if(source?.comparison_guard?.safe===false)caveats.push('비교 기간의 운영 변경이 있어 매출 증감률 판단을 보류합니다.');
 if(!validPeriods)caveats.push('비교할 두 보고서의 기간 근거를 확인해야 합니다.');
 if(!profitReady)caveats.push('재무 근거가 완전하지 않아 이익 판단을 보류합니다.');
 return {writePolicy:'READ_ONLY',generatedAt:timestamp(data.generatedAt),channel:{
  platform:'NAVER',name:'네이버',reportCount:reports.length,revenue:money(channel.revenue),changeRate:comparisonSafe?money(channel.changeRate):null,profit:profitReady?money(channel.profit):null,
  cause:text(channel.cause),causeNote:text(channel.causeNote),action:text(channel.action),actionNote:text(channel.actionNote),
  currentPeriod:channel.currentPeriod?{start:timestamp(channel.currentPeriod.start),end:timestamp(channel.currentPeriod.end),createdAt:timestamp(channel.currentPeriod.createdAt)}:null
 },reports:model.savedReports.NAVER.map(report=>({id:text(report.id,128),title:text(report.title,240),periodStart:timestamp(report.periodStart),periodEnd:timestamp(report.periodEnd),createdAt:timestamp(report.createdAt)})),caveats};
}
module.exports={buildWorkspaceInsightsSummary};
