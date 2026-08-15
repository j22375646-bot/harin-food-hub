'use strict';

const privacy = require('./privacy.js');

const OUTPUT_FIELDS = Object.freeze([
  'decision_status',
  'observation',
  'impact',
  'evidence',
  'recommendation',
  'confidence',
  'caution'
]);

const COMMON_BLOCKED_FIELDS = Object.freeze([
  '고객 이름', '연락처', '주소', '이메일', '주문번호', '배송메모'
]);

const PAGE_ANALYSIS_CONTRACTS = Object.freeze({
  main:Object.freeze({
    id:'main', title:'오늘의 운영 판단', purpose:'오늘 무엇을 먼저 해야 하는지 세 가지 행동으로 정리',
    inputs:['목표 매출','현재 매출','월말 예상 매출','채널 상태','실행 우선순위'],
    references:['PLANNING','MARKETING'], schedule:'매일 오전 7:10', freshness_hours:26
  }),
  insight:Object.freeze({
    id:'insight', title:'성과 원인 분석', purpose:'매출·광고·이익 변화의 원인과 다음 행동을 설명',
    inputs:['분석 기간','광고비','주문·매출','ROAS·CPA','기여이익','이전 기간 비교'],
    references:['PLANNING','MARKETING','COST_SHIPPING'], schedule:'매일 오전 7:10', freshness_hours:26
  }),
  keyword:Object.freeze({
    id:'keyword', title:'검색어 기회·낭비 분석', purpose:'실제 검색어를 확대·유지·제외 후보로 분류',
    inputs:['실제 검색어','노출·클릭','주문·매출','광고비','검색 의도 분류'],
    references:['MARKETING','COMPLIANCE','PRODUCT'], schedule:'매일 오전 7:10', freshness_hours:26
  }),
  product:Object.freeze({
    id:'product', title:'상품 성장·이익 분석', purpose:'판매 중인 상품의 성장 가능성과 실제 이익을 설명',
    inputs:['상품 연결키','채널별 매출','원가 입력률','기여이익','재고일수'],
    references:['PRODUCT','MARKETING','COMPLIANCE','COST_SHIPPING'], schedule:'매주 월요일 오전 7:30', freshness_hours:170
  }),
  orders:Object.freeze({
    id:'orders', title:'주문·출고 우선순위 분석', purpose:'판매자배송 주문 중 오늘 먼저 포장·발급·재시도할 작업을 설명',
    inputs:['처리 필요 건수','송장 발급 대기','채널 등록 실패','배송지연 건수','채널 수집 상태'],
    references:['COST_SHIPPING','PLANNING'], schedule:'매시간 수집 직후', freshness_hours:2
  }),
  cs:Object.freeze({
    id:'cs', title:'CS 요청 우선순위 분석', purpose:'문의와 클레임을 기한·유형·주문 연결 상태로 나눠 처리 순서를 설명',
    inputs:['미처리 건수','기한 초과','미답변 문의','클레임 건수','주문 연결 건수'],
    references:['PRODUCT','COMPLIANCE','PLANNING'], schedule:'매시간 수집 직후', freshness_hours:2
  }),
  inventory:Object.freeze({
    id:'inventory', title:'재고 위험 분석', purpose:'품절과 과잉재고를 나누고 발주·판매촉진 순서를 제안',
    inputs:['판매가능 재고','최근 판매속도','재고일수','재주문 기준','채널 상태'],
    references:['PRODUCT','COST_SHIPPING'], schedule:'매일 오전 7:10', freshness_hours:26
  }),
  settlement:Object.freeze({
    id:'settlement', title:'정산·비용 이상 분석', purpose:'예상 지급액과 실제 정산의 차이, 누락 비용을 설명',
    inputs:['총매출','채널 수수료','배송비','광고비','상품원가','실제 정산액'],
    references:['COST_SHIPPING','PLANNING'], schedule:'매월 1일·5일 오전 8:00', freshness_hours:170
  }),
  collection:Object.freeze({
    id:'collection', title:'수집 실패 원인 분석', purpose:'채널·워커·실패 작업을 분리해 안전한 복구 순서를 설명',
    inputs:['채널 연결상태','최근 수집시각','자료 신선도','워커 생존 신호','최종 실패 작업'],
    references:['PLANNING'], schedule:'매시간 수집 직후', freshness_hours:2
  }),
  notifications:Object.freeze({
    id:'notifications', title:'운영 예외 우선순위 분석', purpose:'열린 알림을 중요도·발생시각·운영 영향 기준으로 정리',
    inputs:['열린 알림','데이터 품질 경고','워커 경고','발송 실패'],
    references:['PLANNING'], schedule:'새 중요 알림 생성 직후', freshness_hours:2
  }),
  reports:Object.freeze({
    id:'reports', title:'진단 근거 정리', purpose:'저장된 진단과 보고서에서 승인 검토가 필요한 항목을 설명',
    inputs:['진단 보고서','이전 기간 비교','자료 상태'], references:['PLANNING','MARKETING'], schedule:'보고서 생성 직후', freshness_hours:26
  }),
  changes:Object.freeze({
    id:'changes', title:'승인·실행 위험 점검', purpose:'승인안의 기대효과와 위험, 실행 차단 조건을 설명',
    inputs:['실행결정','변경 승인안','안전 차단 조건'], references:['PLANNING','MARKETING','COST_SHIPPING'], schedule:'승인안 생성 직후', freshness_hours:26
  }),
  validation:Object.freeze({
    id:'validation', title:'실행결과 검증', purpose:'실행 전 기대치와 7일·14일 실제 결과를 비교',
    inputs:['실행 전 기준','7일 결과','14일 결과'], references:['PLANNING','MARKETING','COST_SHIPPING'], schedule:'매일 오전 5:30', freshness_hours:26
  }),
  experiments:Object.freeze({
    id:'experiments', title:'A/B 학습 정리', purpose:'신뢰도를 통과한 실험 결과를 다음 운영 기준으로 정리',
    inputs:['실험 가설','변형별 표본','신뢰도','승자 판정'], references:['PLANNING','MARKETING'], schedule:'실험 평가 직후', freshness_hours:26
  })
});

function publicContract(contract) {
  return {
    ...contract,
    outputs:OUTPUT_FIELDS,
    blocked_fields:COMMON_BLOCKED_FIELDS,
    calculation_owner:'SERVER',
    ai_role:'EXPLAIN_ONLY',
    writes_allowed:false
  };
}

function listContracts() {
  return Object.values(PAGE_ANALYSIS_CONTRACTS).map(publicContract);
}

function contractForPage(page) {
  const contract=PAGE_ANALYSIS_CONTRACTS[String(page||'').trim()];
  if(!contract)throw new Error('지원하지 않는 AI 분석 페이지입니다.');
  return publicContract(contract);
}

function validateAnalysisEnvelope(input = {}) {
  const contract=contractForPage(input.page);
  const envelope={
    page:contract.id,
    period:String(input.period||'').trim().slice(0,80),
    generated_at:String(input.generated_at||'').trim().slice(0,40),
    data_status:String(input.data_status||'BLOCKED').trim().toUpperCase(),
    formula_version:String(input.formula_version||'').trim().slice(0,80),
    metrics:input.metrics&&typeof input.metrics==='object'&&!Array.isArray(input.metrics)?input.metrics:{}
  };
  if(!['READY','PARTIAL','STALE','BLOCKED','NO_DATA'].includes(envelope.data_status))throw new Error('AI 분석 자료 상태를 확인해주세요.');
  if(!envelope.period)throw new Error('AI 분석 기간이 필요합니다.');
  if(!envelope.formula_version)throw new Error('서버 계산식 버전이 필요합니다.');
  privacy.assertNoPii(envelope);
  return { contract, envelope, can_run:['READY','PARTIAL'].includes(envelope.data_status) };
}

module.exports={ OUTPUT_FIELDS, COMMON_BLOCKED_FIELDS, PAGE_ANALYSIS_CONTRACTS, listContracts, contractForPage, validateAnalysisEnvelope };
