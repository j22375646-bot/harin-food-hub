'use strict';

const count = value => Number(value || 0);

function panel({ id, title, summary, metricLabel, metricValue, sources, tasks, ready, schedule }) {
  return {
    id,
    phase:'12-5A',
    title,
    summary,
    metric_label:metricLabel,
    metric_value:metricValue,
    sources,
    tasks,
    readiness:ready ? 'READY' : 'CHECK_REQUIRED',
    readiness_label:ready ? '자료 준비됨' : '자료 확인 필요',
    schedule,
    execution_enabled:false
  };
}

function buildAiPagePanels(input = {}) {
  const health = input.dataHealth?.channels || [];
  const healthy = platform => health.find(item=>item.platform===platform)?.calculationStatus !== 'CHECK_REQUIRED';
  const productItems=Array.isArray(input.productOperations?.items)?input.productOperations.items:[];
  const activeProducts=productItems.filter(item=>Object.values(item.channels||{}).some(channel=>channel?.state==='ACTIVE')).length;
  const products = count(input.productOperations?.summary?.sellable ?? input.productOperations?.summary?.products ?? activeProducts);
  const inventoryActions = count(input.unifiedInventory?.summary?.action_required);
  const settlementChecks = count(input.unifiedSettlement?.summary?.check_required_channels);
  const priorities = count(input.priorityCenter?.summary?.action_required ?? input.priorityCenter?.items?.length);
  const searchTerms = count(input.searchTermCenter?.summary?.terms ?? input.searchTermCenter?.items?.length);
  const aiEnabled = input.aiConfiguration?.execution_enabled === true;

  const panels = {
    main:panel({
      id:'main', title:'오늘의 하린 AI 브리핑', summary:'매출 목표, 위험 신호, 오늘 할 일을 한 장으로 설명할 자리입니다.',
      metricLabel:'확인할 운영 항목', metricValue:`${priorities.toLocaleString('ko-KR')}개`,
      sources:['매출 목표','채널 상태','실행 우선순위'], tasks:['오늘 매출 부족분 설명','채널별 위험 요약','오늘 할 일 3개 정리'],
      ready:healthy('CAFE24') && healthy('NAVER') && healthy('COUPANG'), schedule:'매일 오전 7:10'
    }),
    insight:panel({
      id:'insight', title:'성과 원인 자동분석', summary:'매출과 광고 성과가 왜 변했는지 근거와 다음 행동으로 풀어낼 자리입니다.',
      metricLabel:'연결된 분석 채널', metricValue:`${health.filter(item=>item.calculationStatus!=='CHECK_REQUIRED').length}/3`,
      sources:['광고 성과','주문·매출','원가·정산'], tasks:['변화 원인 설명','이익 영향 확인','추천 행동과 주의점'],
      ready:healthy('NAVER') && healthy('CAFE24'), schedule:'매일 오전 7:10'
    }),
    keyword:panel({
      id:'keyword', title:'검색어·광고비 자동분석', summary:'돈을 쓰고도 주문이 없는 검색어와 키워드 기회를 구분할 자리입니다.',
      metricLabel:'분석할 검색어', metricValue:`${searchTerms.toLocaleString('ko-KR')}개`,
      sources:['실제 검색어','키워드 성과','상품 연결'], tasks:['낭비 검색어 찾기','확장 키워드 제안','표본 부족 시 판단 보류'],
      ready:healthy('NAVER') && searchTerms > 0, schedule:'매일 오전 7:10'
    }),
    product:panel({
      id:'product', title:'상품 성장·수익성 자동분석', summary:'판매 중인 상품별로 성장 가능성과 실제로 남는 돈을 설명할 자리입니다.',
      metricLabel:'판매 중 분석상품', metricValue:`${products.toLocaleString('ko-KR')}개`,
      sources:['판매상품 매칭','상품 원가','채널별 판매'], tasks:['성장상품 찾기','묶음별 이익 비교','원가 미입력 차단'],
      ready:products > 0, schedule:'매주 월요일 오전 7:30'
    }),
    inventory:panel({
      id:'inventory', title:'재고 위험 자동분석', summary:'품절과 과잉재고를 먼저 찾아 발주·판매촉진 순서를 제안할 자리입니다.',
      metricLabel:'지금 확인할 상품', metricValue:`${inventoryActions.toLocaleString('ko-KR')}개`,
      sources:['채널별 재고','최근 판매속도','재고 기준시각'], tasks:['품절 예상일 설명','과잉재고 구분','발주·촉진 순서 제안'],
      ready:healthy('COUPANG') || healthy('CAFE24'), schedule:'매일 오전 7:10'
    }),
    settlement:panel({
      id:'settlement', title:'정산·비용 이상 자동분석', summary:'예상 입금액과 실제 지급액의 차이, 누락된 비용을 점검할 자리입니다.',
      metricLabel:'자료 확인 채널', metricValue:`${settlementChecks.toLocaleString('ko-KR')}개`,
      sources:['플랫폼 정산','수수료·물류비','상품 원가'], tasks:['정산 차이 설명','비용 누락 경고','월말 이익 요약'],
      ready:settlementChecks === 0, schedule:'매월 1일·5일 오전 8:00'
    })
  };
  for (const value of Object.values(panels)) value.execution_enabled=aiEnabled;
  return panels;
}

module.exports = { buildAiPagePanels };
