'use strict';

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_SOURCE = 50000;
const SOURCE_SPECS = Object.freeze([
  Object.freeze({ key:'CAFE24', platform:'CAFE24', table:'cafe24_orders', dateField:'order_date', fields:'order_id,order_date,payment_status,paid_amount,order_price,cancel_amount,refund_amount,raw_data' }),
  Object.freeze({ key:'NAVER', platform:'NAVER', table:'naver_commerce_orders', dateField:'order_date', fields:'order_id,order_date,payment_date,status,paid_amount,shipment_id,invoice_no,delivery_company,updated_at' }),
  Object.freeze({ key:'COUPANG', platform:'COUPANG', table:'coupang_orders', dateField:'ordered_at', fields:'shipment_box_id,order_id,ordered_at,paid_at,status,gross_amount,raw_data' }),
  Object.freeze({ key:'COUPANG_RG', platform:'COUPANG', table:'coupang_rg_orders', dateField:'paid_at', fields:'order_id,status,paid_at,total_amount,item_count' })
]);

const number = value => Number(value || 0);
const upper = value => String(value || '').toUpperCase();

function monthWindow(month) {
  const value = String(month || '');
  if (!/^20\d{2}-\d{2}$/.test(value)) throw new Error('month must be YYYY-MM');
  const [year, monthNumber] = value.split('-').map(Number);
  const nextYear = year + (monthNumber === 12 ? 1 : 0);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    month:value,
    start:`${value}-01T00:00:00+09:00`,
    next:`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+09:00`
  };
}

function isTruthyFlag(value) {
  return value === true || ['T', 'TRUE', 'Y', 'YES', '1'].includes(upper(value));
}

function isCancelledStatus(value) {
  const status = upper(value);
  return ['CANCELLED', 'CANCELED', 'CANCELED_BY_NOPAYMENT', 'CANCEL_COMPLETE', 'CANCEL_COMPLETED', 'RETURNED', 'EXCHANGED'].includes(status)
    || /(?:^|_)(?:CANCEL|RETURN|EXCHANGE)(?:_|$)/.test(status);
}

function cafe24StoreOrder(order = {}) {
  const raw = order.raw_data || {};
  const market = upper(raw.market_id || raw.order_place_id);
  return !market || ['SELF', 'MOBILE', 'CAFE24'].includes(market);
}

function cafe24Cancelled(order = {}) {
  const raw = order.raw_data || {};
  return isTruthyFlag(raw.canceled) || Boolean(String(raw.cancel_date || '').trim()) || isCancelledStatus(order.payment_status);
}

function cafe24Revenue(order = {}) {
  if (!cafe24StoreOrder(order) || cafe24Cancelled(order)) return 0;
  const raw = order.raw_data || {};
  const gross = [
    order.paid_amount,
    order.order_price,
    raw.actual_payment_amount,
    raw.payment_amount,
    raw.actual_order_amount?.payment_amount,
    raw.actual_order_amount?.order_price
  ].map(number).find(value => value > 0) || 0;
  const adjustment = Math.max(number(order.cancel_amount), number(order.refund_amount));
  return Math.max(0, gross - adjustment);
}

function calculateMonthlyRevenue({
  cafe24Orders = [],
  naverOrders = [],
  coupangOrders = [],
  coupangRgOrders = [],
  availability = {}
} = {}) {
  const ready = {
    CAFE24:availability.CAFE24 !== false,
    NAVER:availability.NAVER !== false,
    COUPANG:availability.COUPANG !== false,
    COUPANG_RG:availability.COUPANG_RG !== false
  };
  const cafe24 = ready.CAFE24
    ? cafe24Orders.reduce((sum, order) => sum + cafe24Revenue(order), 0)
    : null;
  const naver = ready.NAVER
    ? naverOrders.filter(order => !isCancelledStatus(order.status)).reduce((sum, order) => sum + number(order.paid_amount), 0)
    : null;
  const rgIds = new Set(coupangRgOrders.map(order => String(order.order_id)));
  const seller = ready.COUPANG
    ? coupangOrders.filter(order => !rgIds.has(String(order.order_id)) && !isCancelledStatus(order.status)).reduce((sum, order) => sum + number(order.gross_amount), 0)
    : null;
  const rocketGrowth = ready.COUPANG_RG
    ? coupangRgOrders.filter(order => !isCancelledStatus(order.status)).reduce((sum, order) => sum + number(order.total_amount), 0)
    : null;
  const coupang = seller == null || rocketGrowth == null ? null : seller + rocketGrowth;
  const complete = cafe24 != null && naver != null && coupang != null;
  return {
    status:complete ? 'READY' : 'PARTIAL',
    totals:{
      CAFE24:cafe24,
      NAVER:naver,
      COUPANG:coupang,
      ALL:complete ? cafe24 + naver + coupang : null
    }
  };
}

async function fetchSourceRows(db, spec, window, { pageSize = PAGE_SIZE, maxRows = MAX_ROWS_PER_SOURCE } = {}) {
  const rows = [];
  let count = null;
  while (rows.length < maxRows) {
    const from = rows.length;
    const to = Math.min(maxRows, from + pageSize) - 1;
    const result = await db.from(spec.table)
      .select(spec.fields, from === 0 ? { count:'exact' } : undefined)
      .gte(spec.dateField, window.start)
      .lt(spec.dateField, window.next)
      .order(spec.dateField, { ascending:false })
      .range(from, to);
    if (result.error) throw result.error;
    if (from === 0 && Number.isFinite(result.count)) count = result.count;
    const page = result.data || [];
    rows.push(...page);
    if (!page.length || page.length < pageSize || (count != null && rows.length >= count)) break;
  }
  return { rows, count:count == null ? rows.length : count, truncated:count != null && rows.length < count };
}

async function fetchMonthlyRevenue(db, month, options = {}) {
  const window = monthWindow(month);
  const results = await Promise.allSettled(SOURCE_SPECS.map(spec => fetchSourceRows(db, spec, window, options)));
  const rows = { CAFE24:[], NAVER:[], COUPANG:[], COUPANG_RG:[] };
  const availability = {};
  const counts = {};
  const issues = [];
  SOURCE_SPECS.forEach((spec, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && !result.value.truncated) {
      rows[spec.key] = result.value.rows;
      counts[spec.key] = result.value.count;
      availability[spec.key] = true;
      return;
    }
    counts[spec.key] = result.status === 'fulfilled' ? result.value.count : null;
    availability[spec.key] = false;
    issues.push({
      platform:spec.platform,
      dataset:spec.table,
      code:result.status === 'fulfilled' ? 'MONTHLY_ROW_LIMIT' : 'MONTHLY_QUERY_FAILED',
      message:result.status === 'fulfilled' ? '월 주문량이 안전 조회 범위를 넘어 매출 합계를 확정하지 않았습니다.' : String(result.reason?.message || result.reason || '월 주문 조회 실패')
    });
  });
  const summary = calculateMonthlyRevenue({
    cafe24Orders:rows.CAFE24,
    naverOrders:rows.NAVER,
    coupangOrders:rows.COUPANG,
    coupangRgOrders:rows.COUPANG_RG,
    availability
  });
  return {
    ...summary, month:window.month, counts, issues,
    ...(options.includeSourceRows ? { sourceRows:rows } : {})
  };
}

module.exports = {
  MAX_ROWS_PER_SOURCE,
  PAGE_SIZE,
  calculateMonthlyRevenue,
  cafe24Revenue,
  fetchMonthlyRevenue,
  isCancelledStatus,
  monthWindow
};
