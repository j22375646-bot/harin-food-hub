'use strict';
const {buildPhase28InsightsModel,normalizeInsightReportDetail}=require('../ui/phase28-adapters/insights.js');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const DETAIL_SECTION_BYTES=900;
const detailText=(value,maxBytes)=>{
 const source=typeof value==='string'?value.trim():'',sourceCharacters=Array.from(source),characters=sourceCharacters.slice(0,500);let output='';
 for(const character of characters){if(output.length+character.length>500||Buffer.byteLength(output+character)>maxBytes)break;output+=character;}
 return {value:output,truncated:characters.length<sourceCharacters.length||Array.from(output).length<characters.length};
};
const metricText=value=>(typeof value==='number'&&Number.isFinite(value))?String(value):'확인 필요';
function buildReportDetail(report){
 const source=report.summary_json;
 // Stored owner_brief is deliberately removed so the current server formula rebuilds the brief.
 const normalized=normalizeInsightReportDetail({...report,summary_json:{...source,owner_brief:undefined}}),brief=normalized.ownerBrief||{};
 const candidates=[
  ['결정',brief.decision?[{title:brief.decision.label,body:brief.decision.reason}]:[]],
  ['위험',(brief.diagnosis?.risks||[]).map(item=>({title:item.title,body:item.body}))],
  ['캠페인',(brief.campaigns||[]).map(item=>({title:item.name,body:`${text(item.category)||'유형 확인 필요'} · ${text(item.decision)||'판단 보류'} · 광고비 ${metricText(item.adSpend)} · ROAS ${metricText(item.paidRoas)}%`}))],
  ['키워드',[...(brief.keywords?.waste||[]).map(item=>({title:item.keyword,body:`낭비 후보 · 광고비 ${metricText(item.adSpend)} · 구매 ${metricText(item.conversions)} · ROAS ${metricText(item.paidRoas)}%`})),...(brief.keywords?.growth||[]).map(item=>({title:item.keyword,body:`성장 후보 · 광고비 ${metricText(item.adSpend)} · 구매 ${metricText(item.conversions)} · ROAS ${metricText(item.paidRoas)}%`}))]],
  ['행동',(brief.actions?.now||[]).map(item=>({title:item.title,body:[item.reason,item.expected,item.risk].filter(value=>typeof value==='string'&&value.trim()).join(' · ')}))],
  ['근거',(brief.verification||[]).map(item=>({title:item.label,body:[item.evidence,item.action].filter(value=>typeof value==='string'&&value.trim()).join(' · ')}))]
 ];
 const sections=candidates.slice(0,6).map(([title])=>({title,items:[]}));
 let truncated=false;
 for(const [sectionIndex,[,rawItems]] of candidates.slice(0,6).entries()){
  const items=sections[sectionIndex].items;let remaining=DETAIL_SECTION_BYTES;if(rawItems.length>8)truncated=true;
  for(const rawItem of rawItems.slice(0,8)){
   const itemTitle=detailText(rawItem?.title,remaining);remaining-=Buffer.byteLength(itemTitle.value);
   const itemBody=detailText(rawItem?.body,remaining);remaining-=Buffer.byteLength(itemBody.value);
   truncated||=itemTitle.truncated||itemBody.truncated;
   if(!itemTitle.value&&!itemBody.value){truncated=true;break;}
   items.push({title:itemTitle.value,body:itemBody.value});
   if(remaining===0){if(items.length<Math.min(rawItems.length,8))truncated=true;break;}
  }
 }
 return {sections,truncated};
}
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
 },reports:model.savedReports.NAVER.map((report,index)=>({id:text(report.id,128),title:text(report.title,240),periodStart:timestamp(report.periodStart),periodEnd:timestamp(report.periodEnd),createdAt:timestamp(report.createdAt),detail:buildReportDetail(reports[index])})),caveats};
}
module.exports={buildWorkspaceInsightsSummary};
