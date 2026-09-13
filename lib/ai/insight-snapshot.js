'use strict';
const {createHash}=require('node:crypto');
const {calculatePerformance}=require('../metrics/calculator.js');
const FORMULA_VERSION='insight-naver-ad-v1';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>{throw Object.assign(new Error('Invalid insight sources'),{code:'BLOCKED'});};
const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const finite=(v,negative=false)=>{
  if(!(typeof v==='number'||typeof v==='string'&&v.trim()!==''))return null;
  const n=Number(v);return Number.isFinite(n)&&Math.abs(n)<=1e15&&(negative||n>=0)?n:null;
};
const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const n=Date.parse(v);return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v?v:null;}
function instant(v){const n=typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(n)?new Date(n).toISOString():null;}
function buildInsightSnapshot({tenantId,reports,sourceState={},now=new Date()}={}) {
  if(!identifier(tenantId)||!Array.isArray(reports)||reports.length<1||reports.length>2)fail();
  const today=new Date(new Date(now).getTime()+9*3600000).toISOString().slice(0,10);
  const rows=reports.map(r=>{
    if(!object(r)||!identifier(r.id)||r.platform!=='NAVER'||r.report_type!=='WEEKLY'||r.tenant_id&&r.tenant_id!==tenantId||!object(r.summary_json))fail();
    const start=date(r.period_start?.slice(0,10)),end=date(r.period_end?.slice(0,10));
    if(!start||!end||start>end||end>=today)fail();
    return {r,start,end,days:(Date.parse(end)-Date.parse(start))/86400000+1};
  }).sort((a,b)=>b.end.localeCompare(a.end));
  if(new Set(rows.map(x=>x.r.id)).size!==rows.length)fail();
  const [current,previous]=rows,metrics={};
  const exclusions=['네이버 광고 전환매출이며 전체 주문 매출이 아닙니다.','저장 보고서의 역사적 설명이며 현재 운영 변경을 실행하지 않습니다.'];
  for(const [index,row] of rows.entries()){
    const summary=row.r.summary_json,n=summary.naver||summary.NAVER||{},prefix=index?'previous':'';
    const raw={revenue:finite(n.revenue??n.conversion_revenue),adSpend:finite(n.ad_spend),clicks:finite(n.clicks),conversions:finite(n.purchase_count??n.conversions)};
    const calc=calculatePerformance({revenue:raw.revenue,cost:raw.adSpend,clicks:raw.clicks,conversions:raw.conversions});
    const profit=summary.financial_trust?.status==='READY'?finite(n.contribution_profit??summary.channel_profitability?.NAVER?.contribution_profit,true):null;
    const values={...raw,cvr:raw.clicks>0&&raw.conversions!==null?calc.cvrPercent:null,roas:raw.adSpend>0&&raw.revenue!==null?calc.roasPercent:null,contributionProfit:profit};
    const definitions={revenue:['KRW','네이버 광고 전환매출'],adSpend:['KRW','네이버 광고비'],clicks:['COUNT','네이버 광고 클릭수'],conversions:['COUNT','네이버 광고 전환수'],cvr:['PERCENT','합산 전환수 / 합산 클릭수 × 백'],roas:['PERCENT','광고 전환매출 / 광고비 × 백'],contributionProfit:['KRW','재무 신뢰도 READY의 네이버 공헌이익']};
    for(const [key,value] of Object.entries(values)){
      const id=prefix?prefix+key[0].toUpperCase()+key.slice(1):key;
      const checked=finite(value,key==='contributionProfit');
      metrics[id]={value:checked,unit:definitions[key][0],definition:definitions[key][1],sourceId:row.r.id,reason:checked===null?'확인 필요':null};
    }
  }
  // Basis is server provenance, never inferred from report creation time or the current workbench.
  const basis=sourceState.reportBasis||{};
  const sameBasis=previous&&['currency','taxBasis','adScope','aggregationDefinition'].every(k=>typeof basis[current.r.id]?.[k]==='string'&&basis[current.r.id][k]!==''&&basis[current.r.id][k]===basis[previous.r.id]?.[k]);
  const allowed=!!(previous&&previous.end<current.start&&previous.days===current.days&&sameBasis&&rows.every(x=>x.r.summary_json.comparison_guard?.safe!==false));
  const comparison={allowed,reason:allowed?null:previous?'비교 기간 또는 통화·과세·광고 범위·집계 정의 확인 필요':'비교 보고서 없음',period:previous?{start:previous.start,end:previous.end}:null};
  const before=metrics.previousRevenue?.value,after=metrics.revenue.value;
  const change=allowed&&before!==null&&after!==null?after-before:null;
  metrics.revenueChange={value:change,unit:'KRW',definition:'현재 광고 전환매출 - 비교 광고 전환매출',sourceId:current.r.id,sourceIds:rows.map(x=>x.r.id),reason:change===null?'비교 확인 필요':null};
  metrics.revenueChangePct={...metrics.revenueChange,value:change!==null&&before>0?finite(change/before*100,true):null,unit:'PERCENT',definition:'광고 전환매출 증감률; 전기 영이면 미산정'};
  metrics.cvrChangePp={...metrics.revenueChange,value:allowed&&metrics.cvr.value!==null&&metrics.previousCvr?.value!==null?metrics.cvr.value-metrics.previousCvr.value:null,unit:'PERCENT_POINT',definition:'현재 합산 전환율 - 비교 합산 전환율'};
  const sourceAsOf=instant(sourceState.sourceAsOf),fresh=sourceAsOf&&Date.parse(sourceAsOf)<=new Date(now).getTime()&&new Date(now)-Date.parse(sourceAsOf)<=86400000;
  if(!sourceAsOf)exclusions.push('원천 수집 시각 확인 필요. 보고서 작성 시각으로 대체하지 않습니다.');
  if(!fresh)exclusions.push('현재 행동 추천은 판단 보류합니다.');
  if(metrics.contributionProfit.value===null)exclusions.push('재무 근거가 불완전하여 이익 판단을 보류합니다.');
  if(!allowed)exclusions.push(comparison.reason);
  const usable=['revenue','adSpend','clicks','conversions'].some(k=>metrics[k].value!==null);
  const partial=Object.values(metrics).some(m=>m.value===null)||!sourceAsOf;
  const snapshot={tenantId,scope:'NAVER_AD_REPORT',platform:'NAVER',dataClass:'INTERNAL_AGGREGATE',sourceIds:rows.map(x=>x.r.id),period:{start:current.start,end:current.end},comparison,metrics,findings:Object.entries(metrics).filter(([,m])=>m.value!==null).map(([id,m])=>({id,metricRefs:[id],evidenceRefs:m.sourceIds||[m.sourceId]})),dataState:!usable?'BLOCKED':sourceAsOf&&!fresh?'STALE':partial?'PARTIAL':'COMPLETE',sourceAsOf,exclusions,formulaVersion:FORMULA_VERSION};
  snapshot.hash=createHash('sha256').update(JSON.stringify(stable({...snapshot,dataState:undefined,exclusions:undefined,reportBasis:basis}))).digest('hex');
  return snapshot;
}
module.exports={buildInsightSnapshot,FORMULA_VERSION};
