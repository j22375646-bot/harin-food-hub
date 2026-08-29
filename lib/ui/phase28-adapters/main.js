'use strict';

const {normalizePhase28Metric}=require('../phase28-view-model.js');

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const numeric=value=>finite(value)?value:null;

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
      summary:!countsReady?'운영 자료 수집 상태를 확인한 뒤 오늘 처리할 일을 정리할 수 있어요.':taskCount>0?`운영 근거를 기준으로 처리할 일 ${taskCount}건을 우선순위대로 모았어요.`:'새로 처리할 업무가 없습니다. 채널 상태와 매출 흐름만 확인하세요.'
    }),
    metrics:Object.freeze({
      target:moneyMetric({value:finite(metrics.target)?metrics.target:null,source:'salesCommandCenter.metrics.target',metricKind:'actual',asOf}),
      current:moneyMetric({value:finite(metrics.current)?metrics.current:null,source:'salesCommandCenter.metrics.current',metricKind:'actual',asOf}),
      forecast:moneyMetric({value:finite(metrics.forecast)?metrics.forecast:null,source:'salesCommandCenter.metrics.forecast',metricKind:'estimate',status:finite(metrics.forecast)?'PARTIAL':'BLOCKED',asOf,reasons:finite(metrics.forecast)?['PACE_ESTIMATE']:['VALUE_MISSING']}),
      balance:moneyMetric({value:balanceReady?cashflow.expectedBalance:null,source:'salesCommandCenter.cashflow.expectedBalance',metricKind:'estimate',status:balanceReady?'PARTIAL':'BLOCKED',period:'ROLLING_30D',asOf,reasons:balanceReady?['PACE_ESTIMATE']:['FINANCIAL_TRUST_REQUIRED']})
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
    cashflow:Object.freeze({status:String(cashflow.status||'CHECK_REQUIRED'),description:String(cashflow.description||'재무 근거를 확인한 뒤 예상 잔액을 계산합니다.')}),
    trust:Object.freeze({status:String(data.financialTrust?.status||'BLOCKED')})
  });
}

module.exports={buildPhase28MainModel};
