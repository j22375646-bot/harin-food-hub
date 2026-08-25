'use strict';

const STEP_META=[
  {id:'reports',href:'/diagnoses',icon:'reports',tone:'lavender',label:'진단 근거',description:'문제와 근거를 확인'},
  {id:'changes',href:'/approvals',icon:'approvals',tone:'pink',label:'변경 기록',description:'바꾸기 전후를 기록'},
  {id:'validation',href:'/execution-validation',icon:'validation',tone:'blue',label:'7·14일 결과',description:'매출과 이익을 검증'},
  {id:'experiments',href:'/ab-tests',icon:'experiments',tone:'mint',label:'다음 실험',description:'검증된 기준을 축적'}
];

const own=(object,key)=>Boolean(object)&&Object.prototype.hasOwnProperty.call(object,key);
const finite=value=>Number.isFinite(Number(value));
const display=value=>value==null?'확인 필요':`${Number(value).toLocaleString('ko-KR')}건`;

function reportCount(data){
  const history=data?.reportLearningHistory;
  if(!history)return null;
  if(own(history.summary,'learned')&&finite(history.summary.learned))return Number(history.summary.learned);
  return Array.isArray(history.items)?history.items.length:null;
}

function changeCount(data){
  const execution=data?.retentionValidation?.execution;
  if(!execution||!Array.isArray(data?.actions)||!Array.isArray(execution.changes))return null;
  const actions=data.actions.filter(item=>['PLANNED','ON_HOLD'].includes(item?.status)).length;
  const changes=execution.changes.filter(item=>['PREVIEWED','APPROVED'].includes(item?.status)).length;
  return actions+changes;
}

function validationCount(data){
  const summary=data?.retentionValidation?.execution?.summary;
  if(!summary||!own(summary,'day7_ready')||!own(summary,'day14_ready'))return null;
  if(!finite(summary.day7_ready)||!finite(summary.day14_ready))return null;
  return Number(summary.day7_ready)+Number(summary.day14_ready);
}

function experimentCount(data){
  return Array.isArray(data?.experiments)?data.experiments.length:null;
}

function buildExecutionDecisionLoop(data={}){
  const values={
    reports:reportCount(data),
    changes:changeCount(data),
    validation:validationCount(data),
    experiments:experimentCount(data)
  };
  const steps=STEP_META.map(step=>({...step,value:values[step.id],display:display(values[step.id]),evidence_status:values[step.id]==null?'CHECK_REQUIRED':'READY'}));
  return {
    steps,
    has_missing_evidence:steps.some(step=>step.value==null),
    known_total:steps.reduce((sum,step)=>sum+(step.value??0),0)
  };
}

module.exports={STEP_META,buildExecutionDecisionLoop};
