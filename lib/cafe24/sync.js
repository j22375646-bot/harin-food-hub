'use strict';

const { adminGet, analyticsGet } = require('./client');
const { db, insertRaw, startSync, finishSync } = require('./supabase');
const map = require('./mappers');

const isoDate = d => d.toISOString().slice(0, 10);
const chunks = (items, size = 500) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

function dateRanges(start, end, maximumDays = 31) {
  const ranges = [];
  let cursor = new Date(start);
  const last = new Date(end);
  while (cursor <= last) {
    const rangeEnd = new Date(cursor);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + maximumDays - 1);
    if (rangeEnd > last) rangeEnd.setTime(last.getTime());
    ranges.push({ start_date:isoDate(cursor), end_date:isoDate(rangeEnd) });
    cursor = new Date(rangeEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ranges;
}

function orderRangesForSync({end=new Date(),syncDays=7,historyDays=90,earliestOrderDate=null}={}){
  const targetStart=new Date(end);targetStart.setUTCDate(targetStart.getUTCDate()-historyDays+1);
  const currentStart=new Date(end);currentStart.setUTCDate(currentStart.getUTCDate()-syncDays+1);
  const ranges=[{start_date:isoDate(currentStart),end_date:isoDate(end),mode:'CURRENT'}];
  const earliest=earliestOrderDate?new Date(earliestOrderDate):null;
  if(!earliest||earliest>targetStart){
    const backfillEnd=earliest?new Date(earliest.getTime()-86400000):new Date(currentStart.getTime()-86400000);
    if(backfillEnd>=targetStart){
      const backfillStart=new Date(backfillEnd);backfillStart.setUTCDate(backfillStart.getUTCDate()-30);
      if(backfillStart<targetStart)backfillStart.setTime(targetStart.getTime());
      ranges.push({start_date:isoDate(backfillStart),end_date:isoDate(backfillEnd),mode:'BACKFILL'});
    }
  }
  return ranges;
}

async function saveRaw(endpoint, result, period = {}) {
  await insertRaw({ platform: 'CAFE24', endpoint, http_status: result.status, response_json: result.payload, ...period });
}

async function upsertMany(table, records, onConflict) {
  if (!records.length) return 0;
  for (const batch of chunks(records)) await db(table, q => q.upsert(batch, { onConflict, count: 'exact' }));
  return records.length;
}

async function fetchAdminCollection(config, path, key, params = {}) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const result = await adminGet(config, path, { ...params, limit: 100, offset });
    await saveRaw(`${path}?offset=${offset}`, result);
    const page = result.payload?.[key] || [];
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}

function analyticsTotal(payload, candidates) {
  const data = map.rows(payload);
  if (!data.length) return null;
  for (const key of candidates) {
    const values = data.map(row => map.number(row[key])).filter(Number.isFinite);
    if (values.length) return values.reduce((a, b) => a + b, 0);
  }
  return null;
}

function analyticsByDate(payload, candidates, fallbackDate) {
  const result = new Map();
  for (const row of map.rows(payload)) {
    const date = String(row.date || row.day || row.stat_date || fallbackDate).slice(0, 10);
    let value = null;
    for (const key of candidates) {
      const parsed = map.number(row[key]);
      if (Number.isFinite(parsed)) { value = parsed; break; }
    }
    if (value != null) result.set(date, (result.get(date) || 0) + value);
  }
  return result;
}

async function syncAll(config) {
  const logId = await startSync();
  const counts = { products: 0, orders: 0, orderItems: 0, traffic: 0, referrers: 0, rawResponses: 0 };
  const errors = [];
  const end = new Date();
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - config.syncDays + 1);
  const historyStart = new Date(end); historyStart.setUTCDate(historyStart.getUTCDate() - (config.orderHistoryDays || 90) + 1);
  const period = { start_date: isoDate(start), end_date: isoDate(end) };
  let orderPeriod = { start_date:isoDate(start), end_date:isoDate(end) };

  try {
    const products = await fetchAdminCollection(config, '/products', 'products');
    counts.products = await upsertMany('cafe24_products', products.map(map.product), 'external_product_no');

    const earliestResult=await db('cafe24_orders',q=>q.select('order_date').order('order_date',{ascending:true}).limit(1).maybeSingle());
    const orderRanges=orderRangesForSync({end,syncDays:config.syncDays,historyDays:config.orderHistoryDays||90,earliestOrderDate:earliestResult.data?.order_date});
    const coverageStarts=[earliestResult.data?.order_date,...orderRanges.map(range=>range.start_date)].filter(Boolean).map(value=>isoDate(new Date(value))).sort();
    orderPeriod={start_date:coverageStarts[0]&&coverageStarts[0]<isoDate(historyStart)?isoDate(historyStart):coverageStarts[0]||isoDate(start),end_date:isoDate(end)};
    const orderMap = new Map();
    for (const range of orderRanges) {
      const rangeOrders = await fetchAdminCollection(config, '/orders', 'orders', {start_date:range.start_date,end_date:range.end_date});
      for (const order of rangeOrders) orderMap.set(String(order.order_id), order);
    }
    const orders = [...orderMap.values()];
    counts.orders = await upsertMany('cafe24_orders', orders.map(map.order), 'order_id');
    const existingItemOrders=new Set();
    const orderIds=orders.map(order=>String(order.order_id)).filter(Boolean);
    for(const batch of chunks(orderIds,200)){
      if(!batch.length)continue;
      const existing=await db('cafe24_order_items',q=>q.select('order_id').in('order_id',batch));
      for(const row of existing.data||[])existingItemOrders.add(String(row.order_id));
    }
    const items = [];
    for (const order of orders.filter(order=>!existingItemOrders.has(String(order.order_id)))) {
      try {
        const result = await adminGet(config, `/orders/${encodeURIComponent(order.order_id)}/items`);
        await saveRaw(`/orders/${order.order_id}/items`, result);
        items.push(...(result.payload?.items || []).map((value, index) => map.item(order.order_id, value, index)));
      } catch (error) { errors.push({ dataset: 'orderItems', orderId: order.order_id, message: error.message }); }
    }
    counts.orderItems = await upsertMany('cafe24_order_items', items, 'order_id,external_item_id');

    const analytics = {};
    for (const [name, path] of Object.entries(config.analyticsPaths)) {
      try {
        analytics[name] = await analyticsGet(config, path, period);
        await saveRaw(path, analytics[name], { period_start: period.start_date, period_end: period.end_date });
      } catch (error) { errors.push({ dataset: name, message: error.message }); }
    }
    const visitorsByDate = analytics.visitors ? analyticsByDate(analytics.visitors.payload, ['visitors', 'visit_count', 'visitor_count', 'count', 'value'], period.end_date) : new Map();
    const pageviewsByDate = analytics.pageviews ? analyticsByDate(analytics.pageviews.payload, ['pageviews', 'page_view', 'count', 'value'], period.end_date) : new Map();
    if (analytics.visitors || analytics.pageviews) {
      const dates = [...new Set([...visitorsByDate.keys(), ...pageviewsByDate.keys()])];
      const traffic = dates.length ? dates.map(date => ({
        date, shop_no: config.shopNo, visitors: visitorsByDate.get(date) ?? null,
        pageviews: pageviewsByDate.get(date) ?? null, source_status: 'OK',
        raw_data: { visitors: analytics.visitors?.payload, pageviews: analytics.pageviews?.payload }
      })) : [{ date: period.end_date, shop_no: config.shopNo, visitors: null, pageviews: null, source_status: 'PARSE_ERROR', raw_data: { visitors: analytics.visitors?.payload, pageviews: analytics.pageviews?.payload } }];
      counts.traffic = await upsertMany('cafe24_traffic_daily', traffic, 'date,shop_no');
    }
    if (analytics.referrers) {
      const refs = map.rows(analytics.referrers.payload).map((r, i) => ({
        date: r.date || period.end_date, shop_no: config.shopNo, source: String(r.source || r.referrer || r.channel || r.domain || r.url || `unknown-${i}`),
        visitors: map.number(r.visitors ?? r.visit_count ?? r.count), orders: map.number(r.orders ?? r.order_count), revenue: map.number(r.revenue ?? r.sales ?? r.order_amount), raw_data: r
      }));
      counts.referrers = await upsertMany('cafe24_referrers_daily', refs, 'date,shop_no,source');
    }
    const rawCount = await db('raw_api_responses', q => q.select('*', { count: 'exact', head: true }).eq('platform', 'CAFE24').gte('requested_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()));
    counts.rawResponses = rawCount.count || 0;
    const status = errors.length ? 'PARTIAL' : 'SUCCESS';
    await finishSync(logId, { status, rows_received: Object.values(counts).reduce((a, b) => a + b, 0), error_message: errors.length ? JSON.stringify(errors) : null, metadata: { counts, errors, period, order_period:orderPeriod, order_ranges:orderRanges } });
    return { syncLogId: logId, status, period, orderPeriod, orderRanges, counts, errors };
  } catch (error) {
    errors.push({ dataset: 'sync', message: error.message });
    await finishSync(logId, { status: 'FAILED', rows_received: Object.values(counts).reduce((a, b) => a + b, 0), error_message: error.message, metadata: { counts, errors, period } }).catch(() => {});
    throw Object.assign(error, { syncResult: { syncLogId: logId, status: 'FAILED', period, counts, errors } });
  }
}

async function syncOrdersRealtime(config, { days = 90 } = {}) {
  const logId = await startSync('ORDERS_REALTIME');
  const end = new Date();
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - Math.max(1, Math.min(Number(days) || 90, 90)) + 1);
  const ranges = dateRanges(start, end, 31);
  const orderMap = new Map();
  try {
    for (const range of ranges) {
      for (let offset = 0; ; offset += 100) {
        const result = await adminGet(config, '/orders', {
          start_date:range.start_date, end_date:range.end_date,
          embed:'items,cancellation,return,exchange', limit:100, offset
        });
        const page = result.payload?.orders || [];
        for (const order of page) orderMap.set(String(order.order_id), order);
        if (page.length < 100) break;
      }
    }
    const orders = [...orderMap.values()];
    const orderRows = orders.map(order => {
      const { items, cancellation, return:returned, exchange, ...orderOnly } = order;
      return map.order(orderOnly);
    });
    const itemRows = orders.flatMap(order => (Array.isArray(order.items) ? order.items : [])
      .map((item, index) => map.item(order.order_id, item, index)));
    const counts = {
      orders:await upsertMany('cafe24_orders', orderRows, 'order_id'),
      orderItems:await upsertMany('cafe24_order_items', itemRows, 'order_id,external_item_id')
    };
    const finishedAt = new Date().toISOString();
    await finishSync(logId, {
      status:'SUCCESS', rows_received:counts.orders + counts.orderItems,
      metadata:{ counts, period:{ start:isoDate(start), end:isoDate(end) }, realtime:true, embeddedItems:true }
    });
    return { syncLogId:logId, status:'SUCCESS', counts, finishedAt, period:{ start:isoDate(start), end:isoDate(end) } };
  } catch (error) {
    await finishSync(logId, { status:'FAILED', rows_received:0, error_message:error.message, metadata:{ realtime:true } }).catch(() => {});
    throw error;
  }
}

module.exports = { syncAll, syncOrdersRealtime, analyticsTotal, analyticsByDate, dateRanges, orderRangesForSync };
