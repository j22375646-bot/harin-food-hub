'use strict';

const client = require('./client.js');
const map = require('./mappers.js');
const supabaseModule = require('../cafe24/supabase.js');

const chunks = (items, size = 300) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const ymd = value => String(value).replaceAll('-', '');
function recentPeriod(period, days = 7) { const end = new Date(`${period.end}T00:00:00Z`); const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1); return { start: start.toISOString().slice(0, 10), end: period.end }; }

function collection(payload) {
  if (Array.isArray(payload)) return payload;
  for (const value of [payload?.data, payload?.data?.content, payload?.content, payload?.data?.items, payload?.items]) if (Array.isArray(value)) return value;
  return [];
}

function token(payload) { return payload?.nextToken ?? payload?.data?.nextToken ?? payload?.next_token ?? payload?.data?.next_token ?? null; }

async function raw(db, endpoint, result, period = {}) {
  const saved = await db.from('raw_api_responses').insert({ platform: 'COUPANG', endpoint, http_status: result.status, response_json: map.sanitize(result.data), period_start: period.start, period_end: period.end });
  if (saved.error) throw saved.error;
}

async function upsert(db, table, rows, onConflict) {
  const safeRows = rows.filter(Boolean);
  for (const batch of chunks(safeRows)) { const result = await db.from(table).upsert(batch, { onConflict }); if (result.error) throw result.error; }
  return safeRows.length;
}

async function tokenPages(path, params, period = {}, options = {}) {
  const db = supabaseModule.getSupabase(); const rows = []; let next = null;
  for (let page = 0; page < (options.maxPages || 100); page += 1) {
    const result = await client.request('GET', path, { ...params, ...(next ? { nextToken: next } : {}) }, options);
    await raw(db, path, result, period); const batch = collection(result.data); rows.push(...batch);
    const following = token(result.data); if (!following || following === next || !batch.length) break; next = following;
  }
  return rows;
}

async function numberedPages(path, params, period = {}, options = {}) {
  const db = supabaseModule.getSupabase(); const rows = []; const pageSize = params.pageSize || 50;
  for (let pageNum = 1; pageNum <= (options.maxPages || 20); pageNum += 1) {
    const result = await client.request('GET', path, { ...params, pageNum }, options); await raw(db, path, result, period);
    const batch = collection(result.data); rows.push(...batch); if (batch.length < pageSize) break;
  }
  return rows;
}

async function syncRocketGrowthOrders(config, period, db) {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${encodeURIComponent(config.vendorId)}/rg/orders`;
  const source = await tokenPages(path, { paidDateFrom: ymd(period.start), paidDateTo: ymd(period.end) }, period, { minInterval: 1200 });
  const mapped = source.map(map.mapRocketGrowthOrder).filter(item => item.order.order_id);
  return { rgOrders: await upsert(db, 'coupang_rg_orders', mapped.map(item => item.order), 'order_id'), rgOrderItems: await upsert(db, 'coupang_rg_order_items', mapped.flatMap(item => item.items), 'external_item_key') };
}

async function syncReturns(config, period, db) {
  const path = `/v2/providers/openapi/apis/api/v6/vendors/${encodeURIComponent(config.vendorId)}/returnRequests`; const rows = [];
  for (const cancelType of ['RETURN', 'CANCEL']) rows.push(...await tokenPages(path, { searchType: 'timeFrame', createdAtFrom: `${period.start}T00:00`, createdAtTo: `${period.end}T23:59`, cancelType }, period));
  const unique = [...new Map(rows.map(item => [String(item.receiptId ?? item.returnId ?? item.cancelId), item])).values()];
  return { returns: await upsert(db, 'coupang_returns', unique.map(map.mapReturn).filter(item => item.receipt_id), 'receipt_id') };
}

async function syncExchanges(config, period, db) {
  period = recentPeriod(period, 7);
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/exchangeRequests`;
  const rows = await tokenPages(path, { createdAtFrom: `${period.start}T00:00:00`, createdAtTo: `${period.end}T23:59:59`, maxPerPage: 50 }, period);
  return { exchanges: await upsert(db, 'coupang_exchanges', rows.map(map.mapExchange).filter(item => item.exchange_id), 'exchange_id') };
}

async function syncInquiries(config, period, db) {
  period = recentPeriod(period, 7);
  const base = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(config.vendorId)}`;
  const online = await numberedPages(`${base}/onlineInquiries`, { answeredType: 'ALL', inquiryStartAt: period.start, inquiryEndAt: period.end, pageSize: 50 }, period);
  const calls = await numberedPages(`${base}/callCenterInquiries`, { partnerCounselingStatus: 'NONE', inquiryStartAt: period.start, inquiryEndAt: period.end, pageSize: 30 }, period);
  const rows = [...online.map(item => map.mapInquiry(item, 'ONLINE')), ...calls.map(item => map.mapInquiry(item, 'CALL_CENTER'))].filter(item => item.inquiry_id);
  return { inquiries: await upsert(db, 'coupang_inquiries', rows, 'inquiry_key'), unansweredInquiries: rows.filter(item => !item.answered).length };
}

function uniqueInventoryIds(vendorItemIds = []) {
  return [...new Set(vendorItemIds.filter(Boolean).map(String))];
}

async function syncItemInventory(vendorItemIds, db) {
  const rows = [];
  for (const id of uniqueInventoryIds(vendorItemIds)) {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${encodeURIComponent(id)}/inventories`;
    const result = await client.request('GET', path, {}, { minInterval: 300 }); await raw(db, path, result);
    const values = collection(result.data); rows.push(map.mapItemInventory(values[0] || result.data, id));
  }
  return { itemInventory: await upsert(db, 'coupang_item_inventory', rows, 'vendor_item_id') };
}

async function syncSettlementSummaries(period, db) {
  const path = '/v2/providers/marketplace_openapi/apis/api/v1/settlement-histories'; const months = new Set([period.start.slice(0, 7), period.end.slice(0, 7)]); const rows = [];
  for (const month of months) { const result = await client.request('GET', path, { revenueRecognitionYearMonth: month }); await raw(db, path, result, period); rows.push(...collection(result.data).map(item => map.mapSettlementSummary(item, month))); }
  return { settlementSummaries: await upsert(db, 'coupang_settlement_summaries', rows, 'summary_key') };
}

async function syncShippingCenters(config, db) {
  const outPath = '/v2/providers/marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound';
  const retPath = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(config.vendorId)}/returnShippingCenters`;
  const outbound = await numberedPages(outPath, { pageSize: 50 });
  const returns = await tokenPages(retPath, { maxPerPage: 50 });
  return { shippingCenters: await upsert(db, 'coupang_shipping_centers', [...outbound.map(item => map.mapShippingCenter(item, 'OUTBOUND')), ...returns.map(item => map.mapShippingCenter(item, 'RETURN'))].filter(item => item.center_code), 'center_key') };
}

async function syncBudgetsAndBrands(config, period, db) {
  const budgetPath = `/v2/providers/fms/apis/api/v1/vendors/${encodeURIComponent(config.vendorId)}/budgets`;
  const budgetResult = await client.request('GET', budgetPath, { targetMonth: period.end.slice(0, 7) }); await raw(db, budgetPath, budgetResult, period);
  const budgets = collection(budgetResult.data).map(map.mapBudget);
  const brandPath = '/v2/providers/seller_api/apis/api/v1/marketplace/brands/enrolled';
  const brandResult = await client.request('GET', brandPath, { vendorId: config.vendorId }); await raw(db, brandPath, brandResult);
  const brands = collection(brandResult.data).map(map.mapBrand).filter(item => item.brand_id);
  return { promotionBudgets: await upsert(db, 'coupang_promotion_budgets', budgets, 'budget_key'), brands: await upsert(db, 'coupang_brands', brands, 'brand_id') };
}

async function syncOperations({ config, period, vendorItemIds = [] }) {
  const db = supabaseModule.getSupabase(); const counts = {}; const errors = [];
  const jobs = [
    ['rg_orders', () => syncRocketGrowthOrders(config, period, db)], ['returns', () => syncReturns(config, period, db)],
    ['exchanges', () => syncExchanges(config, period, db)], ['inquiries', () => syncInquiries(config, period, db)],
    ['item_inventory', () => syncItemInventory(vendorItemIds, db)], ['settlement_summaries', () => syncSettlementSummaries(period, db)],
    ['shipping_centers', () => syncShippingCenters(config, db)], ['budgets_brands', () => syncBudgetsAndBrands(config, period, db)]
  ];
  for (const [dataset, run] of jobs) { try { Object.assign(counts, await run()); } catch (error) { errors.push({ dataset, message: error.message, status: error.status || null }); } }
  return { counts, errors };
}

module.exports = { collection, token, syncOperations, syncRocketGrowthOrders, syncReturns, syncExchanges, syncInquiries, uniqueInventoryIds, syncItemInventory, syncSettlementSummaries, syncShippingCenters, syncBudgetsAndBrands };
