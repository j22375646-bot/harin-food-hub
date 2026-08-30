'use strict';

const {buildExecutionValidation,buildCustomerRetention}=require('../../customers/retention-validation.js');

const text=value=>String(value==null?'':value).trim();
const number=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const channelLabel=value=>({NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡',ALL:'전체 채널'}[text(value).toUpperCase()]||text(value)||'채널 확인 필요');

function kstDate(value){
  const date=new Date(value||0);
  if(Number.isNaN(date.getTime()))return '날짜 확인 필요';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${Number(parts.month)}/${Number(parts.day)}`;
}

function deltaMoney(value){
  const numeric=number(value);
  if(numeric===null)return '확인 필요';
  const rounded=Math.round(numeric);
  return `${rounded>0?'+':''}${rounded.toLocaleString('ko-KR')}원`;
}

function percent(value){
  const numeric=number(value);
  if(numeric===null)return '확인 필요';
  return `${numeric>0?'+':''}${Math.round(numeric*10)/10}%`;
}

function resultView(result={},days){
  const status=text(result.status).toUpperCase()||'NO_DATA';
  const label={IMPROVED:'개선',DECLINED:'하락',INCONCLUSIVE:'판단 보류',NO_DATA:'확인 필요',COLLECTING:'자료 수집 중',WAITING_EXECUTION:'실행 전'}[status]||text(result.label)||'확인 필요';
  return Object.freeze({
    days,status,label,dueLabel:result.due_date?kstDate(result.due_date):'날짜 확인 필요',
    valueLabel:result.revenue_change==null?(result.change_rate==null?'확인 필요':percent(result.change_rate)):deltaMoney(result.revenue_change),
    revenueLabel:deltaMoney(result.revenue_change),profitLabel:deltaMoney(result.profit_change),
    detail:text(result.explanation)||text(result.metric_name)||(`${days}일 결과 자료를 확인합니다.`),ready:['IMPROVED','DECLINED','INCONCLUSIVE'].includes(status)
  });
}

function decisionFor(day14,day7){
  if(day14.status==='IMPROVED')return {state:'KEEP',label:'현재값 유지',copy:'14일 매출과 이익이 개선되어 현재값을 유지하고 다음 기간을 관찰합니다.'};
  if(day14.status==='DECLINED')return {state:'RECOVER',label:'복구 검토',copy:'14일 결과가 하락해 실행 전 값과 복구 가능 기록을 함께 확인합니다.'};
  if(day14.status==='INCONCLUSIVE'||day7.status==='IMPROVED')return {state:'WATCH',label:'추가 관찰',copy:'한 기간의 변화만으로 확정하지 않고 다음 14일 표본을 더 모읍니다.'};
  return {state:'WAIT',label:'판단 보류',copy:'결과 자료가 충분하지 않아 유지·복구 판단을 보류합니다.'};
}

function customerErrorView(error){
  return Object.freeze({status:'ERROR',error:text(error),period:Object.freeze({start:null,end:null,days:null,order_activity_days:null}),summary:Object.freeze({orders:null,identified_customers:null,repeat_customers:null,repeat_rate:null,cycle_days:null,due_customers:null,dormant_customers:null,lifecycle_status:'ERROR'}),products:Object.freeze([]),recommendations:Object.freeze([{level:'DATA',title:'고객·재구매 자료 확인 필요',body:text(error)}]),privacy:'고객 식별자는 화면 모델에 포함하지 않습니다.'});
}

function buildPhase28ValidationModel(snapshot={},options={}){
  const generatedAt=snapshot.generatedAt||null;
  const policy=Object.freeze({missingAsZero:false,customerIdentifiers:false,dayCheckpoints:Object.freeze([7,14]),readOnly:true});
  const flow=Object.freeze([
    Object.freeze({id:'diagnoses',href:'/diagnoses',step:'01',label:'진단 근거',description:'문제와 근거를 확인'}),
    Object.freeze({id:'changes',href:'/approvals',step:'02',label:'변경 기록',description:'바꾸기 전후를 기록'}),
    Object.freeze({id:'validation',href:'/execution-validation',step:'03',label:'7·14일 결과',description:'매출과 이익을 검증'}),
    Object.freeze({id:'experiments',href:'/ab-tests',step:'04',label:'다음 실험',description:'검증된 기준을 축적'})
  ]);
  if(snapshot.error)return Object.freeze({dataStatus:'ERROR',generatedAt,error:text(snapshot.error),summary:Object.freeze({planned:null,executed:null,day7Ready:null,day14Ready:null,linkedExperiments:null}),items:Object.freeze([]),customer:customerErrorView(snapshot.error),flow,policy});

  const asOf=options.asOf||new Date(generatedAt||Date.now());
  const execution=buildExecutionValidation({actions:snapshot.actions||[],evaluations:snapshot.evaluations||[],reports:snapshot.reports||[],experiments:snapshot.experiments||[],asOf});
  const items=execution.actions.map(row=>{
    const day7=resultView(row.day7,7),day14=resultView(row.day14,14),decision=decisionFor(day14,day7);
    const targetLabel=text(row.target_name)||'실행 대상 확인 필요';
    const executionLabel=row.executed_at?`${kstDate(row.executed_at)} 실행`:'실행 전';
    const expectation=text(row.expectation?.effect)||'예상 효과 확인 필요';
    return Object.freeze({
      id:text(row.id),platform:text(row.platform).toUpperCase(),channel:channelLabel(row.platform),targetLabel,actionType:text(row.action_type)||'실행 유형 확인 필요',status:text(row.status)||'확인 필요',priority:text(row.priority)||'확인 필요',
      decidedLabel:kstDate(row.decided_at),executedLabel:executionLabel,expectation:Object.freeze({metric:text(row.expectation?.metric)||'매출·이익',effect:expectation,risk:text(row.expectation?.risk)||'위험 확인 필요',riskLevel:text(row.expectation?.risk_level)||'MEDIUM'}),
      day7,day14,decisionState:decision.state,decisionLabel:decision.label,decisionCopy:decision.copy,
      reportLabel:row.report?.title||'연결 보고서 없음',experimentId:row.experiment?.id||null,experimentLabel:row.experiment?.name||'연결 실험 없음',
      timeline:Object.freeze([
        Object.freeze({id:'expectation',kicker:'실행 전 예상',title:text(row.expectation?.metric)||'매출·이익',value:expectation,detail:text(row.expectation?.risk)||'실행 위험 확인 필요'}),
        Object.freeze({id:'day0',kicker:`DAY 0 · ${row.executed_at?kstDate(row.executed_at):'실행 전'}`,title:row.executed_at?'실행·재조회 기록':'실행 대기',value:row.executed_at?`${channelLabel(row.platform)} 실행 완료`:'확인 필요',detail:row.executed_at?'원본값과 실행 시각 보존':'실행 전에는 결과를 계산하지 않음'}),
        Object.freeze({id:'day7',kicker:`DAY 7 · ${day7.dueLabel}`,title:day7.label,value:day7.valueLabel,detail:day7.detail}),
        Object.freeze({id:'day14',kicker:`DAY 14 · ${day14.dueLabel}`,title:day14.label,value:day14.profitLabel,detail:day14.detail})
      ])
    });
  });
  const customer=snapshot.customerError?customerErrorView(snapshot.customerError):buildCustomerRetention({orders:snapshot.orders||[],items:snapshot.items||[],asOf});
  const partial=Boolean(snapshot.reportsError||snapshot.experimentsError||snapshot.customerError);
  return Object.freeze({
    dataStatus:partial?'PARTIAL':'READY',generatedAt,error:null,reportsError:text(snapshot.reportsError)||null,experimentsError:text(snapshot.experimentsError)||null,items:Object.freeze(items),
    summary:Object.freeze({planned:execution.summary.planned,executed:execution.summary.executed,day7Ready:execution.summary.day7_ready,day14Ready:execution.summary.day14_ready,linkedExperiments:execution.summary.linked_experiments}),
    customer:Object.freeze(customer),flow,policy
  });
}

module.exports={buildPhase28ValidationModel,resultView,decisionFor,deltaMoney,kstDate};
