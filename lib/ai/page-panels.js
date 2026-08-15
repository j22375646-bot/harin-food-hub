'use strict';

const { kstDateKey } = require('../automation/kst-schedule.js');
const { contractForPage } = require('./analysis-contracts.js');
const count = value => Number(value || 0);

const COMMON_EXCLUSIONS = Object.freeze([
  '고객 이름·연락처·주소·이메일',
  '원문 주문번호·배송메모',
  '서버가 계산하지 않은 추정 금액',
  '사장님이 승인하지 않은 변경 작업'
]);

function confidenceFor(panelValue) {
  if (panelValue.data_status === 'BLOCKED') return { state:'LOW', label:'낮음 · 자료 확인 필요' };
  if (count(panelValue.metrics?.primary_value) > 0) return { state:'MEDIUM', label:'보통 · 서버 집계 근거 있음' };
  return { state:'MEDIUM', label:'보통 · 이상 없음도 결과로 확인' };
}

function analysisManifest(panelValue, aiEnabled) {
  const contract=contractForPage(panelValue.id);
  const ready=panelValue.data_status==='READY';
  return {
    inputs:contract.inputs.map((label,index)=>({
      label,
      state:ready||index===0?'INCLUDED':'CHECK_REQUIRED',
      state_label:ready||index===0?'포함':'확인 필요'
    })),
    references:contract.references,
    excluded:[...COMMON_EXCLUSIONS],
    freshness:{
      state:ready?'CURRENT':'CHECK_REQUIRED',
      label:ready?`최대 ${contract.freshness_hours}시간 기준`:'최신 수집 확인 필요',
      generated_at:panelValue.generated_at,
      max_age_hours:contract.freshness_hours,
      schedule:contract.schedule
    },
    confidence:confidenceFor(panelValue),
    cost:{
      currency:'KRW',
      estimated_krw:aiEnabled?null:0,
      label:aiEnabled?'실행 전 토큰 상한 확인':'현재 예상비용 0원',
      detail:aiEnabled?'최대 출력 1,200토큰 · 호출 후 실제 사용량 기록':'OpenAI 호출 잠김 · 서버 미리보기만 사용'
    },
    safety:{
      calculations_owned_by_server:true,
      platform_writes_allowed:false,
      owner_approval_required:true,
      pii_allowed:false,
      openai_enabled:aiEnabled
    }
  };
}

function panel({ id, title, summary, metricLabel, metricValue, metricNumber, sources, tasks, ready, schedule, period }) {
  return {
    id,
    phase:'12-5D',
    title,
    summary,
    metric_label:metricLabel,
    metric_value:metricValue,
    sources,
    tasks,
    readiness:ready ? 'READY' : 'CHECK_REQUIRED',
    readiness_label:ready ? '자료 준비됨' : '자료 확인 필요',
    data_status:ready ? 'READY' : 'BLOCKED',
    period,
    generated_at:null,
    metrics:{ primary_value:metricNumber, primary_label:metricLabel },
    schedule,
    execution_enabled:false
  };
}

function buildAiPagePanels(input = {}) {
  const health = input.dataHealth?.channels || [];
  const healthy = platform => health.find(item=>item.platform===platform)?.calculationStatus !== 'CHECK_REQUIRED';
  const anyOperationalChannelReady = health.some(item=>['CAFE24','NAVER','COUPANG'].includes(item.platform)&&item.calculationStatus!=='CHECK_REQUIRED');
  const productItems=Array.isArray(input.productOperations?.items)?input.productOperations.items:[];
  const activeProducts=productItems.filter(item=>Object.values(item.channels||{}).some(channel=>channel?.state==='ACTIVE')).length;
  const products = count(input.productOperations?.summary?.sellable ?? input.productOperations?.summary?.products ?? activeProducts);
  const inventoryActions = count(input.unifiedInventory?.summary?.action_required);
  const settlementChecks = count(input.unifiedSettlement?.summary?.check_required_channels);
  const orderActions = count(input.unifiedOrders?.summary?.actionRequired);
  const csActive = count(input.customerService?.summary?.active);
  const priorities = count(input.priorityCenter?.summary?.action_required ?? input.priorityCenter?.items?.length);
  const searchTerms = count(input.searchTermCenter?.summary?.terms ?? input.searchTermCenter?.items?.length);
  const aiEnabled = input.aiConfiguration?.execution_enabled === true;
  const generatedAt=String(input.generatedAt||new Date().toISOString());
  const period=String(input.period||kstDateKey(generatedAt));
  const learning=input.reportLearningHistory?.summary||{};
  const execution=input.retentionValidation?.execution||{};
  const executionSummary=execution.summary||{};
  const executionChanges=Array.isArray(execution.changes)?execution.changes:[];
  const experiments=Array.isArray(input.experiments)?input.experiments:[];
  const approvalWaiting=count(executionSummary.planned)+executionChanges.filter(item=>['PREVIEWED','APPROVED'].includes(item.status)).length;
  const validationReady=count(executionSummary.day7_ready)+count(executionSummary.day14_ready);
  const collectionSummary=input.collectionCenter?.summary||{};
  const openAlerts=(input.alerts||[]).filter(item=>String(item.status||'OPEN').toUpperCase()==='OPEN');

  const panels = {
    main:panel({
      id:'main', title:'오늘의 하린 AI 브리핑', summary:'매출 목표, 위험 신호, 오늘 할 일을 한 장으로 설명할 자리입니다.',
      metricLabel:'확인할 운영 항목', metricValue:`${priorities.toLocaleString('ko-KR')}개`,
      metricNumber:priorities, period,
      sources:['매출 목표','채널 상태','실행 우선순위'], tasks:['오늘 매출 부족분 설명','채널별 위험 요약','오늘 할 일 3개 정리'],
      ready:healthy('CAFE24') && healthy('NAVER') && healthy('COUPANG'), schedule:'매일 오전 7:10'
    }),
    insight:panel({
      id:'insight', title:'성과 원인 자동분석', summary:'매출과 광고 성과가 왜 변했는지 근거와 다음 행동으로 풀어낼 자리입니다.',
      metricLabel:'연결된 분석 채널', metricValue:`${health.filter(item=>item.calculationStatus!=='CHECK_REQUIRED').length}/3`,
      metricNumber:health.filter(item=>item.calculationStatus!=='CHECK_REQUIRED').length, period,
      sources:['광고 성과','주문·매출','원가·정산'], tasks:['변화 원인 설명','이익 영향 확인','추천 행동과 주의점'],
      ready:healthy('NAVER') && healthy('CAFE24'), schedule:'매일 오전 7:10'
    }),
    keyword:panel({
      id:'keyword', title:'검색어·광고비 자동분석', summary:'돈을 쓰고도 주문이 없는 검색어와 키워드 기회를 구분할 자리입니다.',
      metricLabel:'분석할 검색어', metricValue:`${searchTerms.toLocaleString('ko-KR')}개`,
      metricNumber:searchTerms, period,
      sources:['실제 검색어','키워드 성과','상품 연결'], tasks:['낭비 검색어 찾기','확장 키워드 제안','표본 부족 시 판단 보류'],
      ready:healthy('NAVER') && searchTerms > 0, schedule:'매일 오전 7:10'
    }),
    product:panel({
      id:'product', title:'상품 성장·수익성 자동분석', summary:'판매 중인 상품별로 성장 가능성과 실제로 남는 돈을 설명할 자리입니다.',
      metricLabel:'판매 중 분석상품', metricValue:`${products.toLocaleString('ko-KR')}개`,
      metricNumber:products, period,
      sources:['판매상품 매칭','상품 원가','채널별 판매'], tasks:['성장상품 찾기','묶음별 이익 비교','원가 미입력 차단'],
      ready:products > 0, schedule:'매주 월요일 오전 7:30'
    }),
    orders:panel({
      id:'orders', title:'주문·출고 우선순위 자동분석', summary:'판매자배송 주문 중 오늘 먼저 포장하고, 송장을 발급하고, 다시 전송할 작업을 설명할 자리입니다.',
      metricLabel:'지금 처리할 주문', metricValue:`${orderActions.toLocaleString('ko-KR')}건`,
      metricNumber:orderActions, period,
      sources:['판매자배송 상태','우체국 송장 처리','채널별 최신 수집'], tasks:['15시 전 당일출고 순서','배송지연·재시도 먼저 보기','로켓그로스 작업목록 제외'],
      ready:anyOperationalChannelReady, schedule:'매시간 수집 직후'
    }),
    cs:panel({
      id:'cs', title:'CS 요청 우선순위 자동분석', summary:'미답변 문의와 취소·반품·교환 요청을 기한과 주문 상태에 따라 처리 순서로 정리할 자리입니다.',
      metricLabel:'지금 처리할 CS', metricValue:`${csActive.toLocaleString('ko-KR')}건`,
      metricNumber:csActive, period,
      sources:['미답변 문의','클레임 상태','연결 주문 상태'], tasks:['기한 초과 먼저 보기','답변 양식 추천','처리 완료 요청 제외'],
      ready:anyOperationalChannelReady, schedule:'매시간 수집 직후'
    }),
    inventory:panel({
      id:'inventory', title:'재고 위험 자동분석', summary:'품절과 과잉재고를 먼저 찾아 발주·판매촉진 순서를 제안할 자리입니다.',
      metricLabel:'지금 확인할 상품', metricValue:`${inventoryActions.toLocaleString('ko-KR')}개`,
      metricNumber:inventoryActions, period,
      sources:['채널별 재고','최근 판매속도','재고 기준시각'], tasks:['품절 예상일 설명','과잉재고 구분','발주·촉진 순서 제안'],
      ready:healthy('COUPANG') || healthy('CAFE24'), schedule:'매일 오전 7:10'
    }),
    settlement:panel({
      id:'settlement', title:'정산·비용 이상 자동분석', summary:'예상 입금액과 실제 지급액의 차이, 누락된 비용을 점검할 자리입니다.',
      metricLabel:'자료 확인 채널', metricValue:`${settlementChecks.toLocaleString('ko-KR')}개`,
      metricNumber:settlementChecks, period,
      sources:['플랫폼 정산','수수료·물류비','상품 원가'], tasks:['정산 차이 설명','비용 누락 경고','월말 이익 요약'],
      ready:settlementChecks === 0, schedule:'매월 1일·5일 오전 8:00'
    }),
    collection:panel({
      id:'collection', title:'수집 실패 원인 자동분석', summary:'채널 연결, 오래된 자료, 고정 IP 워커와 재시도 기록을 페이지 안에서만 분석할 자리입니다.',
      metricLabel:'지금 확인할 수집 신호', metricValue:`${count(collectionSummary.attention_channels)+count(collectionSummary.dead_letters)}건`,
      metricNumber:count(collectionSummary.attention_channels)+count(collectionSummary.dead_letters), period,
      sources:['채널별 최근 수집','고정 IP 워커 생존 신호','실패 작업 재시도'], tasks:['멈춘 채널 원인 구분','이전 자료 사용 경고','안전한 재시도 순서 제안'],
      ready:count(collectionSummary.ready_channels)>0, schedule:'매시간 수집 직후'
    }),
    notifications:panel({
      id:'notifications', title:'운영 예외 우선순위 자동분석', summary:'열린 알림과 발송 실패를 중요도, 발생 시각, 업무 영향 기준으로 이 페이지 안에서만 정리할 자리입니다.',
      metricLabel:'열린 운영 알림', metricValue:`${openAlerts.length.toLocaleString('ko-KR')}건`,
      metricNumber:openAlerts.length, period,
      sources:['데이터 품질 알림','워커·자동수집 경고','보고서 발송 기록'], tasks:['먼저 해결할 예외 정렬','반복 경고 묶기','확인·해결 다음 행동 제안'],
      ready:true, schedule:'새 중요 알림 생성 직후'
    }),
    reports:panel({
      id:'reports', title:'진단 근거 자동정리', summary:'저장된 진단과 보고서를 비교해 무엇을 승인 화면으로 보낼지 설명합니다.',
      metricLabel:'비교 가능한 진단', metricValue:`${count(learning.learned).toLocaleString('ko-KR')}건`,
      metricNumber:count(learning.learned), period,
      sources:['저장된 진단','자동보고서','이전 결과 비교'], tasks:['문제와 근거 분리','중복 진단 묶기','승인 검토가 필요한 항목 제안'],
      ready:count(learning.learned)>0, schedule:'보고서 생성 직후'
    }),
    changes:panel({
      id:'changes', title:'승인·실행 위험 자동점검', summary:'승인 대기 항목의 기대효과와 위험, 실행 전 차단 조건을 같은 형식으로 확인합니다.',
      metricLabel:'결정할 항목', metricValue:`${approvalWaiting.toLocaleString('ko-KR')}건`,
      metricNumber:approvalWaiting, period,
      sources:['실행결정','변경 승인안','원가·표본 안전조건'], tasks:['승인 우선순위 정리','실행 위험 확인','검증 예정일 안내'],
      ready:approvalWaiting>0, schedule:'승인안 생성 직후'
    }),
    validation:panel({
      id:'validation', title:'7일·14일 결과 자동분석', summary:'실행 전 기대치와 실제 매출·이익 변화를 비교해 유지·복구·추가관찰을 제안합니다.',
      metricLabel:'확인 가능한 결과', metricValue:`${validationReady.toLocaleString('ko-KR')}건`,
      metricNumber:validationReady, period,
      sources:['실행 전 기준','7일 결과','14일 결과'], tasks:['기대 대비 결과 비교','표본 부족 판단 보류','유지·복구·추가관찰 제안'],
      ready:validationReady>0, schedule:'매일 오전 5:30'
    }),
    experiments:panel({
      id:'experiments', title:'A/B 학습결과 자동정리', summary:'표본과 신뢰도를 통과한 실험만 다음 운영 기준으로 남기도록 정리합니다.',
      metricLabel:'등록된 실험', metricValue:`${experiments.length.toLocaleString('ko-KR')}개`,
      metricNumber:experiments.length, period,
      sources:['A/B 테스트','표본 신뢰도','7일·14일 실행결과'], tasks:['승자·판단보류 구분','재현 가능한 기준 정리','다음 실험 제안'],
      ready:experiments.length>0, schedule:'실험 평가 직후'
    })
  };
  for (const value of Object.values(panels)) {
    value.execution_enabled=aiEnabled;
    value.generated_at=generatedAt;
    value.persistence_enabled=true;
    value.analysis_manifest=analysisManifest(value,aiEnabled);
  }
  return panels;
}

module.exports = { buildAiPagePanels };
