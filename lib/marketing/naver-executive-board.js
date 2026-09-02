'use strict';

const cafe24OrderOrigin=require('../cafe24/order-origin.js');

const FORMULA_VERSION = 'n3-naver-executive-board-v1';
const DAY_MS = 86400000;

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function ratio(numerator, denominator, multiplier = 100) {
  return number(denominator) > 0 ? round(number(numerator) / number(denominator) * multiplier) : null;
}

function dateOnly(value) { return String(value || '').slice(0, 10); }

function inPeriod(value, start, end) {
  const key = dateOnly(value);
  return Boolean(key && start && end && key >= start && key <= end);
}

function aggregateAds(rows = []) {
  const totals = rows.reduce((sum, row) => ({
    impressions:sum.impressions + number(row.impressions),
    clicks:sum.clicks + number(row.clicks),
    spend:sum.spend + number(row.cost),
    conversions:sum.conversions + number(row.conversions),
    revenue:sum.revenue + number(row.conversion_revenue)
  }), { impressions:0, clicks:0, spend:0, conversions:0, revenue:0 });
  return {
    ...totals,
    ctr:ratio(totals.clicks, totals.impressions),
    cvr:ratio(totals.conversions, totals.clicks),
    cpc:ratio(totals.spend, totals.clicks, 1),
    cpa:ratio(totals.spend, totals.conversions, 1),
    aov:ratio(totals.revenue, totals.conversions, 1),
    roas:ratio(totals.revenue, totals.spend)
  };
}

function isOpenMarketMirror(order = {}) {
  return !cafe24OrderOrigin.isCafe24StorefrontOrder(order);
}

function orderNetAmount(order = {}) {
  const paid = number(order.paid_amount ?? order.order_price ?? order.raw_data?.payment_amount);
  const reversed = Math.max(number(order.cancel_amount), number(order.refund_amount));
  return Math.max(0, paid - reversed);
}

function percentChange(current, previous) {
  return number(previous) > 0 ? round((number(current) - number(previous)) / number(previous) * 100) : null;
}

function metric({ key, label, value, unit, status = 'READY', description, evidence, reason = null }) {
  return { key, label, value:value == null ? null : round(value), unit, status, description, evidence, reason };
}

function customerAcquisition({ orders = [], periodStart, periodEnd, adSpend }) {
  const directOrders = orders.filter(order => !isOpenMarketMirror(order));
  const periodOrders = directOrders.filter(order => inPeriod(order.order_date, periodStart, periodEnd));
  const identifiable = periodOrders.filter(order => String(order.customer_id || '').trim());
  const coverage = ratio(identifiable.length, periodOrders.length);
  const firstOrderByCustomer = new Map();
  for (const order of directOrders) {
    const customerId = String(order.customer_id || '').trim();
    const date = dateOnly(order.order_date);
    if (!customerId || !date) continue;
    if (!firstOrderByCustomer.has(customerId) || date < firstOrderByCustomer.get(customerId)) firstOrderByCustomer.set(customerId, date);
  }
  const newCustomers = new Set(identifiable
    .filter(order => inPeriod(firstOrderByCustomer.get(String(order.customer_id).trim()), periodStart, periodEnd))
    .map(order => String(order.customer_id).trim())).size;
  const ready = periodOrders.length > 0 && coverage >= 80 && newCustomers > 0;
  return {
    status:ready ? 'PARTIAL' : 'BLOCKED',
    value:ready ? round(number(adSpend) / newCustomers) : null,
    new_customers:newCustomers,
    customer_id_coverage:coverage,
    reason:ready
      ? '네이버 광고 전체비용을 Cafe24 신규고객에 나눈 계정 단위 추정치입니다. 광고 직접 유입으로 확정한 값은 아닙니다.'
      : `고객 식별률이 ${round(coverage || 0, 1)}%라 신규고객 CAC를 믿을 수 있게 계산할 수 없습니다.`
  };
}

function buildLevers({ current, targetRoas, productAdTargets = {} }) {
  const requiredRevenue = current.spend > 0 ? current.spend * number(targetRoas) / 100 : null;
  const requiredAov = current.conversions > 0 ? requiredRevenue / current.conversions : null;
  const revenuePerConversion = current.aov;
  const requiredConversions = revenuePerConversion > 0 ? requiredRevenue / revenuePerConversion : null;
  const requiredCvr = current.clicks > 0 && requiredConversions != null ? requiredConversions / current.clicks * 100 : null;
  const safeTargets = (productAdTargets.items || []).filter(item => item.status === 'READY' && number(item.allowable_cpc) > 0);
  const weightedAllowedCpc = safeTargets.length
    ? safeTargets.reduce((sum, item) => sum + number(item.allowable_cpc), 0) / safeTargets.length
    : null;
  return [
    {
      key:'AOV', label:'객단가', status:requiredAov == null ? 'BLOCKED' : 'READY',
      current:current.aov, target:round(requiredAov), unit:'원',
      change_rate:requiredAov != null ? percentChange(requiredAov, current.aov) : null,
      action:'묶음·세트 구성과 장바구니 제안으로 주문 1건의 금액을 높이세요.'
    },
    {
      key:'CVR', label:'구매전환율', status:requiredCvr == null ? 'BLOCKED' : 'READY',
      current:current.cvr, target:round(requiredCvr), unit:'%',
      change_rate:requiredCvr != null ? percentChange(requiredCvr, current.cvr) : null,
      action:'검색 의도와 상세페이지·가격·리뷰가 맞는지 먼저 점검하세요.'
    },
    {
      key:'CPC', label:'허용 클릭비', status:weightedAllowedCpc == null ? 'BLOCKED' : 'READY',
      current:current.cpc, target:round(weightedAllowedCpc), unit:'원',
      change_rate:weightedAllowedCpc != null ? percentChange(weightedAllowedCpc, current.cpc) : null,
      action:weightedAllowedCpc == null
        ? '상품별 목표 이익률과 원가가 준비되어야 안전한 클릭비를 계산할 수 있습니다.'
        : '제외 검색어·광고그룹 분리 후 허용 클릭비 안에서만 입찰을 검토하세요.'
    }
  ];
}

function selectBottleneck({ current, previous, targetRoas, profitability }) {
  const cvrChange = percentChange(current.cvr, previous.cvr);
  const cpcChange = percentChange(current.cpc, previous.cpc);
  const aovChange = percentChange(current.aov, previous.aov);
  if (current.spend <= 0 || current.clicks <= 0) return { key:'DATA', label:'광고 표본', reason:'광고비나 클릭 표본이 없어 병목을 판단할 수 없습니다.', status:'BLOCKED' };
  if (current.roas != null && current.roas < targetRoas) {
    if (cvrChange != null && cvrChange <= -10) return { key:'PURCHASE', label:'구매 전환', reason:`전환율이 직전 7일보다 ${Math.abs(cvrChange).toFixed(1)}% 낮아졌습니다.`, status:'RISK' };
    if (cpcChange != null && cpcChange >= 10) return { key:'TRAFFIC', label:'클릭 단가', reason:`클릭비가 직전 7일보다 ${cpcChange.toFixed(1)}% 높아졌습니다.`, status:'RISK' };
    if (aovChange != null && aovChange <= -10) return { key:'AOV', label:'객단가', reason:`광고 전환 객단가가 직전 7일보다 ${Math.abs(aovChange).toFixed(1)}% 낮아졌습니다.`, status:'RISK' };
    return { key:'PURCHASE', label:'목표 ROAS', reason:`광고 ROAS가 목표 ${targetRoas}%보다 낮습니다.`, status:'RISK' };
  }
  if (profitability?.contribution_profit == null) return { key:'PROFIT', label:'실제 이익', reason:'원가 반영률이 부족해 광고 후 이익을 확인할 수 없습니다.', status:'BLOCKED' };
  if (number(profitability.contribution_profit) < 0) return { key:'PROFIT', label:'실제 이익', reason:'광고비를 제외한 공헌이익이 음수입니다.', status:'RISK' };
  return { key:'OBSERVE', label:'뚜렷한 병목 없음', reason:'현재 표본에서는 즉시 중단할 단일 병목이 보이지 않습니다.', status:'READY' };
}

function buildBudgetPreview({ searchTermCenter = {}, current, targetRoas, actualAov }) {
  const candidates = (searchTermCenter.items || []).filter(item =>
    item.recommended_action === 'NEGATIVE_REVIEW' && !['APPROVED', 'APPLIED', 'REJECTED'].includes(String(item.action_status || '').toUpperCase())
  );
  const savedSpend = candidates.reduce((sum, item) => sum + number(item.cost), 0);
  const requiredRevenue = savedSpend * number(targetRoas) / 100;
  const aov = number(actualAov) || number(current.aov);
  return {
    status:savedSpend > 0 ? 'PREVIEW' : 'NO_CANDIDATE',
    candidate_count:candidates.length,
    saved_spend:round(savedSpend),
    required_revenue:round(requiredRevenue),
    required_orders:aov > 0 ? round(requiredRevenue / aov, 1) : null,
    inventory_status:'CHECK_REQUIRED',
    shipping_status:'CHECK_REQUIRED',
    note:'계산 미리보기일 뿐 광고 예산이나 입찰가는 변경하지 않습니다.'
  };
}

function buildNaverExecutiveBoard({
  currentAdRows = [], previousAdRows = [], cafe24Orders = [], naverOrders = [], naverSettlements = [],
  profitability = {}, productAdTargets = {}, searchTermCenter = {}, periodStart = null, periodEnd = null,
  targetRoas = 250, asOf = new Date().toISOString(), unavailable = {}
} = {}) {
  const current = aggregateAds(currentAdRows);
  const previous = aggregateAds(previousAdRows);
  const directCafe24Orders = cafe24Orders.filter(order => !isOpenMarketMirror(order) && inPeriod(order.order_date, periodStart, periodEnd));
  const naverPeriodOrders = naverOrders.filter(order => inPeriod(order.payment_date || order.order_date, periodStart, periodEnd));
  const directCafe24Sales = directCafe24Orders.reduce((sum, order) => sum + orderNetAmount(order), 0);
  const naverOrderSales = naverPeriodOrders.reduce((sum, order) => sum + number(order.paid_amount), 0);
  const confirmedNetSales = directCafe24Sales + naverOrderSales;
  const mer = ratio(confirmedNetSales, current.spend);
  const settlementRows = naverSettlements.filter(row => {
    const start = dateOnly(row.settle_basis_start_date || row.settle_basis_end_date);
    const end = dateOnly(row.settle_basis_end_date || row.settle_basis_start_date);
    return Boolean(start && end && start <= periodEnd && end >= periodStart);
  });
  const settlementPaid = settlementRows.reduce((sum, row) => sum + number(row.settle_amount), 0);
  const cac = customerAcquisition({ orders:cafe24Orders, periodStart, periodEnd, adSpend:current.spend });
  const age = periodEnd ? Math.max(0, Math.floor((new Date(asOf).getTime() - new Date(`${periodEnd}T23:59:59+09:00`).getTime()) / DAY_MS)) : null;
  const adStatus = unavailable.ads ? 'UNAVAILABLE' : current.spend > 0 ? (age != null && age <= 2 ? 'READY' : 'STALE') : 'NO_DATA';
  const profitReady = profitability?.contribution_profit != null;
  const actualOrderAov = [...directCafe24Orders, ...naverPeriodOrders].length
    ? confirmedNetSales / [...directCafe24Orders, ...naverPeriodOrders].length
    : null;

  const metrics = [
    metric({ key:'AD_ROAS', label:'광고센터 ROAS', value:current.roas, unit:'%', status:adStatus,
      description:'네이버 광고센터가 광고 전환으로 잡은 매출 ÷ 광고비입니다.',
      evidence:`전환매출 ${round(current.revenue)}원 ÷ 광고비 ${round(current.spend)}원` }),
    metric({ key:'SETTLEMENT_ROAS', label:'정산 ROAS', value:null, unit:'%', status:'BLOCKED',
      description:'광고 전환 주문이 실제 취소·반품 후 얼마 정산됐는지 보는 값입니다.',
      evidence:`같은 기간 주문 ${naverPeriodOrders.length}건 · 정산 ${settlementRows.length}건`,
      reason:'광고 전환과 네이버 주문·정산을 연결하는 주문키가 없어 확인 불가입니다.' }),
    metric({ key:'MER', label:'확인된 순매출 MER', value:mer, unit:'%', status:current.spend > 0 ? 'READY' : 'BLOCKED',
      description:'중복을 뺀 Cafe24 자사몰과 네이버 실주문 순매출 ÷ 네이버 광고비입니다.',
      evidence:`확인된 순매출 ${round(confirmedNetSales)}원 ÷ 광고비 ${round(current.spend)}원` }),
    metric({ key:'CONTRIBUTION', label:'광고 후 공헌이익', value:profitReady ? profitability.contribution_profit : null, unit:'원', status:profitReady ? 'READY' : 'BLOCKED',
      description:'매출에서 원가·수수료·배송비·광고비를 뺀 실제 남는 돈입니다.',
      evidence:`원가 반영률 ${round(profitability?.cost_coverage_rate || 0, 1)}%`,
      reason:profitReady ? null : '원가 또는 비용 근거가 부족해 0원이 아닌 확인 필요로 표시합니다.' }),
    metric({ key:'CAC', label:'추정 신규고객 CAC', value:cac.value, unit:'원', status:cac.status,
      description:'광고비 ÷ 처음 구매한 고객 수입니다.',
      evidence:`신규고객 ${cac.new_customers}명 · 고객 식별률 ${round(cac.customer_id_coverage || 0, 1)}%`, reason:cac.reason })
  ];

  const bottleneck = selectBottleneck({ current, previous, targetRoas:number(targetRoas), profitability });
  const stages = [
    { key:'IMPRESSION', label:'노출', value:current.impressions, unit:'회', status:current.impressions > 0 ? 'READY' : 'BLOCKED' },
    { key:'CLICK', label:'클릭', value:current.clicks, unit:'회', subvalue:current.ctr, subunit:'%', status:current.clicks > 0 ? 'READY' : 'BLOCKED' },
    { key:'TRAFFIC', label:'유입 품질', value:current.cpc, unit:'원', subvalue:percentChange(current.cpc, previous.cpc), subunit:'%', status:bottleneck.key === 'TRAFFIC' ? 'RISK' : 'READY' },
    { key:'DETAIL', label:'상세 설득', value:null, unit:'', status:'CHECK_REQUIRED', note:'상세페이지 행동 데이터 연결 필요' },
    { key:'PURCHASE', label:'구매', value:current.conversions, unit:'건', subvalue:current.cvr, subunit:'%', status:bottleneck.key === 'PURCHASE' ? 'RISK' : 'READY' },
    { key:'PROFIT', label:'실제 이익', value:profitability?.contribution_profit ?? null, unit:'원', status:profitReady ? (number(profitability.contribution_profit) < 0 ? 'RISK' : 'READY') : 'BLOCKED' },
    { key:'REPEAT', label:'재구매', value:null, unit:'', status:'CHECK_REQUIRED', note:'광고 유입 고객의 재구매 연결 필요' }
  ];

  return {
    phase:'12-3', formula_version:FORMULA_VERSION, period_start:periodStart, period_end:periodEnd, generated_at:asOf,
    target_roas:number(targetRoas), current, previous, metrics,
    actuals:{ direct_cafe24_orders:directCafe24Orders.length, direct_cafe24_sales:round(directCafe24Sales), naver_orders:naverPeriodOrders.length, naver_order_sales:round(naverOrderSales), naver_settlement_rows:settlementRows.length, naver_settlement_amount:round(settlementPaid), confirmed_net_sales:round(confirmedNetSales), actual_order_aov:round(actualOrderAov) },
    levers:buildLevers({ current, targetRoas:number(targetRoas), productAdTargets }),
    bottleneck, stages,
    budget_preview:buildBudgetPreview({ searchTermCenter, current, targetRoas:number(targetRoas), actualAov:actualOrderAov }),
    data_trust:{
      status:metrics.some(item => ['BLOCKED', 'UNAVAILABLE'].includes(item.status)) ? 'PARTIAL' : 'READY',
      ad_age_days:age,
      cost_coverage_rate:profitability?.cost_coverage_rate ?? null,
      settlement_linked:false,
      customer_id_coverage:cac.customer_id_coverage,
      notes:['광고센터 전환매출과 실제 주문매출은 서로 다른 숫자입니다.','정산 주문키가 연결되기 전에는 정산 ROAS를 계산하지 않습니다.','입찰가와 예산은 이 화면에서 변경하지 않습니다.']
    }
  };
}

module.exports = {
  FORMULA_VERSION, aggregateAds, isOpenMarketMirror, orderNetAmount, customerAcquisition,
  buildLevers, selectBottleneck, buildBudgetPreview, buildNaverExecutiveBoard
};
