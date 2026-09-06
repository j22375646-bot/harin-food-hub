'use strict';

const client = require('./client.js');
const { storeOrders } = require('./sync.js');
const { seoulDateKey } = require('../analytics/financial-date.js');

const DAY_MS = 86_400_000;
const ENDPOINT = '/v1/pay-order/seller/product-orders';
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function invalid(code, message) { return Object.assign(new Error(message), {code}); }
const identifier = value => typeof value === 'string' ? value.trim() : '';

function periodDates(start, end, now) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  const span = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  if (!valid(start) || !valid(end) || !Number.isFinite(now?.getTime()) || start > end
    || span >= 31 * DAY_MS || end >= seoulDateKey(now.toISOString())) {
    throw invalid('NAVER_PAYMENT_PERIOD_INVALID','완료된 KST 날짜로 1~31일의 네이버 결제기간을 지정해야 합니다.');
  }
  return Array.from({length:span / DAY_MS + 1},(_,index) => new Date(Date.parse(`${start}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0,10));
}

function pageDetails(result, page, date, seen) {
  const payload = result?.data?.data;
  const pagination = payload?.pagination;
  if (result?.status !== 200 || typeof result?.data?.traceId !== 'string' || !result.data.traceId.trim() || !Array.isArray(payload?.contents)
    || pagination?.page !== page || pagination?.size !== 300 || typeof pagination?.hasNext !== 'boolean'
    || payload.contents.length > 300 || (pagination.hasNext && payload.contents.length !== 300)
    || (page > 1 && payload.contents.length === 0)) {
    throw invalid('NAVER_PAYMENT_PAGE_INVALID', '네이버 결제기간 응답 또는 페이지 정보가 불완전합니다.');
  }
  return payload.contents.map(row => {
    const order = row?.content?.order;
    const product = row?.content?.productOrder;
    const id = identifier(row?.productOrderId);
    const orderId = identifier(order?.orderId);
    const productId = identifier(product?.productId);
    const amount = product?.remainPaymentAmount ?? product?.totalPaymentAmount ?? product?.initialPaymentAmount;
    const quantity = product?.remainQuantity ?? product?.quantity;
    if (!id || identifier(product?.productOrderId) !== id || !orderId || !productId
      || !product.productOrderStatus || !Number.isFinite(Date.parse(order.paymentDate))
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(order.paymentDate) || seoulDateKey(order.paymentDate) !== date
      || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0
      || !Number.isInteger(quantity) || quantity < 0 || seen.has(id)) {
      throw invalid('NAVER_PAYMENT_DETAIL_INVALID', '네이버 결제기간 주문 상세가 누락되거나 중복되었습니다.');
    }
    seen.add(id);
    return {...row.content,order:{...order,orderId},productOrder:{...product,productOrderId:id,productId}};
  });
}

async function collectPaymentPeriod({ db, config = client.getConfig(), periodStart, periodEnd,
  now = new Date(), maxPagesPerRun = 20, maxDurationMs = 20_000,
  request = client.request, pause:wait = pause, clock = Date.now } = {}) {
  const dates = periodDates(periodStart,periodEnd,now);
  if (!Number.isInteger(maxPagesPerRun) || maxPagesPerRun < 1 || maxPagesPerRun > 100
    || !Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 20_000) {
    throw invalid('NAVER_PAYMENT_BUDGET_INVALID','네이버 결제기간 수집 예산은 1~100페이지, 최대 20초입니다.');
  }
  const deadline = clock() + maxDurationMs;
  const collectedAt = now.toISOString();
  const today = seoulDateKey(collectedAt);
  const recentStart = seoulDateKey(new Date(now.getTime() - 2 * DAY_MS).toISOString());
  const prior = await db.from('sync_logs').select('id,status,metadata').eq('platform','NAVER').eq('job_type','COMMERCE_PAYMENT_PERIOD').order('started_at',{ascending:false}).limit(100);
  if (prior.error) throw prior.error;
  const completed = new Map();
  for (const log of prior.data || []) {
    const checkpoint = log.metadata?.payment_collection;
    if (checkpoint?.version !== 1 || checkpoint.endpoint !== ENDPOINT || checkpoint.basis !== 'PAYMENT_DATE' || checkpoint.timezone !== 'Asia/Seoul') continue;
    for (const window of checkpoint.windows || []) {
      if (!dates.includes(window.date) || completed.has(window.date) || window.complete !== true
        || !Number.isInteger(window.product_orders) || window.product_orders < 0
        || !Number.isInteger(window.pages) || window.pages < 1
        || !Number.isFinite(Date.parse(window.collected_at)) || seoulDateKey(window.collected_at) <= window.date) continue;
      // Recheck the two most recent closed days once per KST day for delayed provider data.
      if (window.date >= recentStart && seoulDateKey(window.collected_at) !== today) continue;
      completed.set(window.date,window);
    }
  }
  const order_coverage = {status:'RUNNING',complete:false,closed:true,source:'NAVER_COMMERCE',basis:'PAYMENT_DATE',
    period_start:periodStart,period_end:periodEnd,collected_at:collectedAt,timezone:'Asia/Seoul',endpoint:ENDPOINT,
    provider_constraint:'ORDER_CREATED_WITHIN_180_DAYS_OF_FROM'};
  const payment_collection = {version:1,endpoint:ENDPOINT,basis:'PAYMENT_DATE',timezone:'Asia/Seoul',
    period_start:periodStart,period_end:periodEnd,windows:[...completed.values()]};
  const started = await db.from('sync_logs').insert({platform:'NAVER',job_type:'COMMERCE_PAYMENT_PERIOD',status:'RUNNING',
    metadata:{collection_mode:'PAYMENT_PERIOD',order_coverage,payment_collection}}).select('id').single();
  if (started.error) throw started.error;
  let pages = 0;
  const save = async (status, failure = null) => {
    payment_collection.windows = dates.filter(date => completed.has(date)).map(date => completed.get(date));
    payment_collection.next_date = dates.find(date => !completed.has(date)) || null;
    Object.assign(order_coverage,{status,complete:status === 'SUCCESS',pages_fetched:pages,
      windows_completed:completed.size,product_orders:payment_collection.windows.reduce((sum,window) => sum + window.product_orders,0),
      oldest_collected_at:payment_collection.windows.map(window => window.collected_at).sort()[0] || null});
    const metadata = {collection_mode:'PAYMENT_PERIOD',order_coverage,payment_collection,failure};
    const updated = await db.from('sync_logs').update({status:status === 'IN_PROGRESS' ? 'PARTIAL' : status,
      ...(status === 'RUNNING' ? {} : {finished_at:collectedAt}),rows_received:order_coverage.product_orders,
      error_message:failure?.message || null,metadata}).eq('id',started.data.id);
    if (updated.error) throw updated.error;
    return {status,syncLogId:started.data.id,order_coverage,payment_collection,failure};
  };
  const checkBudget = () => {
    if (pages >= maxPagesPerRun || clock() >= deadline) throw invalid('NAVER_PAYMENT_BUDGET_EXHAUSTED','네이버 결제기간 수집 예산을 소진하여 완료 날짜부터 다음 실행에서 재개합니다.');
  };
  try {
    for (const date of dates) {
      if (completed.has(date)) continue;
      const rows = [], seen = new Set();
      let windowPages = 0;
      // A partially traversed day is replayed from page 1, since provider pages are not snapshot cursors.
      for (let page = 1; ; page++) {
        checkBudget();
        const result = await request('GET',ENDPOINT,{config,maxAttempts:1,signal:AbortSignal.timeout(Math.max(1,deadline - clock())),
          query:{from:`${date}T00:00:00.000+09:00`,to:`${date}T23:59:59.999+09:00`,rangeType:'PAYED_DATETIME',pageSize:300,page,quantityClaimCompatibility:true}});
        pages++;
        rows.push(...pageDetails(result,page,date,seen));
        windowPages++;
        if (!result.data.data.pagination.hasNext) break;
        await wait(250);
      }
      const saved = await storeOrders(db,rows,collectedAt);
      if (saved.orderItems !== rows.length) {
        throw invalid('NAVER_PAYMENT_PERSISTENCE_INCOMPLETE','검증한 네이버 주문 상세 수와 저장한 상세 수가 일치하지 않습니다.');
      }
      completed.set(date,{date,complete:true,product_orders:saved.orderItems,pages:windowPages,collected_at:collectedAt});
      await save('RUNNING');
      if (date !== dates.at(-1)) await wait(250);
    }
    return await save('SUCCESS');
  } catch (error) {
    const budget = error.code === 'NAVER_PAYMENT_BUDGET_EXHAUSTED' || error.name === 'TimeoutError' || error.name === 'AbortError';
    const failure = {code:budget ? 'NAVER_PAYMENT_BUDGET_EXHAUSTED' : error.code || 'NAVER_PAYMENT_COLLECTION_FAILED',message:error.message};
    return await save(budget ? 'IN_PROGRESS' : 'FAILED',failure);
  }
}

function collectRecentPaymentPeriod({now = new Date(),days = 31,...options} = {}) {
  const count = Math.min(31,Math.max(1,Math.floor(Number(days) || 31)));
  const today = seoulDateKey(now.toISOString());
  const todayAt = Date.parse(`${today}T00:00:00+09:00`);
  return collectPaymentPeriod({...options,now,
    periodStart:seoulDateKey(new Date(todayAt - count * DAY_MS).toISOString()),
    periodEnd:seoulDateKey(new Date(todayAt - DAY_MS).toISOString())});
}

module.exports = { collectPaymentPeriod, collectRecentPaymentPeriod };
