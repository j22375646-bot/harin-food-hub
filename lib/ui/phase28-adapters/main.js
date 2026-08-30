'use strict';

const {normalizePhase28Metric}=require('../phase28-view-model.js');
const calendarCenter=require('../../calendar/calendar-center.js');

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const numeric=value=>finite(value)?value:null;
const round=value=>finite(value)?Math.round(value):null;
const dateOnly=value=>String(value||'').slice(0,10);
const text=value=>String(value==null?'':value).trim();
const reportTime=report=>new Date(report?.period_end||report?.created_at||0).getTime()||0;
const channelLabels=Object.freeze({NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24',ALL:'통합'});

function seoulDateKey(value){
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function addDays(date,days){
  const value=new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}

function buildSevenDayForecast(analytics={},asOf=null){
  const recent=(analytics.daily||[]).filter(item=>finite(item.orders)&&finite(item.revenue)).slice(-7);
  const start=seoulDateKey(asOf);
  const recentOrders=recent.reduce((sum,item)=>sum+item.orders,0);
  const recentRevenue=recent.reduce((sum,item)=>sum+item.revenue,0);
  const actualReady=recent.length>0&&analytics.status!=='BLOCKED'&&analytics.status!=='NO_DATA';
  const actualDays=actualReady?Object.freeze(recent.map(item=>Object.freeze({
    date:dateOnly(item.date),
    orders:round(item.orders),
    revenue:round(item.revenue)
  }))):Object.freeze([]);
  const actualRevenue=actualReady?round(recentRevenue):null;
  const actualBasis=actualReady
    ?analytics.basis||`최근 ${recent.length}일 결제 주문 실제값`
    :analytics.basis||'최근 7일 실제 매출 근거 확인 필요';
  if(!recent.length||!start||analytics.status==='BLOCKED'||analytics.status==='NO_DATA'||recentOrders<=0||recentRevenue<=0)return Object.freeze({status:'BLOCKED',actualDays,actualRevenue,actualBasis,days:Object.freeze([]),expectedOrders:null,expectedRevenue:null,basis:analytics.basis||'최근 7일 판매 근거 확인 필요'});
  const averageOrders=recent.reduce((sum,item)=>sum+item.orders,0)/recent.length;
  const averageRevenue=recent.reduce((sum,item)=>sum+item.revenue,0)/recent.length;
  const days=Array.from({length:7},(_,index)=>Object.freeze({
    date:addDays(start,index+1),
    orders:round(averageOrders),
    revenue:round(averageRevenue)
  }));
  return Object.freeze({
    status:'PARTIAL',
    actualDays,
    actualRevenue,
    actualBasis,
    days:Object.freeze(days),
    expectedOrders:round(averageOrders*7),
    expectedRevenue:round(averageRevenue*7),
    basis:analytics.channels?.length
      ?`최근 ${recent.length}일 ${analytics.channels.map(channel=>channelLabels[channel]||channel).sort((left,right)=>['네이버','쿠팡','Cafe24'].indexOf(left)-['네이버','쿠팡','Cafe24'].indexOf(right)).join('·')} 결제 주문 평균을 단순 연장한 예상값`
      :`최근 ${recent.length}일 Cafe24 판매 평균을 단순 연장한 예상값`
  });
}

function buildCashCalendar(settlement={},asOf=null){
  const start=seoulDateKey(asOf);
  if(!start)return Object.freeze([]);
  const end=addDays(start,7);
  return Object.freeze((settlement.schedules||[])
    .filter(item=>dateOnly(item.date)>=start&&dateOnly(item.date)<=end)
    .slice(0,5)
    .map(item=>Object.freeze({
      platform:String(item.platform||'SHARED'),
      date:dateOnly(item.date),
      status:String(item.status||'확인 필요'),
      amount:finite(item.amount)?item.amount:null
    })));
}

function buildGrowthEvidence(centerGrowth=[],reports=[]){
  const latestReports=(reports||[])
    .filter(report=>report&&report.is_latest!==false&&report.summary_json&&text(report.status||'FINAL').toUpperCase()!=='FAILED')
    .sort((left,right)=>reportTime(right)-reportTime(left));
  const weeklyReports=latestReports.filter(report=>text(report.report_type).toUpperCase()==='WEEKLY');
  const productReports=latestReports.filter(report=>text(report.report_type).toUpperCase().startsWith('PRODUCT_ANALYSIS_')&&report.summary_json?.kind==='PRODUCT_ANALYSIS');

  const insightSignals=weeklyReports.flatMap(report=>{
    const summary=report.summary_json||{};
    const positive=(summary.insights||[]).find(item=>['GOOD','POSITIVE','OPPORTUNITY','GROWTH'].includes(text(item?.level||item?.tone).toUpperCase()))
      ||(summary.executive?.opportunities||[])[0]
      ||(summary.recommendations||[]).find(item=>['GROWTH','OPPORTUNITY'].includes(text(item?.area||item?.tone).toUpperCase()));
    if(!positive)return [];
    const platform=text(report.platform).toUpperCase()||'ALL';
    return [{
      key:`INSIGHT:${text(report.id)||reportTime(report)}`,source:'INSIGHT',sourceLabel:`${channelLabels[platform]||platform} 인사이트`,
      name:text(positive.title||positive.recommendation)||text(report.title)||'주간 성장 인사이트',
      evidence:text(positive.body||positive.reason||positive.expected)||'같은 채널의 저장 인사이트 근거',
      metricLabel:report.period_end?`${dateOnly(report.period_end)} 저장 보고서`:'저장 인사이트',
      currentRevenue:null,growthRate:null,destination:'insights',reportId:text(report.id),asOf:report.created_at||report.period_end||null,
      _time:reportTime(report)
    }];
  });

  const productSignals=productReports.flatMap(report=>{
    const summary=report.summary_json||{};
    const signal=(summary.signals||[]).find(item=>['GOOD','POSITIVE','OPPORTUNITY','GROWTH'].includes(text(item?.tone||item?.level).toUpperCase()));
    const revenue=numeric(summary.metrics?.revenue);
    const searchDemand=numeric(summary.metrics?.search_demand);
    if(!signal&&!(revenue>0)&&!(searchDemand>0))return [];
    const product=summary.product||{};
    return [{
      key:`PRODUCT_ANALYSIS:${text(report.id)||text(product.id)||reportTime(report)}`,source:'PRODUCT_ANALYSIS',sourceLabel:'상품분석',
      name:text(product.name)||text(report.title)||'분석 상품 확인',
      evidence:text(signal?.body)||text(signal?.title)||'저장된 상품분석의 실제 판매·검색 근거',
      metricLabel:revenue!=null?`${Math.round(revenue).toLocaleString('ko-KR')}원 매출`:searchDemand!=null?`검색 노출 ${Math.round(searchDemand).toLocaleString('ko-KR')}회`:'분석 근거 확인',
      currentRevenue:revenue,growthRate:null,destination:'product-analysis',reportId:text(report.id),asOf:report.created_at||report.period_end||null,
      _time:reportTime(report)
    }];
  });

  const legacySignals=(centerGrowth||[]).map((item,index)=>({
    ...item,key:item.key||`SALES:${index}`,source:item.source||'SALES',sourceLabel:item.sourceLabel||'판매 추이',
    evidence:item.evidence||item.riskReason||'최근 7일과 이전 7일의 실제 판매 비교',
    metricLabel:item.metricLabel||(item.growthRate==null?'판매 비교 근거 확인':`이전 7일보다 +${item.growthRate}%`),
    destination:item.destination||'product-analysis',_time:0
  }));
  const selected=[];
  if(productSignals[0])selected.push(productSignals[0]);
  if(insightSignals[0])selected.push(insightSignals[0]);
  const selectedKeys=new Set(selected.map(item=>item.key));
  const remaining=[...productSignals,...insightSignals,...legacySignals]
    .filter(item=>!selectedKeys.has(item.key))
    .sort((left,right)=>(right._time||0)-(left._time||0));
  selected.push(...remaining.slice(0,Math.max(0,3-selected.length)));
  return Object.freeze({
    signals:Object.freeze(selected.slice(0,3).map(({_time,...item})=>Object.freeze(item))),
    sources:Object.freeze({
      insights:Object.freeze({label:'인사이트',reportCount:weeklyReports.length,signalCount:insightSignals.length,status:weeklyReports.length?'READY':'CHECK_REQUIRED',destination:'insights'}),
      productAnalysis:Object.freeze({label:'상품분석',reportCount:productReports.length,signalCount:productSignals.length,status:productReports.length?'READY':'CHECK_REQUIRED',destination:'product-analysis'})
    })
  });
}

function moneyMetric({value,source,metricKind='actual',status='READY',period='MONTH',asOf=null,reasons=[]}){
  return normalizePhase28Metric({
    value,
    unit:'KRW',
    source,
    metricKind,
    status,
    period,
    asOf,
    reasons
  });
}

function buildPhase28MainModel(data={}){
  const center=data.salesCommandCenter||{};
  const metrics=center.metrics||{};
  const daily=center.daily||{};
  const cashflow=center.cashflow||{};
  const profitability=data.liveProfitability||{};
  const asOf=data.generatedAt||daily.generated_at||null;
  const balanceReady=finite(cashflow.expectedBalance)&&cashflow.status==='ESTIMATE';
  const taskCount=numeric(daily.total);
  const exceptionCount=numeric(daily.exception_total);
  const countsReady=taskCount!==null&&exceptionCount!==null;
  const decisions=Array.isArray(center.actions)?center.actions.slice(0,3).map((item,index)=>({
    id:String(item.id||`decision-${index+1}`),
    rank:index+1,
    title:String(item.title||'확인할 업무'),
    reason:String(item.reason||item.next_step||'세부 내용을 확인해주세요.'),
    nextStep:String(item.next_step||''),
    platform:String(item.platform||'ALL'),
    view:String(item.view||'main'),
    status:String(item.decision_status||'READY')
  })):[];
  const growthEvidence=buildGrowthEvidence(center.products?.growth||[],data.growthReports||data.reports||[]);
  const todayCalendar=calendarCenter.buildTodayCalendar(data.calendarEntries||[],asOf||new Date());
  const todayMemo=todayCalendar.items.find(item=>item.type==='MEMO');

  return Object.freeze({
    hero:Object.freeze({
      asOf,
      taskCount,
      exceptionCount,
      status:countsReady?'READY':'BLOCKED',
      tone:!countsReady?'blocked':exceptionCount>0?'watch':taskCount>0?'focus':'steady',
      headline:!countsReady?'오늘 운영 건수는 확인이 필요해요.':exceptionCount>0?'확인이 필요한 흐름이 있어요.':taskCount>0?'오늘 처리할 일을 정리했어요.':'오늘 회사는 순항 중이에요.',
      summary:!countsReady?'운영 자료 수집 상태를 확인한 뒤 오늘 처리할 일을 정리할 수 있어요.':taskCount>0?`운영 근거를 기준으로 처리할 일 ${taskCount}건을 우선순위대로 모았어요.`:'새로 처리할 업무가 없습니다. 채널 상태와 매출 흐름만 확인하세요.',
      note:String(todayMemo?.title||todayMemo?.body||data.ownerNote||daily.note||'등록된 메모 없음')
    }),
    metrics:Object.freeze({
      target:moneyMetric({value:finite(metrics.target)?metrics.target:null,source:'salesCommandCenter.metrics.target',metricKind:'actual',asOf}),
      current:moneyMetric({value:finite(metrics.current)?metrics.current:null,source:'salesCommandCenter.metrics.current',metricKind:'actual',asOf}),
      forecast:moneyMetric({value:finite(metrics.forecast)?metrics.forecast:null,source:'salesCommandCenter.metrics.forecast',metricKind:'estimate',status:finite(metrics.forecast)?'PARTIAL':'BLOCKED',asOf,reasons:finite(metrics.forecast)?['PACE_ESTIMATE']:['VALUE_MISSING']}),
      profit:moneyMetric({value:finite(profitability.contribution_profit)?profitability.contribution_profit:null,source:'liveProfitability.contribution_profit',metricKind:'calculated',status:finite(profitability.contribution_profit)?'READY':'BLOCKED',asOf,reasons:finite(profitability.contribution_profit)?[]:['FINANCIAL_TRUST_REQUIRED']}),
      balance:moneyMetric({value:balanceReady?cashflow.expectedBalance:null,source:'salesCommandCenter.cashflow.expectedBalance',metricKind:'estimate',status:balanceReady?'PARTIAL':'BLOCKED',period:'ROLLING_30D',asOf,reasons:balanceReady?['PACE_ESTIMATE']:['FINANCIAL_TRUST_REQUIRED']})
    }),
    targetSettings:Object.freeze({
      month:String(center.targetSettings?.month||String(asOf||'').slice(0,7)),
      platform:'ALL',
      revenueTarget:numeric(center.targetSettings?.revenueTarget),
      adBudget:numeric(center.targetSettings?.adBudget),
      targetRoas:numeric(center.targetSettings?.targetRoas)
    }),
    deadline:Object.freeze({
      label:'오후 3시 출고',
      at:daily.schedule?.cutoff_at||null,
      state:String(daily.schedule?.cutoff_state||'CHECK_REQUIRED'),
      remainingMinutes:daily.schedule?.cutoff_at&&asOf?Math.max(0,Math.floor((Date.parse(daily.schedule.cutoff_at)-Date.parse(asOf))/60000)):null
    }),
    likelihood:Object.freeze({
      code:String(center.likelihood?.code||'CHECK_REQUIRED'),
      label:String(center.likelihood?.label||'확인 필요'),
      description:String(center.likelihood?.description||'목표와 매출 근거를 확인한 뒤 계산할 수 있어요.')
    }),
    schedule:Object.freeze((daily.schedule?.items||[]).map(item=>Object.freeze({...item}))),
    calendar:todayCalendar,
    decisions:Object.freeze(decisions.map(item=>Object.freeze(item))),
    channels:Object.freeze((center.channels||[]).map(item=>Object.freeze({...item}))),
    growth:growthEvidence.signals,
    growthSources:growthEvidence.sources,
    risks:Object.freeze((center.products?.risk||[]).slice(0,3).map(item=>Object.freeze({...item}))),
    cashflow:Object.freeze({
      status:String(cashflow.status||'CHECK_REQUIRED'),
      description:String(cashflow.description||'재무 근거를 확인한 뒤 예상 잔액을 계산합니다.'),
      rows:Object.freeze([
        Object.freeze({key:'sales',label:'결제 매출',value:numeric(metrics.current)??numeric(profitability.revenue),status:numeric(metrics.current)!=null||numeric(profitability.revenue)!=null?'READY':'CHECK_REQUIRED'}),
        Object.freeze({key:'operating',label:'원가·배송',value:finite(profitability.product_cost)&&finite(profitability.shipping_cost)?profitability.product_cost+profitability.shipping_cost:null}),
        Object.freeze({key:'fees',label:'수수료·광고',value:finite(profitability.fees)&&finite(profitability.ad_spend)?profitability.fees+profitability.ad_spend:null}),
        Object.freeze({key:'profit',label:'실제 이익',value:numeric(profitability.contribution_profit)})
      ])
    }),
    forecast:buildSevenDayForecast(data.salesHistory?.daily?.length?data.salesHistory:(data.cafe24Analytics||{}),asOf),
    cashCalendar:buildCashCalendar(data.unifiedSettlement||{},asOf),
    changeEffects:Object.freeze([]),
    trust:Object.freeze({status:String(data.financialTrust?.status||'BLOCKED')})
  });
}

module.exports={buildPhase28MainModel};
