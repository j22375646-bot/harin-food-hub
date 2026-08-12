'use strict';

const num = value => Number(value || 0);
const dateOnly = value => String(value || '').slice(0, 10);

function orderAmount(order = {}) {
  return num(order.paid_amount ?? order.order_price ?? order.raw_data?.payment_amount ?? order.raw_data?.actual_order_amount?.payment_amount);
}

function sourceCategory(value) {
  const source = String(value || '').trim().toLowerCase();
  if (!source || source.includes('참조 도메인 없음') || source === 'direct' || source === '(direct)') return { key:'DIRECT', label:'직접·미식별 유입' };
  if (source.includes('shopping.naver')) return { key:'NAVER_SHOPPING', label:'네이버 쇼핑' };
  if (source.includes('naver')) return { key:'NAVER_SEARCH', label:'네이버 검색·서비스' };
  if (source.includes('google')) return { key:'GOOGLE', label:'구글' };
  if (source.includes('daum')) return { key:'DAUM', label:'다음' };
  return { key:'OTHER', label:'기타 추천·외부 유입' };
}

function dateRange(start, end) {
  if (!start || !end) return [];
  const rows = [], cursor = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && rows.length < 370) {
    rows.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function buildCafe24Analytics(options = {}) {
  const orders = options.orders || [], items = options.items || [], traffic = options.traffic || [], referrers = options.referrers || [];
  const history = options.customerHistory || orders;
  const dates = [...traffic.map(row => dateOnly(row.date)), ...orders.map(row => dateOnly(row.order_date))].filter(Boolean).sort();
  const start = options.start || dates[0] || null, end = options.end || dates.at(-1) || null;
  const currentOrderIds = new Set(orders.map(order => String(order.order_id)));
  const customerFirstDate = new Map(), customerOrderCount = new Map();
  for (const order of history) {
    const customerId = String(order.customer_id || '').trim();
    if (!customerId) continue;
    const day = dateOnly(order.order_date);
    if (!customerFirstDate.has(customerId) || day < customerFirstDate.get(customerId)) customerFirstDate.set(customerId, day);
    customerOrderCount.set(customerId, (customerOrderCount.get(customerId) || 0) + 1);
  }

  const customerIds = new Set(), newCustomers = new Set(), returningCustomers = new Set();
  let identifiedOrders = 0, identifiedRevenue = 0, anonymousRevenue = 0;
  for (const order of orders) {
    const customerId = String(order.customer_id || '').trim(), revenue = orderAmount(order);
    if (!customerId) { anonymousRevenue += revenue; continue; }
    identifiedOrders += 1; identifiedRevenue += revenue; customerIds.add(customerId);
    if (customerFirstDate.get(customerId) && customerFirstDate.get(customerId) < start) returningCustomers.add(customerId);
    else newCustomers.add(customerId);
  }
  const repeatPurchaseCustomers = [...customerIds].filter(id => (customerOrderCount.get(id) || 0) >= 2).length;

  const dailyMap = new Map(dateRange(start, end).map(date => [date, { date, visitors:0, pageviews:0, orders:0, revenue:0 }]));
  for (const row of traffic) {
    const day = dateOnly(row.date); if (!dailyMap.has(day)) dailyMap.set(day, { date:day, visitors:0, pageviews:0, orders:0, revenue:0 });
    const daily = dailyMap.get(day); daily.visitors += num(row.visitors); daily.pageviews += num(row.pageviews);
  }
  for (const order of orders) {
    const day = dateOnly(order.order_date); if (!dailyMap.has(day)) dailyMap.set(day, { date:day, visitors:0, pageviews:0, orders:0, revenue:0 });
    const daily = dailyMap.get(day); daily.orders += 1; daily.revenue += orderAmount(order);
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const visitors = traffic.reduce((sum, row) => sum + num(row.visitors), 0);
  const pageviews = traffic.reduce((sum, row) => sum + num(row.pageviews), 0);
  const revenue = orders.reduce((sum, row) => sum + orderAmount(row), 0);
  const sourceMap = new Map();
  for (const row of referrers) {
    const category = sourceCategory(row.source), current = sourceMap.get(category.key) || { ...category, visitors:0, orders:0, revenue:0, sources:0, orderAttribution:false, revenueAttribution:false };
    current.visitors += num(row.visitors); current.orders += num(row.orders); current.revenue += num(row.revenue); current.sources += 1;
    if (row.orders != null) current.orderAttribution = true;
    if (row.revenue != null) current.revenueAttribution = true;
    sourceMap.set(category.key, current);
  }
  const sourceVisitors = [...sourceMap.values()].reduce((sum, row) => sum + row.visitors, 0);
  const acquisition = [...sourceMap.values()].map(row => ({ ...row, share:sourceVisitors ? row.visitors / sourceVisitors * 100 : 0 })).sort((a, b) => b.visitors - a.visitors);
  const trafficDates = new Set(traffic.map(row => dateOnly(row.date)).filter(Boolean));
  const referrerDates = new Set(referrers.map(row => dateOnly(row.date)).filter(Boolean));
  const referrerCoverage = !referrers.length ? 'NOT_COLLECTED' : !referrerDates.size ? 'UNKNOWN_PERIOD' : referrerDates.size !== trafficDates.size || [...referrerDates].some(date => !trafficDates.has(date)) ? 'PERIOD_MISMATCH' : 'OK';

  const orderCustomer = new Map(orders.map(order => [String(order.order_id), String(order.customer_id || '').trim()]));
  const productMap = new Map();
  for (const item of items) {
    if (!currentOrderIds.has(String(item.order_id))) continue;
    const name = item.product_name || '상품명 없음';
    const row = productMap.get(name) || { name, quantity:0, revenue:0, orders:new Set(), customers:new Set(), returningCustomers:new Set() };
    const customerId = orderCustomer.get(String(item.order_id));
    row.quantity += num(item.quantity); row.revenue += num(item.paid_amount ?? num(item.unit_price) * num(item.quantity)); row.orders.add(String(item.order_id));
    if (customerId) { row.customers.add(customerId); if (returningCustomers.has(customerId)) row.returningCustomers.add(customerId); }
    productMap.set(name, row);
  }
  const products = [...productMap.values()].map(row => ({
    name:row.name, quantity:row.quantity, revenue:row.revenue, orders:row.orders.size, customers:row.customers.size,
    returningCustomers:row.returningCustomers.size, salesShare:revenue ? row.revenue / revenue * 100 : 0,
    averageOrderValue:row.orders.size ? row.revenue / row.orders.size : 0
  })).sort((a, b) => b.revenue - a.revenue);

  const trafficStatus = !traffic.length ? 'NOT_COLLECTED' : traffic.some(row => !['OK', undefined, null].includes(row.source_status || row.status)) ? 'PARTIAL' : 'OK';
  const ordersStatus = orders.length ? 'OK' : traffic.length ? 'REAL_ZERO' : 'NOT_COLLECTED';
  const funnel = {
    stages:[
      { key:'VISITORS', label:'방문자', value:visitors, status:trafficStatus },
      { key:'PAGEVIEWS', label:'페이지뷰', value:pageviews, status:trafficStatus },
      { key:'CARTS', label:'장바구니', value:null, status:'NOT_COLLECTED' },
      { key:'CHECKOUTS', label:'결제진입', value:null, status:'NOT_COLLECTED' },
      { key:'ORDERS', label:'결제주문', value:orders.length, status:ordersStatus }
    ],
    visitorToOrderRate:visitors ? orders.length / visitors * 100 : null,
    pageviewsPerVisit:visitors ? pageviews / visitors : null
  };
  const customers = {
    identifiedOrders, anonymousOrders:orders.length - identifiedOrders, identifiedCustomers:customerIds.size,
    newCustomers:newCustomers.size, returningCustomers:returningCustomers.size, repeatPurchaseCustomers,
    identifiedRate:orders.length ? identifiedOrders / orders.length * 100 : null,
    returningRate:customerIds.size ? returningCustomers.size / customerIds.size * 100 : null,
    identifiedRevenue, anonymousRevenue, historyStart:[...customerFirstDate.values()].sort()[0] || null,
    status:identifiedOrders ? 'PARTIAL' : 'NOT_COLLECTED'
  };

  const findings = [], recommendations = [];
  if (trafficStatus !== 'OK') findings.push({ level:'warning', area:'CAFE24_DATA', title:'트래픽 수집범위 확인 필요', body:'방문·페이지뷰 데이터가 없거나 일부 기간만 수집됐습니다. 전환율을 실제 0으로 해석하지 않습니다.' });
  if (visitors && orders.length / visitors * 100 < 2) findings.push({ level:'warning', area:'CAFE24_FUNNEL', title:'방문 대비 주문 전환 개선 필요', body:`방문→주문 전환율은 ${(orders.length / visitors * 100).toFixed(1)}%입니다.` });
  if (acquisition[0]?.key === 'DIRECT' && acquisition[0].share >= 60) {
    findings.push({ level:'warning', area:'CAFE24_ACQUISITION', title:'직접·미식별 유입 비중이 높음', body:`직접·미식별 유입이 ${acquisition[0].share.toFixed(1)}%로 채널 성과 귀속이 제한됩니다.` });
    recommendations.push({ priority:'MEDIUM', area:'CAFE24_ACQUISITION', title:'광고·콘텐츠 링크 UTM 표준화', reason:'직접·미식별 유입 비중이 높아 매출 기여 채널을 구분하기 어렵습니다.', expected:'유입경로별 전환·매출 판단 정확도 향상' });
  }
  if (orders.length && customers.identifiedRate < 60) {
    findings.push({ level:'warning', area:'CAFE24_CUSTOMER', title:'고객 식별률이 낮음', body:`주문의 ${customers.identifiedRate.toFixed(1)}%만 고객 단위 재구매 분석이 가능합니다.` });
    recommendations.push({ priority:'MEDIUM', area:'CAFE24_CUSTOMER', title:'회원전환 혜택 점검', reason:'비회원·미식별 주문이 많아 재구매 자동화 대상이 제한됩니다.', expected:'재구매 고객 식별과 CRM 대상 확대' });
  }
  if (customerIds.size >= 10 && customers.returningRate < 20) recommendations.push({ priority:'MEDIUM', area:'CAFE24_CUSTOMER', title:'첫 구매 후 재구매 캠페인', reason:`식별 고객 중 기존고객 비율이 ${customers.returningRate.toFixed(1)}%입니다.`, expected:'30일 내 재구매율 개선' });
  if (!acquisition.some(row => row.orderAttribution || row.revenueAttribution)) findings.push({ level:'warning', area:'CAFE24_DATA', title:'유입경로별 주문·매출 미수집', body:'현재 Analytics 응답은 방문자만 제공해 채널별 주문·매출은 미수집으로 표시합니다.' });
  if (referrerCoverage === 'PERIOD_MISMATCH') findings.push({ level:'warning', area:'CAFE24_DATA', title:'트래픽·유입경로 기간불일치', body:`트래픽 ${trafficDates.size}일과 유입경로 ${referrerDates.size}일의 수집범위가 달라 채널 비중은 유입경로 수집일만 기준으로 봐야 합니다.` });
  if (products[0]?.salesShare >= 50) findings.push({ level:'warning', area:'CAFE24_PRODUCT', title:'상위 상품 매출 집중', body:`1위 상품이 Cafe24 매출의 ${products[0].salesShare.toFixed(1)}%를 차지합니다.` });

  return {
    period:{ start, end }, acquisitionPeriod:{ start:[...referrerDates].sort()[0]||null, end:[...referrerDates].sort().at(-1)||null }, totals:{ revenue, orders:orders.length, visitors, pageviews }, daily, funnel, acquisition, products,
    customers, findings, recommendations,
    coverage:{ traffic:trafficStatus, orders:ordersStatus, referrers:referrerCoverage, referrerAttribution:acquisition.some(row => row.orderAttribution || row.revenueAttribution) ? 'PARTIAL' : 'NOT_COLLECTED', customer:customers.status }
  };
}

module.exports = { buildCafe24Analytics, sourceCategory, orderAmount };
