'use strict';

const {normalizePhase28Metric}=require('../phase28-view-model.js');

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const numeric=value=>finite(value)?value:null;
const round=value=>finite(value)?Math.round(value):null;
const dateOnly=value=>String(value||'').slice(0,10);

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
  if(!recent.length||!start)return Object.freeze({status:'BLOCKED',days:Object.freeze([]),expectedOrders:null,expectedRevenue:null,basis:'최근 7일 판매 근거 확인 필요'});
  const averageOrders=recent.reduce((sum,item)=>sum+item.orders,0)/recent.length;
  const averageRevenue=recent.reduce((sum,item)=>sum+item.revenue,0)/recent.length;
  const days=Array.from({length:7},(_,index)=>Object.freeze({
    date:addDays(start,index+1),
    orders:round(averageOrders),
    revenue:round(averageRevenue)
  }));
  return Object.freeze({
    status:'PARTIAL',
    days:Object.freeze(days),
    expectedOrders:round(averageOrders*7),
    expectedRevenue:round(averageRevenue*7),
    basis:`최근 ${recent.length}일 Cafe24 판매 평균을 단순 연장한 예상값`
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

  return Object.freeze({
    hero:Object.freeze({
      asOf,
      taskCount,
      exceptionCount,
      status:countsReady?'READY':'BLOCKED',
      tone:!countsReady?'blocked':exceptionCount>0?'watch':taskCount>0?'focus':'steady',
      headline:!countsReady?'오늘 운영 건수는 확인이 필요해요.':exceptionCount>0?'확인이 필요한 흐름이 있어요.':taskCount>0?'오늘 처리할 일을 정리했어요.':'오늘 회사는 순항 중이에요.',
      summary:!countsReady?'운영 자료 수집 상태를 확인한 뒤 오늘 처리할 일을 정리할 수 있어요.':taskCount>0?`운영 근거를 기준으로 처리할 일 ${taskCount}건을 우선순위대로 모았어요.`:'새로 처리할 업무가 없습니다. 채널 상태와 매출 흐름만 확인하세요.',
      note:String(data.ownerNote||daily.note||'등록된 메모 없음')
    }),
    metrics:Object.freeze({
      target:moneyMetric({value:finite(metrics.target)?metrics.target:null,source:'salesCommandCenter.metrics.target',metricKind:'actual',asOf}),
      current:moneyMetric({value:finite(metrics.current)?metrics.current:null,source:'salesCommandCenter.metrics.current',metricKind:'actual',asOf}),
      forecast:moneyMetric({value:finite(metrics.forecast)?metrics.forecast:null,source:'salesCommandCenter.metrics.forecast',metricKind:'estimate',status:finite(metrics.forecast)?'PARTIAL':'BLOCKED',asOf,reasons:finite(metrics.forecast)?['PACE_ESTIMATE']:['VALUE_MISSING']}),
      profit:moneyMetric({value:finite(profitability.contribution_profit)?profitability.contribution_profit:null,source:'liveProfitability.contribution_profit',metricKind:'calculated',status:finite(profitability.contribution_profit)?'READY':'BLOCKED',asOf,reasons:finite(profitability.contribution_profit)?[]:['FINANCIAL_TRUST_REQUIRED']}),
      balance:moneyMetric({value:balanceReady?cashflow.expectedBalance:null,source:'salesCommandCenter.cashflow.expectedBalance',metricKind:'estimate',status:balanceReady?'PARTIAL':'BLOCKED',period:'ROLLING_30D',asOf,reasons:balanceReady?['PACE_ESTIMATE']:['FINANCIAL_TRUST_REQUIRED']})
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
    decisions:Object.freeze(decisions.map(item=>Object.freeze(item))),
    channels:Object.freeze((center.channels||[]).map(item=>Object.freeze({...item}))),
    growth:Object.freeze((center.products?.growth||[]).slice(0,3).map(item=>Object.freeze({...item}))),
    risks:Object.freeze((center.products?.risk||[]).slice(0,3).map(item=>Object.freeze({...item}))),
    cashflow:Object.freeze({
      status:String(cashflow.status||'CHECK_REQUIRED'),
      description:String(cashflow.description||'재무 근거를 확인한 뒤 예상 잔액을 계산합니다.'),
      rows:Object.freeze([
        Object.freeze({key:'sales',label:'결제 매출',value:numeric(profitability.revenue)}),
        Object.freeze({key:'operating',label:'원가·배송',value:finite(profitability.product_cost)&&finite(profitability.shipping_cost)?profitability.product_cost+profitability.shipping_cost:null}),
        Object.freeze({key:'fees',label:'수수료·광고',value:finite(profitability.fees)&&finite(profitability.ad_spend)?profitability.fees+profitability.ad_spend:null}),
        Object.freeze({key:'profit',label:'실제 이익',value:numeric(profitability.contribution_profit)})
      ])
    }),
    forecast:buildSevenDayForecast(data.cafe24Analytics||{},asOf),
    cashCalendar:buildCashCalendar(data.unifiedSettlement||{},asOf),
    changeEffects:Object.freeze([]),
    trust:Object.freeze({status:String(data.financialTrust?.status||'BLOCKED')})
  });
}

module.exports={buildPhase28MainModel};
