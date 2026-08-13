'use strict';

const client = require('./client.js');
const map = require('./mappers.js');
const { getConfig } = require('./config.js');
const supabaseModule = require('../cafe24/supabase.js');
const operations = require('./operations.js');
const costCalibration = require('../analytics/cost-calibration.js');

const ORDER_STATUSES = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY', 'NONE_TRACKING'];
const isoDate = date => date.toISOString().slice(0, 10);
const chunks = (items, size = 400) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

function collection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.content)) return payload.content;
  return [];
}

function nextToken(payload) {
  return payload?.nextToken ?? payload?.next_token ?? payload?.data?.nextToken ?? payload?.data?.next_token ?? null;
}

async function saveRaw(db, endpoint, result, period = {}) {
  const saved = await db.from('raw_api_responses').insert({
    platform: 'COUPANG', endpoint, http_status: result.status,
    response_json: map.sanitize(result.data), ...period
  });
  if (saved.error) throw saved.error;
}

async function upsertMany(db, table, rows, onConflict) {
  if (!rows.length) return 0;
  for (const batch of chunks(rows)) {
    const result = await db.from(table).upsert(batch, { onConflict });
    if (result.error) throw result.error;
  }
  return rows.length;
}

async function fetchPages({ path, baseParams, tokenParam = 'nextToken', maxPages = 200, period = {}, requestOptions = {} }) {
  const db = supabaseModule.getSupabase();
  const rows = [];
  let token = null;
  for (let page = 0; page < maxPages; page += 1) {
    const params = { ...baseParams };
    if (token !== null) params[tokenParam] = token;
    const result = await client.request('GET', path, params, requestOptions);
    await saveRaw(db, path, result, period);
    const pageRows = collection(result.data);
    rows.push(...pageRows);
    const following = nextToken(result.data);
    if (!following || following === token || pageRows.length === 0) break;
    token = following;
  }
  return rows;
}

async function syncProducts(config) {
  const path = '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products';
  return fetchPages({ path, baseParams: { vendorId: config.vendorId, maxPerPage: 100 } });
}

async function syncProductDetails(products, db) {
  const rows = []; const errors = [];
  for (const product of products) {
    const sellerProductId = product.sellerProductId ?? product.seller_product_id;
    if (!sellerProductId) continue;
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${encodeURIComponent(sellerProductId)}`;
    try {
      const result = await client.request('GET', path, {}, { minInterval: 300 });
      await saveRaw(db, path, result);
      rows.push(...map.mapProductDetailItems(result.data));
    } catch (error) {
      errors.push({ sellerProductId: String(sellerProductId), message: error.message });
    }
  }
  return { rows: [...new Map(rows.map(item => [item.vendor_item_id, item])).values()], errors };
}

async function syncOrders(config, period) {
  const path = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(config.vendorId)}/ordersheets`;
  const all = [];
  for (const status of ORDER_STATUSES) {
    const rows = await fetchPages({
      path,
      baseParams: { createdAtFrom: `${period.start}+09:00`, createdAtTo: `${period.end}+09:00`, status, maxPerPage: 50 },
      period: { period_start: period.start, period_end: period.end }
    });
    all.push(...rows);
  }
  return [...new Map(all.map(order => [String(order.shipmentBoxId ?? order.orderId), order])).values()];
}

async function syncSettlements(config, period) {
  const path = '/v2/providers/openapi/apis/api/v1/revenue-history';
  return fetchPages({
    path,
    tokenParam: 'token',
    baseParams: { vendorId: config.vendorId, recognitionDateFrom: period.start, recognitionDateTo: period.end, token: '', maxPerPage: 50 },
    period: { period_start: period.start, period_end: period.end }
  });
}

async function syncRocketGrowthInventory(config) {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${encodeURIComponent(config.vendorId)}/rg/inventory/summaries`;
  return fetchPages({ path, baseParams: {}, requestOptions: { minInterval: 1200 } });
}

async function saveRocketGrowthInventory(db, inventory, now = new Date()) {
  const rows = inventory.map(item => map.mapRocketGrowthInventory(item, now)).filter(item => item.vendor_item_id);
  const current = await upsertMany(db, 'coupang_rg_inventory', rows, 'vendor_item_id');
  const snapshotDate = now.toISOString().slice(0, 10);
  const dailyRows = rows.map(({ updated_at, snapshot_at, ...item }) => ({ ...item, snapshot_date: snapshotDate }));
  const daily = await upsertMany(db, 'coupang_rg_inventory_daily', dailyRows, 'snapshot_date,vendor_item_id');
  const summary = rows.reduce((result, item) => {
    result.totalOrderable += Number(item.total_orderable_quantity || 0);
    result.salesLast30Days += Number(item.sales_last_30_days || 0);
    if (item.stock_status === 'OUT_OF_STOCK') result.outOfStock += 1;
    if (['CRITICAL', 'LOW'].includes(item.stock_status)) result.lowStock += 1;
    return result;
  }, { totalOrderable: 0, salesLast30Days: 0, outOfStock: 0, lowStock: 0 });
  return { current, daily, ...summary };
}

async function syncRocketGrowthInventoryOnly() {
  const config = getConfig();
  const db = supabaseModule.getSupabase();
  const started = await db.from('sync_logs').insert({ platform: 'COUPANG', job_type: 'RG_INVENTORY', status: 'RUNNING' }).select('id').single();
  if (started.error) throw started.error;
  const logId = started.data.id;
  try {
    const inventory = await syncRocketGrowthInventory(config);
    const counts = await saveRocketGrowthInventory(db, inventory);
    const finishedAt = new Date().toISOString();
    const updated = await db.from('sync_logs').update({ status: 'SUCCESS', finished_at: finishedAt, rows_received: counts.current, metadata: { counts: { rgInventory: counts.current, ...counts } } }).eq('id', logId);
    if (updated.error) throw updated.error;
    return { syncLogId: logId, status: 'SUCCESS', counts: { rgInventory: counts.current, ...counts } };
  } catch (error) {
    await db.from('sync_logs').update({ status: 'FAILED', finished_at: new Date().toISOString(), rows_received: 0, error_message: error.message }).eq('id', logId);
    throw Object.assign(error, { syncResult: { syncLogId: logId, status: 'FAILED' } });
  }
}

function koreaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function syncRocketGrowthRealtime() {
  const config = getConfig(); const db = supabaseModule.getSupabase(); const today = koreaDate();
  const started = await db.from('sync_logs').insert({ platform: 'COUPANG', job_type: 'RG_REALTIME', status: 'RUNNING' }).select('id').single();
  if (started.error) throw started.error;
  try {
    const inventory = await syncRocketGrowthInventory(config);
    const inventoryCounts = await saveRocketGrowthInventory(db, inventory);
    const orderCounts = await operations.syncRocketGrowthOrders(config, { start: today, end: today }, db);
    const counts = { rgInventory: inventoryCounts.current, rgTotalOrderable: inventoryCounts.totalOrderable, rgSalesLast30Days: inventoryCounts.salesLast30Days, rgOrders: orderCounts.rgOrders, rgOrderItems: orderCounts.rgOrderItems };
    const finishedAt = new Date().toISOString();
    const saved = await db.from('sync_logs').update({ status: 'SUCCESS', finished_at: finishedAt, rows_received: counts.rgInventory + counts.rgOrders + counts.rgOrderItems, metadata: { counts, period: { start: today, end: today }, realtime: true } }).eq('id', started.data.id);
    if (saved.error) throw saved.error;
    return { syncLogId: started.data.id, status: 'SUCCESS', counts, period: { start: today, end: today } };
  } catch (error) {
    await db.from('sync_logs').update({ status: 'FAILED', finished_at: new Date().toISOString(), error_message: error.message }).eq('id', started.data.id);
    throw error;
  }
}

function normalizedName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').replace(/[^0-9a-z가-힣]/g, '');
}

async function linkExactMasterProducts(db, products) {
  const masters = await db.from('master_products').select('id,name');
  if (masters.error) throw masters.error;
  const byName = new Map((masters.data || []).map(item => [normalizedName(item.name), item.id]));
  const rows = products.map(map.mapProduct).map(product => ({
    product,
    masterId: byName.get(normalizedName(product.product_name))
  })).filter(item => item.masterId).map(({ product, masterId }) => ({
    master_product_id: masterId,
    platform: 'COUPANG',
    external_product_id: product.seller_product_id,
    external_product_name: product.product_name,
    selling_price: Number(product.raw_data?.salePrice || product.raw_data?.price || 0),
    is_active: !/deleted|stopped|suspended/i.test(product.status || ''),
    raw_data: product.raw_data
  }));
  return upsertMany(db, 'channel_products', rows, 'platform,external_product_id');
}

async function syncAll() {
  const config = getConfig();
  const db = supabaseModule.getSupabase();
  const started = await db.from('sync_logs').insert({ platform: 'COUPANG', job_type: 'FETCH_ALL', status: 'RUNNING' }).select('id').single();
  if (started.error) throw started.error;
  const logId = started.data.id;
  const end = new Date();
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - config.syncDays + 1);
  const period = { start: isoDate(start), end: isoDate(end) };
  const counts = { products: 0, orders: 0, orderItems: 0, productItems: 0, settlements: 0, linkedProducts: 0, rgInventory: 0, rgInventoryDaily: 0, rgOutOfStock: 0, rgLowStock: 0, rgTotalOrderable: 0, rgSalesLast30Days: 0, rgOrders: 0, rgOrderItems: 0, returns: 0, exchanges: 0, inquiries: 0, unansweredInquiries: 0, itemInventory: 0, settlementSummaries: 0, shippingCenters: 0, promotionBudgets: 0, brands: 0, rawResponses: 0 };
  const errors = [];

  try {
    try {
      const inventory = await syncRocketGrowthInventory(config);
      const inventoryCounts = await saveRocketGrowthInventory(db, inventory);
      counts.rgInventory = inventoryCounts.current;
      counts.rgInventoryDaily = inventoryCounts.daily;
      counts.rgOutOfStock = inventoryCounts.outOfStock;
      counts.rgLowStock = inventoryCounts.lowStock;
      counts.rgTotalOrderable = inventoryCounts.totalOrderable;
      counts.rgSalesLast30Days = inventoryCounts.salesLast30Days;
    } catch (error) {
      errors.push({ dataset: 'rg_inventory', message: error.message });
    }

    const products = await syncProducts(config);
    const productRows = products.map(map.mapProduct).filter(item => item.seller_product_id);
    counts.products = await upsertMany(db, 'coupang_products', productRows, 'seller_product_id');
    counts.linkedProducts = await linkExactMasterProducts(db, products);

    const detailResult = await syncProductDetails(products, db);
    counts.productItems = await upsertMany(db, 'coupang_product_items', detailResult.rows, 'vendor_item_id');
    if (detailResult.errors.length) errors.push({ dataset: 'product_details', message: `${detailResult.errors.length} product detail requests failed`, details: detailResult.errors.slice(0, 10) });

    const orders = await syncOrders(config, period);
    const orderRows = orders.map(map.mapOrder).filter(item => item.shipment_box_id && item.order_id);
    const orderItemRows = orders.flatMap(map.mapOrderItems);
    counts.orders = await upsertMany(db, 'coupang_orders', orderRows, 'shipment_box_id');
    counts.orderItems = await upsertMany(db, 'coupang_order_items', orderItemRows, 'external_item_key');

    const productItems = [...new Map(orderItemRows.filter(item => item.vendor_item_id).map(item => [item.vendor_item_id, {
      vendor_item_id: item.vendor_item_id,
      seller_product_id: item.seller_product_id,
      item_name: item.product_name,
      sale_price: item.unit_price,
      status: item.status,
      raw_data: item.raw_data,
      updated_at: new Date().toISOString()
    }])).values()];
    counts.productItems += await upsertMany(db, 'coupang_product_items', productItems, 'vendor_item_id');

    const operationResult = await operations.syncOperations({ config, period, vendorItemIds: productItems.map(item => item.vendor_item_id) });
    Object.assign(counts, operationResult.counts);
    errors.push(...operationResult.errors);

    try {
      // 매출내역 API는 공식 문서상 전일까지만 조회할 수 있다. 주문 수집 기간과
      // 정산 인식 기간을 분리해 당일 포함 요청으로 전체 동기화가 PARTIAL 되는 것을 막는다.
      const settlementEnd = new Date(); settlementEnd.setUTCDate(settlementEnd.getUTCDate() - 1);
      const settlementStart = new Date(settlementEnd); settlementStart.setUTCDate(settlementStart.getUTCDate() - Math.min(config.syncDays, 31) + 1);
      const settlementPeriod = { start: isoDate(settlementStart), end: isoDate(settlementEnd) };
      const settlements = await syncSettlements(config, settlementPeriod);
      const settlementRows = settlements.flatMap(map.mapSettlementRows);
      counts.settlements = await upsertMany(db, 'coupang_settlements', settlementRows, 'settlement_key');
    } catch (error) {
      errors.push({ dataset: 'settlements', message: error.message });
    }

    try {
      const refreshed = await costCalibration.refreshCoupangCostCalibration({ db, triggerType: 'API_SYNC' });
      counts.costCalibration = refreshed.auto_applied ? 1 : 0;
    } catch (error) {
      errors.push({ dataset: 'cost_calibration', message: error.message });
    }

    const rawCount = await db.from('raw_api_responses').select('*', { count: 'exact', head: true }).eq('platform', 'COUPANG').gte('requested_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if (!rawCount.error) counts.rawResponses = rawCount.count || 0;
    const status = errors.length ? 'PARTIAL' : 'SUCCESS';
    const rowsReceived = Object.entries(counts).filter(([key]) => !['rgOutOfStock','rgLowStock','rgTotalOrderable','rgSalesLast30Days','unansweredInquiries','rawResponses'].includes(key)).reduce((sum,[,value])=>sum+Number(value||0),0);
    const finishedAt = new Date().toISOString();
    const productWriteEnabled = String(process.env.COUPANG_PRODUCT_WRITE_ENABLED || '').toLowerCase() === 'true';
    const updated = await db.from('sync_logs').update({ status, finished_at: finishedAt, rows_received: rowsReceived, error_message: errors.length ? JSON.stringify(errors) : null, metadata: { counts, errors, period, fixedIp:true, productWriteEnabled } }).eq('id', logId);
    if (updated.error) throw updated.error;
    await db.from('platform_accounts').upsert({ platform: 'COUPANG', account_name: 'Coupang WING', external_account_id: config.vendorId, is_connected: true, last_synced_at: finishedAt }, { onConflict: 'platform' });
    return { syncLogId: logId, status, period, counts, errors };
  } catch (error) {
    errors.push({ dataset: 'sync', message: error.message });
    try {
      await db.from('sync_logs').update({ status: 'FAILED', finished_at: new Date().toISOString(), rows_received: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0), error_message: error.message, metadata: { counts, errors, period } }).eq('id', logId);
    } catch {}
    throw Object.assign(error, { syncResult: { syncLogId: logId, status: 'FAILED', counts, errors, period } });
  }
}

module.exports = { syncAll, syncProducts, syncProductDetails, syncOrders, syncSettlements, syncRocketGrowthInventory, syncRocketGrowthInventoryOnly, syncRocketGrowthRealtime, saveRocketGrowthInventory, collection, nextToken, koreaDate };
