'use strict';

const supabase = require('../cafe24/supabase.js');
const engine = require('../analytics/decision-engine.js');
const profitabilityCalculator = require('../analytics/profitability.js');
const metricCalculator = require('../metrics/calculator.js');
const anomalyDetector = require('../anomaly/detector.js');
const cafe24AnalyticsModule = require('../cafe24/analytics.js');
const presentation = require('./presentation.js');
const notificationService = require('../notifications/service.js');
const financialTrustModule = require('../analytics/financial-trust.js');
const learningHistoryModule = require('./learning-history.js');
const operatingRuleModule = require('../ai/operating-rules.js');
const num = value => Number(value || 0);
const won = value => `${Math.round(num(value)).toLocaleString('ko-KR')}원`;
const iso = value => new Date(value).toISOString().slice(0, 10);

function previousWeek(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600000), day = kst.getUTCDay() || 7;
  const end = new Date(kst); end.setUTCDate(kst.getUTCDate() - day); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - 6);
  return { start: iso(start), end: iso(end) };
}

function priorPeriod(period) {
  const end = new Date(`${period.start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (engine.periodDays(period.start, period.end) - 1));
  return { start: iso(start), end: iso(end) };
}

const change = (current, previous) => previous ? (current - previous) / previous * 100 : null;

async function periodSummary(db, start, end, thresholds) {
  const [ordersResult, itemsResult, trafficResult, refsResult, customerHistoryResult, statsResult, campaignResult, linksResult, costsResult, channelCostResult, shippingRuleResult, coupangOrdersResult, coupangItemsResult, coupangSettlementsResult, coupangAdResult] = await Promise.all([
    db.from('cafe24_orders').select('order_id,order_date,customer_id,order_price,paid_amount,discount_amount,shipping_fee,cancel_amount,refund_amount,raw_data').gte('order_date', `${start}T00:00:00`).lte('order_date', `${end}T23:59:59`),
    db.from('cafe24_order_items').select('order_id,external_product_no,product_name,quantity,paid_amount,unit_price'),
    db.from('cafe24_traffic_daily').select('date,visitors,pageviews,source_status').gte('date', start).lte('date', end).order('date'),
    db.from('cafe24_referrers_daily').select('date,source,visitors,orders,revenue').gte('date', start).lte('date', end),
    db.from('cafe24_orders').select('order_id,order_date,customer_id,paid_amount,order_price,raw_data').lte('order_date', `${end}T23:59:59`).order('order_date',{ascending:false}).limit(10000),
    db.from('naver_stats_daily').select('date,entity_id,impressions,clicks,cost,conversions,conversion_revenue').gte('date', start).lte('date', end),
    db.from('naver_campaigns').select('ncc_campaign_id,name,campaign_type,status'),
    db.from('channel_products').select('master_product_id,external_product_id').eq('platform','CAFE24'),
    db.from('product_costs').select('master_product_id,unit_cost,packaging_cost,other_unit_cost'),
    db.from('channel_cost_settings').select('commission_rate,payment_fee_rate,default_shipping_cost').eq('platform','CAFE24').maybeSingle(),
    db.from('channel_shipping_rules').select('return_shipping_cost,return_rate,remote_area_surcharge,remote_area_rate').eq('platform','CAFE24').maybeSingle(),
    db.from('coupang_orders').select('shipment_box_id,order_id,ordered_at,status,gross_amount').gte('ordered_at', `${start}T00:00:00`).lte('ordered_at', `${end}T23:59:59`),
    db.from('coupang_order_items').select('shipment_box_id,order_id,vendor_item_id,seller_product_id,product_name,quantity,unit_price,paid_amount,status'),
    db.from('coupang_settlements').select('order_id,vendor_item_id,recognition_date,settlement_date,sale_amount,service_fee,service_fee_vat,settlement_amount,quantity').gte('recognition_date', start).lte('recognition_date', end),
    db.rpc('get_coupang_ad_report',{p_start:start,p_end:end})
  ]);
  const failed = [ordersResult, itemsResult, trafficResult, refsResult, customerHistoryResult, statsResult, campaignResult, linksResult, costsResult, channelCostResult, shippingRuleResult, coupangOrdersResult, coupangItemsResult, coupangSettlementsResult, coupangAdResult].find(result => result.error);
  if (failed) throw failed.error;

  const orders = ordersResult.data || [], ids = new Set(orders.map(item => item.order_id));
  const items = (itemsResult.data || []).filter(item => ids.has(item.order_id));
  const grossRevenue = orders.reduce((sum, item) => sum + num(item.paid_amount ?? item.raw_data?.payment_amount), 0);
  const refunds = orders.reduce((sum, item) => sum + num(item.refund_amount), 0);
  const cancellations = orders.reduce((sum, item) => sum + num(item.cancel_amount), 0);
  const netRevenue = Math.max(0, grossRevenue - refunds - cancellations);
  const visitors = (trafficResult.data || []).reduce((sum, item) => sum + num(item.visitors), 0);

  const productMap = new Map();
  for (const item of items) {
    const name = item.product_name || '상품명 없음';
    const row = productMap.get(name) || { name, quantity: 0, revenue: 0, orders: new Set() };
    row.quantity += num(item.quantity); row.revenue += num(item.paid_amount ?? num(item.unit_price) * num(item.quantity)); row.orders.add(item.order_id);
    productMap.set(name, row);
  }
  const sourceMap = new Map();
  for (const item of refsResult.data || []) {
    const row = sourceMap.get(item.source) || { source: item.source, visitors: 0, orders: 0, revenue: 0 };
    row.visitors += num(item.visitors); row.orders += num(item.orders); row.revenue += num(item.revenue); sourceMap.set(item.source, row);
  }
  const cafe24Analytics = cafe24AnalyticsModule.buildCafe24Analytics({ orders, items, traffic:trafficResult.data||[], referrers:refsResult.data||[], customerHistory:customerHistoryResult.data||orders, start, end });
  const cafe24 = {
    connected: true, revenue: netRevenue, gross_revenue: grossRevenue, net_revenue: netRevenue, refunds, cancellations,
    discounts: orders.reduce((sum, item) => sum + num(item.discount_amount), 0), shipping_fees: orders.reduce((sum, item) => sum + num(item.shipping_fee), 0),
    orders: orders.length, visitors, pageviews: (trafficResult.data || []).reduce((sum, item) => sum + num(item.pageviews), 0),
    conversion_rate: visitors ? orders.length / visitors * 100 : 0, average_order_value: orders.length ? netRevenue / orders.length : 0,
    data_days: new Set((trafficResult.data || []).map(item => item.date)).size, traffic: trafficResult.data || [],
    top_products: [...productMap.values()].map(item => ({ ...item, orders: item.orders.size })).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    top_sources: [...sourceMap.values()].sort((a, b) => b.visitors - a.visitors).slice(0, 8),
    analytics:cafe24Analytics, funnel:cafe24Analytics.funnel, customers:cafe24Analytics.customers, acquisition:cafe24Analytics.acquisition
  };

  const names = new Map((campaignResult.data || []).map(item => [item.ncc_campaign_id, item])), campaignMap = new Map();
  for (const item of statsResult.data || []) {
    const meta = names.get(item.entity_id) || {};
    const row = campaignMap.get(item.entity_id) || { id: item.entity_id, name: meta.name || item.entity_id, type: meta.campaign_type || 'UNKNOWN', impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 };
    row.impressions += num(item.impressions); row.clicks += num(item.clicks); row.cost += num(item.cost); row.conversions += num(item.conversions); row.revenue += num(item.conversion_revenue);
    campaignMap.set(item.entity_id, row);
  }
  const analyzed = engine.summarizeCampaigns([...campaignMap.values()].map(item => ({ ...item, roas: item.cost ? item.revenue / item.cost * 100 : 0, ctr: item.impressions ? item.clicks / item.impressions * 100 : 0 })), engine.periodDays(start, end));
  const targetRoasPercent = Number(thresholds.target_roas_percent);
  const campaignsWithMetrics = analyzed.campaigns.map(item => ({ ...item, metrics: metricCalculator.calculatePerformance({ ...item, targetRoasPercent }) }));
  const totals = campaignsWithMetrics.reduce((sum, item) => ({ impressions: sum.impressions + item.impressions, clicks: sum.clicks + item.clicks, ad_spend: sum.ad_spend + item.cost, purchase_count: sum.purchase_count + item.conversions, revenue: sum.revenue + item.revenue }), { impressions: 0, clicks: 0, ad_spend: 0, purchase_count: 0, revenue: 0 });
  const performance = metricCalculator.calculatePerformance({ impressions: totals.impressions, clicks: totals.clicks, cost: totals.ad_spend, conversions: totals.purchase_count, revenue: totals.revenue, targetRoasPercent });
  const naver = {
    ...totals, connected: campaignsWithMetrics.length > 0, source: 'NAVER_API', roas: performance.roasPercent,
    ctr: performance.ctrPercent, cpc: performance.cpc, cvr: performance.cvrPercent, cpa: performance.cpa, average_order_value: performance.averageOrderValue,
    target_cpc: performance.targetCpc, recommended_bid_adjustment_rate: performance.recommendedAdjustmentRate, bid_action: performance.bidAction, metrics: performance,
    confidence: engine.sampleConfidence({ clicks: totals.clicks, conversions: totals.purchase_count, days: engine.periodDays(start, end) }),
    campaign_categories: analyzed.categories, top_campaigns: [...campaignsWithMetrics].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    waste_campaigns: campaignsWithMetrics.filter(item => item.cost > 0 && !item.revenue).sort((a, b) => b.cost - a.cost).slice(0, 8)
  };
  const coupangOrders = coupangOrdersResult.data || [];
  const coupangShipmentIds = new Set(coupangOrders.map(item => item.shipment_box_id));
  const coupangItems = (coupangItemsResult.data || []).filter(item => coupangShipmentIds.has(item.shipment_box_id));
  const coupangSettlements = coupangSettlementsResult.data || [];
  const coupangProductMap = new Map();
  for (const item of coupangItems) {
    const name = item.product_name || '상품명 없음';
    const row = coupangProductMap.get(name) || { name, quantity: 0, revenue: 0, orders: new Set() };
    row.quantity += num(item.quantity); row.revenue += num(item.paid_amount ?? num(item.unit_price) * num(item.quantity)); row.orders.add(item.order_id);
    coupangProductMap.set(name, row);
  }
  const coupangGross = coupangOrders.reduce((sum, item) => sum + num(item.gross_amount), 0);
  const coupangFees = coupangSettlements.reduce((sum, item) => sum + num(item.service_fee) + num(item.service_fee_vat), 0);
  const coupangSettlement = coupangSettlements.reduce((sum, item) => sum + num(item.settlement_amount), 0);
  const coupangAds = coupangAdResult.data || {};
  const coupang = {
    connected: coupangOrders.length > 0 || coupangSettlements.length > 0 || coupangAds.connected,
    source: 'COUPANG_FILE_OR_API', gross_sales: coupangGross, orders: coupangOrders.length, items: coupangItems.length,
    settlement_amount: coupangSettlement, fees: coupangFees, settlement_rate: coupangGross ? coupangSettlement / coupangGross * 100 : 0,
    top_products: [...coupangProductMap.values()].map(item => ({ ...item, orders: item.orders.size })).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    ads: coupangAds, ad_spend:num(coupangAds.ad_spend), ad_revenue:num(coupangAds.revenue), ad_roas:num(coupangAds.roas), ad_clicks:num(coupangAds.clicks), ad_orders:num(coupangAds.orders),
    ad_cpc:num(coupangAds.clicks)?num(coupangAds.ad_spend)/num(coupangAds.clicks):0,
    ad_cvr:num(coupangAds.clicks)?num(coupangAds.orders)/num(coupangAds.clicks)*100:0,
    ad_cpa:num(coupangAds.orders)?num(coupangAds.ad_spend)/num(coupangAds.orders):0,
    growth_keywords:coupangAds.growth_keywords||[], waste_keywords:coupangAds.waste_keywords||[], top_campaigns:coupangAds.top_campaigns||[]
  };
  const contribution = profitabilityCalculator.calculateProfitability({ items, productLinks:linksResult.data||[], productCosts:costsResult.data||[], channelSetting:channelCostResult.data||{}, shippingRule:shippingRuleResult.data||{}, adSpend:totals.ad_spend });
  const financialTrust = financialTrustModule.evaluateFinancialTrust({ costCoverageRate:contribution.cost_coverage_rate, requireAdAssignment:false, minimumCostCoverageRate:thresholds.minimum_cost_coverage_percent });
  const trustedMetrics = financialTrustModule.applyBidGuideGate(naver.metrics, financialTrust);
  naver.metrics = trustedMetrics;
  naver.target_cpc = trustedMetrics.targetCpc;
  naver.recommended_bid_adjustment_rate = trustedMetrics.recommendedAdjustmentRate;
  naver.bid_action = trustedMetrics.bidAction;
  naver.top_campaigns = naver.top_campaigns.map(item => ({ ...item, metrics:financialTrustModule.applyBidGuideGate(item.metrics, financialTrust) }));
  const coverage = engine.dataCoverage({ start, end, trafficDates: (trafficResult.data || []).map(item => item.date), adDates: (statsResult.data || []).map(item => item.date), minimumRate:thresholds.minimum_data_coverage_percent });
  return { cafe24, naver, coupang, coverage, contribution, financialTrust };
}

async function keywordAnalysis(db) {
  const period = await db.from('naver_keyword_stats').select('period_start,period_end').order('period_end', { ascending: false }).limit(1).maybeSingle();
  if (period.error) throw period.error;
  if (!period.data) return { period: null, growth: [], waste: [], waste_cost: 0 };
  const fields = 'ncc_keyword_id,keyword,campaign_type,impressions,clicks,cost,conversions,conversion_revenue,roas,ctr';
  const [growth, waste] = await Promise.all([
    db.from('naver_keyword_stats').select(fields).eq('period_start', period.data.period_start).eq('period_end', period.data.period_end).order('conversion_revenue', { ascending: false }).limit(10),
    db.from('naver_keyword_stats').select(fields).eq('period_start', period.data.period_start).eq('period_end', period.data.period_end).eq('conversion_revenue', 0).gt('cost', 0).order('cost', { ascending: false }).limit(10)
  ]);
  if (growth.error || waste.error) throw (growth.error || waste.error);
  const days = engine.periodDays(period.data.period_start, period.data.period_end);
  const decorate = item => ({ ...item, classification: item.keyword === '-' ? 'AUTOMATIC_NO_KEYWORD' : 'REGISTERED_KEYWORD', confidence: engine.sampleConfidence({ clicks: item.clicks, conversions: item.conversions, days }) });
  return { period: period.data, growth: (growth.data || []).filter(item => num(item.conversion_revenue) > 0).map(decorate), waste: (waste.data || []).map(decorate), waste_cost: (waste.data || []).reduce((sum, item) => sum + num(item.cost), 0) };
}

function comparison(current, previous) {
  return {
    cafe24_revenue: { current: current.cafe24.revenue, previous: previous.cafe24.revenue, change_rate: change(current.cafe24.revenue, previous.cafe24.revenue) },
    cafe24_orders: { current: current.cafe24.orders, previous: previous.cafe24.orders, change_rate: change(current.cafe24.orders, previous.cafe24.orders) },
    cafe24_visitors: { current: current.cafe24.visitors, previous: previous.cafe24.visitors, change_rate: change(current.cafe24.visitors, previous.cafe24.visitors) },
    cafe24_conversion: { current: current.cafe24.conversion_rate, previous: previous.cafe24.conversion_rate, change_rate: change(current.cafe24.conversion_rate, previous.cafe24.conversion_rate) },
    naver_spend: { current: current.naver.ad_spend, previous: previous.naver.ad_spend, change_rate: change(current.naver.ad_spend, previous.naver.ad_spend) },
    naver_revenue: { current: current.naver.revenue, previous: previous.naver.revenue, change_rate: change(current.naver.revenue, previous.naver.revenue) },
    naver_roas: { current: current.naver.roas, previous: previous.naver.roas, change_rate: change(current.naver.roas, previous.naver.roas) },
    naver_cpc: { current: current.naver.cpc, previous: previous.naver.cpc, change_rate: change(current.naver.cpc, previous.naver.cpc) },
    naver_cvr: { current: current.naver.cvr, previous: previous.naver.cvr, change_rate: change(current.naver.cvr, previous.naver.cvr) },
    naver_cpa: { current: current.naver.cpa, previous: previous.naver.cpa, change_rate: change(current.naver.cpa, previous.naver.cpa) },
    coupang_sales: { current: current.coupang.gross_sales, previous: previous.coupang.gross_sales, change_rate: change(current.coupang.gross_sales, previous.coupang.gross_sales) },
    coupang_orders: { current: current.coupang.orders, previous: previous.coupang.orders, change_rate: change(current.coupang.orders, previous.coupang.orders) },
    coupang_settlement: { current: current.coupang.settlement_amount, previous: previous.coupang.settlement_amount, change_rate: change(current.coupang.settlement_amount, previous.coupang.settlement_amount) },
    coupang_ad_spend: { current: current.coupang.ad_spend, previous: previous.coupang.ad_spend, change_rate: change(current.coupang.ad_spend, previous.coupang.ad_spend) },
    coupang_ad_revenue: { current: current.coupang.ad_revenue, previous: previous.coupang.ad_revenue, change_rate: change(current.coupang.ad_revenue, previous.coupang.ad_revenue) },
    coupang_ad_roas: { current: current.coupang.ad_roas, previous: previous.coupang.ad_roas, change_rate: change(current.coupang.ad_roas, previous.coupang.ad_roas) },
    coupang_ad_cpc: { current: current.coupang.ad_cpc, previous: previous.coupang.ad_cpc, change_rate: change(current.coupang.ad_cpc, previous.coupang.ad_cpc) },
    coupang_ad_cvr: { current: current.coupang.ad_cvr, previous: previous.coupang.ad_cvr, change_rate: change(current.coupang.ad_cvr, previous.coupang.ad_cvr) },
    coupang_ad_cpa: { current: current.coupang.ad_cpa, previous: previous.coupang.ad_cpa, change_rate: change(current.coupang.ad_cpa, previous.coupang.ad_cpa) }
  };
}

function diagnostics(cafe24, naver, keywords, compare, platform, guard, coverage, contribution = {}, coupang = {}, thresholds) {
  const rows = [];
  const targetRoas=Number(thresholds.target_roas_percent);
  const conversionWarning=Number(thresholds.conversion_rate_warning_percent);
  const changeWarning=Number(thresholds.change_warning_percent);
  const minimumCostCoverage=Number(thresholds.minimum_cost_coverage_percent);
  if (!guard.safe) rows.push({ level: 'warning', area: 'COMPARISON', title: '단순 전기 비교 주의', body: guard.message });
  if (['ALL', 'CAFE24'].includes(platform)) {
    rows.push(...(cafe24?.analytics?.findings || []));
    if (!cafe24?.orders) rows.push({ level: 'warning', area: 'CAFE24', title: '주문 데이터 없음', body: '선택 기간에 Cafe24 주문이 없습니다. 기간과 수집 상태를 확인하세요.' });
    else rows.push({ level: 'good', area: 'CAFE24', title: '순매출 데이터 확인', body: `${cafe24.orders}건, 환불·취소 차감 후 ${won(cafe24.net_revenue)}입니다.` });
    if (cafe24?.visitors && cafe24.conversion_rate < conversionWarning) rows.push({ level: 'warning', area: 'CAFE24', title: '구매 전환율 개선 필요', body: `방문 대비 주문 전환율이 ${cafe24.conversion_rate.toFixed(1)}%로 관리기준 ${conversionWarning}% 미만입니다.` });
    if (coverage?.cafe24_traffic?.status !== 'OK') rows.push({ level: 'warning', area: 'DATA', title: 'Cafe24 트래픽 기간 불완전', body: `${coverage.cafe24_traffic.actual_days}/${coverage.cafe24_traffic.expected_days}일만 수집되어 방문·전환율 해석에 주의가 필요합니다.` });
    if (contribution.cost_status === 'COST_DATA_REQUIRED') rows.push({ level: 'warning', area: 'PROFIT', title: '상품 원가 입력 필요', body: '판매된 상품의 원가가 없어 공헌이익과 손익분기 ROAS를 확정하지 않았습니다.' });
    else if (contribution.cost_status === 'PARTIAL' || num(contribution.cost_coverage_rate)<minimumCostCoverage) rows.push({ level: 'warning', area: 'PROFIT', title: '상품 원가 일부 입력', body: `매출의 ${num(contribution.cost_coverage_rate).toFixed(1)}%만 원가가 입력되어 관리기준 ${minimumCostCoverage}%에 미달하며 공헌이익은 참고값입니다.` });
    else rows.push({ level: contribution.contribution_profit >= 0 ? 'good' : 'danger', area: 'PROFIT', title: contribution.contribution_profit >= 0 ? '광고비 차감 후 공헌이익 확보' : '광고비 차감 후 공헌손실', body: `원가·수수료·배송비·광고비 차감 후 ${won(contribution.contribution_profit)}이며 손익분기 ROAS는 ${num(contribution.break_even_roas).toFixed(1)}%입니다.` });
  }
  if (['ALL', 'NAVER'].includes(platform)) {
    if (!naver?.connected) rows.push({ level: 'warning', area: 'NAVER', title: '네이버 성과 없음', body: '선택 기간의 네이버 광고 성과가 없습니다.' });
    else if (naver.roas < targetRoas) rows.push({ level: naver.confidence.level === 'LOW' ? 'warning' : 'danger', area: 'NAVER', title: '네이버 Paid ROAS 목표 미달', body: `Paid ROAS ${naver.roas.toFixed(1)}%, 목표 ${targetRoas}%, 표본 신뢰도 ${naver.confidence.label}입니다.` });
    else rows.push({ level: 'good', area: 'NAVER', title: '네이버 Paid ROAS 목표 달성', body: `Paid ROAS ${naver.roas.toFixed(1)}%, 표본 신뢰도 ${naver.confidence.label}입니다.` });
    const limited = (naver?.top_campaigns || []).filter(item => item.learning?.status === 'LIMITED');
    if (limited.length) rows.push({ level: 'warning', area: 'ADVOOST', title: 'ADVoost 학습 데이터 부족', body: `${limited.length}개 캠페인은 최근 기간 구매완료 30건 미만으로 예산 증액·중단 판단을 보류합니다.` });
    if (keywords.waste.length) rows.push({ level: 'warning', area: 'KEYWORD', title: '무전환 비용 발견', body: `${keywords.waste.length}개 항목에서 ${won(keywords.waste_cost)}가 발생했습니다. 신뢰도 낮음 항목은 자동 중단하지 않습니다.` });
    if (compare.naver_roas.change_rate != null) {
      const significant=Math.abs(compare.naver_roas.change_rate)>=changeWarning;
      rows.push({ level: significant?(compare.naver_roas.change_rate >= 0 ? 'good' : 'warning'):'info', area: 'TREND', title: significant?'Paid ROAS 유의 변화':'Paid ROAS 변동 안정', body: `직전 기간보다 ${Math.abs(compare.naver_roas.change_rate).toFixed(1)}% ${compare.naver_roas.change_rate >= 0 ? '개선' : '하락'}해 감지기준 ${changeWarning}%${significant?'을 넘었습니다':' 이내입니다'}.${guard.safe ? '' : ' 단, 변경 이벤트를 함께 확인하세요.'}` });
    }
  }
  if (['ALL', 'COUPANG'].includes(platform)) {
    if (!coupang.connected) rows.push({ level: 'warning', area: 'COUPANG', title: '쿠팡 기간 데이터 없음', body: '선택 기간에 쿠팡 주문 또는 정산 데이터가 없습니다. WING 파일을 가져와주세요.' });
    else rows.push({ level: 'good', area: 'COUPANG', title: '쿠팡 판매 데이터 확인', body: `쿠팡 주문 ${coupang.orders}건, 주문총액 ${won(coupang.gross_sales)}, 정산액 ${won(coupang.settlement_amount)}입니다.` });
  }
  if(['ALL','COUPANG'].includes(platform)&&coupang.ads?.connected)rows.push({level:coupang.ad_roas>=targetRoas?'good':'warning',area:'COUPANG_ADS',title:coupang.ad_roas>=targetRoas?'쿠팡 광고 ROAS 양호':'쿠팡 광고 ROAS 개선 필요',body:`광고비 ${won(coupang.ad_spend)}, 14일 전환매출 ${won(coupang.ad_revenue)}, ROAS ${num(coupang.ad_roas).toFixed(1)}%, 목표 ${targetRoas}%입니다.`});
  if(['ALL','COUPANG'].includes(platform)&&coupang.waste_keywords?.length)rows.push({level:'warning',area:'COUPANG_KEYWORD',title:'쿠팡 무전환 키워드 발견',body:`광고비를 사용했지만 14일 전환매출이 없는 키워드 ${coupang.waste_keywords.length}개를 점검하세요.`});
  return rows;
}

function recommendations(cafe24, naver, keywords, coupang, thresholds) {
  const rows = [];
  const targetRoas=Number(thresholds.target_roas_percent);
  const conversionWarning=Number(thresholds.conversion_rate_warning_percent);
  rows.push(...(cafe24?.analytics?.recommendations || []));
  if (naver?.roas < targetRoas && naver?.connected) rows.push({ priority: naver.confidence.level === 'LOW' ? 'MEDIUM' : 'HIGH', area: 'NAVER', title: naver.confidence.level === 'LOW' ? '데이터 추가 관찰' : '저효율 캠페인 예산 재배분', reason: `Paid ROAS가 목표 ${targetRoas}% 미만이며 표본 신뢰도는 ${naver.confidence.label}입니다.`, expected: naver.confidence.level === 'LOW' ? '성급한 중단 방지' : '낭비 광고비 축소' });
  const reliableWaste = keywords.waste.filter(item => item.confidence?.level !== 'LOW');
  if (reliableWaste.length) rows.push({ priority: 'HIGH', area: 'KEYWORD', title: '신뢰 표본 무전환 항목 입찰 검토', reason: `${reliableWaste.length}개 항목은 판단 가능한 표본에서 전환이 없습니다.`, expected: '무전환 클릭비용 절감' });
  if (cafe24?.visitors && cafe24.conversion_rate < conversionWarning) rows.push({ priority: 'MEDIUM', area: 'CAFE24', title: '상품 상세·구매 동선 점검', reason: `구매 전환율이 ${cafe24.conversion_rate.toFixed(1)}%로 기준 ${conversionWarning}% 미만입니다.`, expected: '방문 대비 주문 전환율 상승' });
  if (keywords.growth.length) rows.push({ priority: 'MEDIUM', area: 'KEYWORD', title: '성장 키워드 노출 유지', reason: '전환매출이 확인된 검색어가 있습니다.', expected: '효율 검증 검색수요 유지' });
  if(coupang?.waste_keywords?.length)rows.push({priority:'HIGH',area:'COUPANG_KEYWORD',title:'쿠팡 무전환 키워드 감액 검토',reason:`14일 전환매출 0원 키워드 ${coupang.waste_keywords.length}개가 광고비를 사용했습니다.`,expected:'쿠팡 무전환 광고비 절감'});
  if(coupang?.ads?.connected&&coupang.ad_roas<targetRoas)rows.push({priority:'HIGH',area:'COUPANG_ADS',title:'쿠팡 저효율 캠페인 예산 재배분',reason:`쿠팡 광고 ROAS가 ${num(coupang.ad_roas).toFixed(1)}%로 관리기준 ${targetRoas}% 미만입니다.`,expected:'쿠팡 광고 ROAS 개선'});
  return rows;
}

function score(cafe24, naver, keywords, platform, coverage, coupang = {}, thresholds) {
  let value = 100;
  if (['ALL', 'CAFE24'].includes(platform)) { if (!cafe24?.orders) value -= 15; if (coverage?.cafe24_traffic?.status !== 'OK') value -= 10; if (cafe24?.visitors && cafe24.conversion_rate < Number(thresholds.conversion_rate_warning_percent)) value -= 10; }
  if (['ALL', 'NAVER'].includes(platform)) { if (!naver?.connected) value -= 20; else if (naver.roas < Number(thresholds.target_roas_percent)) value -= 20; if (keywords.waste.length) value -= 10; }
  if (['ALL', 'COUPANG'].includes(platform) && !coupang.connected) value -= 15;
  return Math.max(0, value);
}

function reportHtml(title, summary) {
  const metric = (label, value) => `<div class="metric"><small>${label}</small><b>${value}</b></div>`;
  const campaignRows = (summary.naver?.top_campaigns || []).map(item => `<tr><td>${item.name}</td><td>${item.category}</td><td>${won(item.cost)}</td><td>${item.roas.toFixed(1)}%</td><td>${item.confidence.label}</td></tr>`).join('');
  const eventRows = (summary.platform_events || []).map(item => `<li><b>${item.effective_date} · ${item.title}</b> — ${item.analysis_impact || item.description || ''}</li>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;max-width:980px;margin:40px auto;color:#202033}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{background:#f5f6f8;border-radius:12px;padding:15px}.metric small,.metric b{display:block}.finding{padding:12px;border-radius:10px;background:#fff7ea;margin:8px 0}.good{background:#ecfbf3}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left}</style></head><body><h1>${title}</h1><p>${summary.period.start} ~ ${summary.period.end} · 서버 자동 계산</p><div class="grid">${metric('Cafe24 순매출', won(summary.profitability?.net_sales))}${metric('Paid ROAS', `${num(summary.profitability?.paid_roas).toFixed(1)}%`)}${metric('MER', `${num(summary.profitability?.mer).toFixed(1)}%`)}${metric('주문', `${summary.cafe24?.orders || 0}건`)}</div><h2>비교 주의 이벤트</h2><ul>${eventRows || '<li>주요 변경 이벤트 없음</li>'}</ul><h2>핵심 진단</h2>${summary.insights.map(item => `<div class="finding ${item.level}"><b>${item.title}</b><br>${item.body}</div>`).join('')}<h2>네이버 캠페인</h2><table><tr><th>캠페인</th><th>유형</th><th>광고비</th><th>ROAS</th><th>신뢰도</th></tr>${campaignRows}</table><h2>권고사항</h2><ol>${summary.recommendations.map(item => `<li><b>${item.title}</b> — ${item.reason}</li>`).join('')}</ol></body></html>`;
}

async function createActions(db, summary, platform) {
  const rows = [], end = summary.period.end;
  const thresholds=summary.operating_rule?.thresholds||operatingRuleModule.effectiveReportThresholds();
  if (['ALL', 'CAFE24'].includes(platform) && summary.cafe24?.visitors && summary.cafe24.conversion_rate < Number(thresholds.conversion_rate_warning_percent)) rows.push({ platform: 'CAFE24', target_type: 'STORE', target_id: 'CAFE24_STORE', target_name: '구매 전환율', action_type: 'REVIEW_CONVERSION', reason: `전환율 ${summary.cafe24.conversion_rate.toFixed(1)}%, 관리기준 ${thresholds.conversion_rate_warning_percent}% 미만`, status: 'PLANNED', priority: 'MEDIUM', review_after: end });
  if (['ALL', 'NAVER'].includes(platform) && summary.naver?.connected && summary.naver.ad_spend && summary.naver.roas < Number(thresholds.target_roas_percent)) rows.push({ platform: 'NAVER', target_type: 'ACCOUNT', target_id: 'NAVER_ACCOUNT', target_name: '광고 Paid ROAS', action_type: summary.naver.confidence.level === 'LOW' ? 'COLLECT_MORE_DATA' : 'OPTIMIZE_ROAS', reason: `Paid ROAS ${summary.naver.roas.toFixed(1)}%, 목표 ${thresholds.target_roas_percent}%, 표본 신뢰도 ${summary.naver.confidence.label}`, status: 'PLANNED', priority: summary.naver.confidence.level === 'LOW' ? 'MEDIUM' : 'HIGH', review_after: end });
  if (['ALL', 'NAVER'].includes(platform)) for (const item of (summary.keywords?.waste || []).filter(row => row.confidence?.level !== 'LOW').slice(0, 5)) rows.push({ platform: 'NAVER', target_type: 'KEYWORD', target_id: item.ncc_keyword_id, target_name: item.keyword === '-' ? '자동/무키워드 항목' : item.keyword, action_type: 'LOWER_BID', reason: `광고비 ${won(item.cost)}, 전환매출 0원, 신뢰도 ${item.confidence.label}`, status: 'PLANNED', priority: 'HIGH', review_after: end, before_value: { cost: item.cost, clicks: item.clicks, conversions: item.conversions, roas: item.roas } });
  let created = 0;
  for (const item of rows) {
    const found = await db.from('actions').select('id').eq('platform', item.platform).eq('target_type', item.target_type).eq('target_id', item.target_id).eq('action_type', item.action_type).eq('status', 'PLANNED').limit(1).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) { const result = await db.from('actions').insert(item); if (result.error) throw result.error; created += 1; }
  }
  return created;
}

async function syncAnomalyAlerts(db, anomalies, platform, reportId, resolveMissing) {
  const platforms = platform === 'ALL' ? ['NAVER','CAFE24','COUPANG'] : [platform];
  const found = await db.from('alerts').select('id,fingerprint,platform').eq('source_type','ANOMALY').eq('status','OPEN').in('platform',platforms);
  if (found.error) throw found.error;
  const existing = found.data || [], active = new Set(anomalies.map(item => item.fingerprint));
  let created = 0, resolved = 0, alerts = [];
  for (const anomaly of anomalies) {
    if (existing.some(item => item.fingerprint === anomaly.fingerprint)) continue;
    const inserted = await db.from('alerts').insert({ source_type:'ANOMALY', source_id:reportId, platform:anomaly.platform, severity:anomaly.severity, title:anomaly.title, message:`${anomaly.message} ${anomaly.recommended_action}`, fingerprint:anomaly.fingerprint, status:'OPEN' }).select('id,platform,severity,title,message,fingerprint').single();
    if (inserted.error && inserted.error.code !== '23505') throw inserted.error;
    if (!inserted.error) { created += 1; alerts.push(inserted.data); }
  }
  if (resolveMissing) for (const item of existing.filter(row => !active.has(row.fingerprint))) {
    const updated = await db.from('alerts').update({ status:'RESOLVED', resolved_at:new Date().toISOString() }).eq('id',item.id);
    if (updated.error) throw updated.error;
    resolved += 1;
  }
  return { created, resolved, alerts };
}

async function generateReport(options = {}) {
  const db = supabase.getSupabase(), period = options.period || previousWeek(options.now), platform = String(options.platform || 'ALL').toUpperCase(), reportType = String(options.reportType || 'WEEKLY').toUpperCase(), mode = options.mode || 'SCHEDULED';
  if (!['ALL', 'NAVER', 'CAFE24', 'COUPANG'].includes(platform)) throw new Error('지원하지 않는 플랫폼입니다.');
  const existing = await db.from('reports').select('id,title,status,version,is_latest').eq('platform', platform).eq('report_type', reportType).eq('period_start', period.start).eq('period_end', period.end).eq('is_latest', true).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && options.deduplicate !== false) return { created: false, report: existing.data, actions_created: 0, period };
  const operatingRuleSet=await operatingRuleModule.loadOperatingRuleSet(db,{historyLimit:4});
  const configuredThresholds=operatingRuleModule.effectiveReportThresholds(operatingRuleSet);
  const defaultThresholds=operatingRuleModule.effectiveReportThresholds(operatingRuleModule.buildOperatingRuleSet([]));
  const thresholds=configuredThresholds.enabled?configuredThresholds:Object.freeze({...defaultThresholds,enabled:false,versions:configuredThresholds.versions});
  const previousPeriod = priorPeriod(period);
  const [current, previous, keywords, eventResult, bidEvaluationResult] = await Promise.all([
    periodSummary(db, period.start, period.end, thresholds), periodSummary(db, previousPeriod.start, previousPeriod.end, thresholds), keywordAnalysis(db),
    db.from('platform_events').select('id,platform,event_type,effective_date,title,description,analysis_impact,source_url,affects_comparison').in('platform', platform === 'ALL' ? ['ALL', 'NAVER', 'CAFE24', 'COUPANG'] : ['ALL', platform]).gte('effective_date', previousPeriod.start).lte('effective_date', period.end).order('effective_date'),
    db.from('naver_bid_performance_evaluations').select('checkpoint_days,data_status,outcome,decision,evaluation_end').gte('evaluation_end',period.start).lte('evaluation_end',period.end)
  ]);
  if (eventResult.error) throw eventResult.error;
  // Learning history is an enhancement. A missing evaluation table or a
  // temporary query failure must never stop the operational report itself.
  if (bidEvaluationResult.error) console.error('[reports] bid evaluation history unavailable', bidEvaluationResult.error.message || bidEvaluationResult.error);
  const compare = comparison(current, previous), guard = engine.comparisonGuard(eventResult.data || []);
  const cafe24 = ['ALL', 'CAFE24'].includes(platform) ? current.cafe24 : null, naver = ['ALL', 'NAVER'].includes(platform) ? current.naver : null, coupang = ['ALL', 'COUPANG'].includes(platform) ? current.coupang : null;
  const selectedKeywords = ['ALL', 'NAVER'].includes(platform) ? keywords : { period: null, growth: [], waste: [], waste_cost: 0 };
  const anomalies = anomalyDetector.detectAnomalies({ comparison:compare, coverage:current.coverage, thresholds, platform, comparisonSafe:guard.safe });
  const diagnosticRows = [...anomalies.map(anomalyDetector.toInsight), ...diagnostics(cafe24, naver, selectedKeywords, compare, platform, guard, current.coverage, current.contribution, coupang, thresholds)];
  const recommendationRows = [...anomalies.map(anomalyDetector.toRecommendation), ...recommendations(cafe24, naver, selectedKeywords, coupang, thresholds)];
  const baseProfitability=engine.profitability({ cafe24:cafe24||{}, naver:naver||{} });
  const contribution=current.contribution||{};
  const summary = { generated_at: new Date().toISOString(), generation_mode: mode, period, previous_period: previousPeriod, operating_rule:{source:configuredThresholds.enabled?'SAVED':'DEFAULT_FALLBACK',versions:thresholds.versions,thresholds}, score: score(cafe24, naver, selectedKeywords, platform, current.coverage, coupang, thresholds), cafe24, naver, coupang, keywords: selectedKeywords, comparison: compare, comparison_guard: guard, platform_events: eventResult.data || [], data_coverage: current.coverage, financial_trust:current.financialTrust, anomalies, profitability: { ...baseProfitability, ...contribution, net_sales:baseProfitability.net_sales, paid_roas:baseProfitability.paid_roas, mer:baseProfitability.mer }, insights: diagnosticRows, recommendations: recommendationRows };
  summary.learning = learningHistoryModule.buildLearningSnapshot({summary,reportType,mode,bidEvaluations:bidEvaluationResult.error?[]:(bidEvaluationResult.data||[])});
  summary.executive_summary = diagnosticRows.slice(0, 4).map(item => item.body);
  summary.executive = { doing_well: diagnosticRows.filter(item => item.level === 'good').slice(0, 3), problems: diagnosticRows.filter(item => ['warning', 'danger'].includes(item.level)).slice(0, 3), opportunities: recommendationRows.slice(0, 3), today_actions: recommendationRows.slice(0, 3).map((item, index) => ({ ...item, rank: index + 1 })) };
  const labels = { ALL: '통합', NAVER: '네이버', CAFE24: 'Cafe24', COUPANG: '쿠팡' }, types = { WEEKLY: '주간', MONTHLY: '월간', ADHOC: '수시' };
  const title = `${labels[platform]} ${types[reportType] || reportType} 자동진단 (${period.start}~${period.end})`;
  const safeLabels = { ALL: '통합', NAVER: '네이버', CAFE24: 'Cafe24', COUPANG: '쿠팡' }, safeTypes = { WEEKLY: '주간', MONTHLY: '월간', ADHOC: '수시' };
  const safeTitle = `${safeLabels[platform]} ${safeTypes[reportType] || reportType} 자동진단 (${period.start}~${period.end})`;
  const revisionNote = options.revisionNote || (mode.includes('MANUAL') ? '수동 생성·재생성' : '자동 스케줄 생성');
  const inserted = await db.rpc('create_report_version', {
    p_platform:platform, p_report_type:reportType, p_period_start:period.start, p_period_end:period.end,
    p_title:safeTitle, p_status:'FINAL', p_summary_json:summary, p_report_html:null, p_revision_note:revisionNote
  });
  if (inserted.error) throw inserted.error;
  const reportRow = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
  const renderedHtml = presentation.fullHtml({...reportRow,summary_json:summary});
  const htmlUpdate = await db.from('reports').update({report_html:renderedHtml}).eq('id',reportRow.id);
  if (htmlUpdate.error) throw htmlUpdate.error;
  const actionsCreated = await createActions(db, summary, platform);
  const coverageReady = (platform === 'ALL' || platform === 'NAVER' ? current.coverage?.naver_ads?.status === 'OK' : true) && (platform === 'ALL' || platform === 'CAFE24' ? current.coverage?.cafe24_traffic?.status === 'OK' : true);
  const alertResult = await syncAnomalyAlerts(db, anomalies, platform, reportRow.id, guard.safe && coverageReady);
  let alert_delivery = null;
  if (alertResult.alerts.length) alert_delivery = await notificationService.deliverAlerts(alertResult.alerts,{db,triggerType:mode.includes('AUTO')||mode==='SCHEDULED'?'CRON':'MANUAL'}).catch(error=>({status:'FAILED',error:error.message}));
  return { created: true, report: reportRow, actions_created: actionsCreated, alerts_created:alertResult.created, alerts_resolved:alertResult.resolved, alert_delivery, period, summary };
}

async function generateWeekly(options = {}) {
  const period=options.period||previousWeek(options.now),platforms=['ALL','NAVER','CAFE24','COUPANG'];
  const settled=await Promise.allSettled(platforms.map(platform=>generateReport({...options,period,platform,reportType:'WEEKLY',mode:'SCHEDULED'})));
  const reports=settled.map((result,index)=>result.status==='fulfilled'?{platform:platforms[index],ok:true,...result.value}:{platform:platforms[index],ok:false,error:result.reason?.message||'보고서 생성 실패'});
  if(reports.every(item=>!item.ok))throw new Error(reports.map(item=>`${item.platform}: ${item.error}`).join(' / '));
  const allReport=reports.find(item=>item.platform==='ALL'&&item.ok)?.report;
  const delivery=allReport?await notificationService.deliverReport(allReport.id,{cadence:'WEEKLY',triggerType:options.triggerType||'CRON'}).catch(error=>({status:'FAILED',error:error.message})):null;
  return {period,reports,delivery,ok:reports.every(item=>item.ok)};
}

module.exports = { previousWeek, priorPeriod, generateReport, generateWeekly };
