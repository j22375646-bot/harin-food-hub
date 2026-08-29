'use strict';

const reportLearning=require('../../reports/learning-history.js');
const reportVersioning=require('../../reports/versioning.js');

const text=value=>String(value==null?'':value).trim();
const finite=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const time=value=>new Date(value||0).getTime()||0;
const channelLabel=value=>({NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24',ALL:'전체 채널'}[text(value).toUpperCase()]||text(value)||'채널 확인 필요');
const typeLabel=value=>({DAILY:'일간',WEEKLY:'주간',MONTHLY:'월간',MONTHLY_PROVISIONAL:'월간 잠정',MONTHLY_FINAL:'월간 확정',ADHOC:'수시',PRODUCT_ANALYSIS:'상품분석'}[text(value).toUpperCase()]||text(value)||'진단');

function kstLabel(value){
  const date=new Date(value||0);
  if(Number.isNaN(date.getTime()))return '시각 확인 필요';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return `${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}:${parts.minute}`;
}

function reportState(value){
  const state=text(value).toUpperCase();
  if(state==='READY')return 'READY';
  if(state==='BLOCKED')return 'BLOCKED';
  return 'CHECK_REQUIRED';
}

function evidenceLabel(report,item){
  const coverage=report?.summary_json?.data_coverage||{};
  const coverageCount=Object.keys(coverage).length;
  const nextCount=Array.isArray(item?.next_actions)?item.next_actions.length:0;
  if(item?.data_status!=='READY')return item?.observations?.[0]?.title||'근거와 계산 기준 확인 필요';
  return `서버 근거 ${coverageCount} · 다음 행동 ${nextCount}`;
}

function normalizeVersion(row){
  return Object.freeze({
    id:text(row?.id),version:Number(row?.version||1),isLatest:Boolean(row?.is_latest),
    approvedAt:row?.approved_at||null,approvedBy:text(row?.approved_by)||null,
    revisionNote:text(row?.revision_note)||'기존 보고서',createdAt:row?.created_at||null,
    createdLabel:kstLabel(row?.created_at)
  });
}

function buildPhase28DiagnosesModel(snapshot={}){
  const hasError=Boolean(snapshot.error);
  if(hasError)return Object.freeze({
    dataStatus:'ERROR',generatedAt:snapshot.generatedAt||null,error:text(snapshot.error),
    summary:Object.freeze({stored:null,ready:null,blocked:null,versions:null}),items:Object.freeze([]),
    versionsError:null,policy:Object.freeze({automaticWrites:false,missingAsZero:false,ownerConfirmation:true,detailLoading:'COMPACT_SERVER_MODEL'})
  });
  const reports=[...(snapshot.latestReports||[])].sort((a,b)=>time(b.created_at)-time(a.created_at));
  const learning=reportLearning.buildLearningHistory({reports,automationRuns:[]});
  const learningById=new Map(learning.items.map(item=>[String(item.id),item]));
  const versionGroups=new Map(reportVersioning.groupVersions(snapshot.versionHeaders||[]).map(group=>[group.key,group.versions.map(normalizeVersion)]));
  const items=reports.map(report=>{
    const learned=learningById.get(String(report.id))||{};
    const state=reportState(learned.data_status);
    const observation=learned.observations?.[0]||{};
    const action=learned.next_actions?.[0]||{};
    const versions=versionGroups.get(reportVersioning.seriesKey(report))||[normalizeVersion(report)];
    const score=finite(report?.summary_json?.score);
    const scoreDelta=score==null?null:finite(learned.score_delta);
    return Object.freeze({
      id:text(report.id),platform:text(report.platform).toUpperCase()||'UNKNOWN',channel:channelLabel(report.platform),
      reportType:text(report.report_type).toUpperCase(),reportTypeLabel:typeLabel(report.report_type),
      title:text(report.title)||'진단 제목 확인 필요',periodStart:report.period_start||null,periodEnd:report.period_end||null,
      periodLabel:report.period_start&&report.period_end?`${report.period_start} ~ ${report.period_end}`:'기간 확인 필요',
      version:Number(report.version||1),status:text(report.status||'FINAL').toUpperCase(),state,
      stateLabel:state==='READY'?'분석 가능':state==='BLOCKED'?'판단 보류':'확인 필요',
      score,scoreDelta,headline:text(observation.title)||text(action.title)||'핵심 판단 확인 필요',
      detailCopy:text(observation.body)||text(action.reason)||'저장된 진단 근거를 확인하세요.',
      evidenceLabel:evidenceLabel(report,learned),lastCalculatedAt:report.created_at||null,
      lastCalculatedLabel:kstLabel(report.created_at),aiRole:learned.openai_called?'AI 설명 포함 · 변경 금지':'서버 계산 · 변경 금지',
      nextAction:text(action.title)||'변경 후보 확인',nextActionNote:text(action.reason)||'자동 실행 없이 변경 기록에서 후보를 확인합니다.',
      approvedAt:report.approved_at||null,approvedBy:text(report.approved_by)||null,versions:Object.freeze(versions)
    });
  });
  const ready=items.filter(item=>item.state==='READY').length;
  const blocked=items.filter(item=>item.state!=='READY').length;
  const latest=items[0]||null;
  return Object.freeze({
    dataStatus:'READY',generatedAt:snapshot.generatedAt||null,error:null,items:Object.freeze(items),
    summary:Object.freeze({stored:items.length,ready,blocked,versions:snapshot.versionsError?null:(snapshot.versionHeaders||[]).length}),
    latestLabel:latest?.lastCalculatedLabel||'저장 진단 없음',latestMeta:latest?`v${latest.version} · ${latest.channel} ${latest.reportTypeLabel}`:'새 보고서 생성 필요',
    versionsError:text(snapshot.versionsError)||null,
    flow:Object.freeze([
      Object.freeze({id:'diagnoses',href:'/diagnoses',step:'01',label:'진단 근거',description:'문제와 근거를 확인'}),
      Object.freeze({id:'changes',href:'/approvals',step:'02',label:'변경 기록',description:'바꾸기 전후를 기록'}),
      Object.freeze({id:'validation',href:'/execution-validation',step:'03',label:'7·14일 결과',description:'매출과 이익을 검증'}),
      Object.freeze({id:'experiments',href:'/ab-tests',step:'04',label:'다음 실험',description:'검증된 기준을 축적'})
    ]),
    schedule:Object.freeze({daily:'매일 오전 7:10',weekly:'매주 월요일 오전 7:30',monthlyProvisional:'매월 1일 오전 8:00',monthlyFinal:'매월 5일 오전 8:00'}),
    policy:Object.freeze({automaticWrites:false,missingAsZero:false,ownerConfirmation:true,detailLoading:'COMPACT_SERVER_MODEL'})
  });
}

module.exports={buildPhase28DiagnosesModel,reportState,evidenceLabel,kstLabel,channelLabel,typeLabel};
