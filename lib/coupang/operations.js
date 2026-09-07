'use strict';

const client = require('./client.js');
const map = require('./mappers.js');
const ledger = require('./settlement-ledger.js');
const supabaseModule = require('../cafe24/supabase.js');
const { mapConcurrent } = require('./concurrency.js');

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
  const db = options.db || supabaseModule.getSupabase(); const rows = []; const pageSize = params.pageSize || 50;
  for (let pageNum = 1; pageNum <= (options.maxPages || 20); pageNum += 1) {
    const result = await (options.request || client.request)('GET', path, { ...params, pageNum }, options); await raw(db, path, result, period);
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

async function getCallCenterInquiry(inquiryId, options = {}) {
  const id = String(inquiryId || '');
  if (!/^\d+$/.test(id)) throw Object.assign(new Error('문의번호를 확인해주세요.'), { code: 'COUPANG_INQUIRY_INVALID_ID', status: 400 });
  // Official GET_ORIGIN_INQUIRY_BY_ID: this path has no vendor ID segment.
  const result = await (options.request || client.request)('GET', `/v2/providers/openapi/apis/api/v5/vendors/callCenterInquiries/${id}`, {},
    { minInterval: 1000, timeout: 10000, maxAttempts: 1 });
  const item = result.data?.data;
  if (!item || Array.isArray(item) || String(item.inquiryId) !== id ||
      (result.data.code != null && ![200, '200', 'SUCCESS'].includes(result.data.code))) {
    throw Object.assign(new Error('문의 상세 응답을 확인할 수 없습니다.'), { code: 'COUPANG_INQUIRY_INVALID_RESPONSE', status: 502 });
  }
  return item;
}

async function refreshCallCenterInquiry(inquiryId, db, options = {}) {
  const item = await getCallCenterInquiry(inquiryId, options);
  const inquiry = map.mapInquiry(item, 'CALL_CENTER', options);
  await upsert(db, 'coupang_inquiries', [inquiry], 'inquiry_key');
  return { item, inquiry };
}

async function markInquiryUnverified(db, row, error, options = {}) {
  const rawData = row.raw_data || {};
  const code = error.status === 404 ? 'COUPANG_INQUIRY_NOT_FOUND' :
    error.code === 'COUPANG_INQUIRY_INVALID_RESPONSE' ? error.code : 'COUPANG_INQUIRY_RECHECK_FAILED';
  let query = db.from('coupang_inquiries').update({ raw_data: { ...rawData, cs_sync: {
    ...rawData.cs_sync, verified: false, verifiedAt: rawData.cs_sync?.verifiedAt || row.updated_at || null,
    attemptedAt: new Date(options.now || Date.now()).toISOString(), errorCode: code,
  } } }).eq('inquiry_key', row.inquiry_key);
  if (row.updated_at) query = query.eq('updated_at', row.updated_at);
  const saved = await query;
  if (saved.error) throw saved.error;
  return { inquiryId: String(row.inquiry_id), code };
}

async function syncInquiries(config, period, db, options = {}) {
  period = recentPeriod(period, 7);
  const base = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(config.vendorId)}`;
  const pageOptions = { ...options, db };
  const online = await numberedPages(`${base}/onlineInquiries`, { answeredType: 'ALL', inquiryStartAt: period.start, inquiryEndAt: period.end, pageSize: 50 }, period, pageOptions);
  const calls = await numberedPages(`${base}/callCenterInquiries`, { vendorId: config.vendorId, partnerCounselingStatus: 'NONE', inquiryStartAt: period.start, inquiryEndAt: period.end, pageSize: 30 }, period, pageOptions);
  const callRows = [];
  const inquiryVerificationWarnings = [];
  let detailChecks = 0;
  for (const item of calls) {
    if (Array.isArray(item.replies)) { callRows.push(map.mapInquiry(item, 'CALL_CENTER', options)); continue; }
    try {
      if (detailChecks >= 10) throw new Error('Inquiry detail check budget reached');
      detailChecks += 1;
      callRows.push(map.mapInquiry(await getCallCenterInquiry(item.inquiryId, options), 'CALL_CENTER', options));
    } catch (error) {
      const existing = await db.from('coupang_inquiries').select('*').eq('inquiry_key', `CALL_CENTER:${item.inquiryId}`).limit(1);
      if (existing.error) throw existing.error;
      const prior = existing.data?.[0];
      if (prior) inquiryVerificationWarnings.push(await markInquiryUnverified(db, prior, error, options));
      else {
        const partial = map.mapInquiry(item, 'CALL_CENTER', options);
        partial.raw_data.cs_sync.verified = false;
        callRows.push(partial);
        inquiryVerificationWarnings.push({ inquiryId: String(item.inquiryId), code: 'COUPANG_INQUIRY_RECHECK_FAILED' });
      }
    }
  }
  const rows = [...online.map(item => map.mapInquiry(item, 'ONLINE', options)), ...callRows].filter(item => item.inquiry_id);
  const inquiries = await upsert(db, 'coupang_inquiries', rows, 'inquiry_key');
  const cutoff = new Date(new Date(options.now || Date.now()).getTime() - 30 * 60000).toISOString();
  const stale = await db.from('coupang_inquiries').select('inquiry_key,inquiry_id,inquiry_type,status,answered,inquired_at,updated_at,raw_data')
    .eq('inquiry_type', 'CALL_CENTER').eq('answered', false).lt('updated_at', cutoff)
    // Failed reads preserve the source timestamp, but must move behind unchecked rows.
    .order('raw_data->cs_sync->>attemptedAt', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: true }).limit(10);
  if (stale.error) throw stale.error;
  const currentIds = new Set(calls.map(item => String(item.inquiryId)));
  let staleInquiriesRefreshed = 0;
  for (const row of stale.data || []) {
    if (currentIds.has(String(row.inquiry_id))) continue;
    if (detailChecks >= 10) break;
    detailChecks += 1;
    try {
      await refreshCallCenterInquiry(row.inquiry_id, db, options);
      staleInquiriesRefreshed += 1;
    } catch (error) {
      inquiryVerificationWarnings.push(await markInquiryUnverified(db, row, error, options));
    }
  }
  return { inquiries, unansweredInquiries: rows.filter(item => !item.answered).length, staleInquiriesRefreshed, inquiryVerificationWarnings };
}

function uniqueInventoryIds(vendorItemIds = []) {
  return [...new Set(vendorItemIds.filter(Boolean).map(String))];
}

async function syncItemInventory(vendorItemIds, db) {
  const rows = await mapConcurrent(uniqueInventoryIds(vendorItemIds), 4, async id => {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/${encodeURIComponent(id)}/inventories`;
    const result = await client.request('GET', path, {}, { minInterval: 300 }); await raw(db, path, result);
    const values = collection(result.data);
    return map.mapItemInventory(values[0] || result.data, id);
  });
  return { itemInventory: await upsert(db, 'coupang_item_inventory', rows, 'vendor_item_id') };
}

async function syncSettlementSummaries(period, db) {
  const path = '/v2/providers/marketplace_openapi/apis/api/v1/settlement-histories'; const months = new Set([period.start.slice(0, 7), period.end.slice(0, 7)]); const rows = [];
  for (const month of months) { const result = await client.request('GET', path, { revenueRecognitionYearMonth: month }); await raw(db, path, result, period); rows.push(...collection(result.data).map(item => map.mapSettlementSummary(item, month))); }
  return { settlementSummaries: await ledger.saveApiProjection(db, 'coupang_settlement_summaries', rows) };
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
  const results = await mapConcurrent(jobs, 3, async ([dataset, run]) => {
    try {
      return { counts: await run(), error: null };
    } catch (error) {
      return { counts: null, error: { dataset, message: error.message, status: error.status || null } };
    }
  });
  for (const result of results) {
    if (result.counts) Object.assign(counts, result.counts);
    if (result.error) errors.push(result.error);
  }
  return { counts, errors };
}

module.exports = { collection, token, syncOperations, syncRocketGrowthOrders, syncReturns, syncExchanges, syncInquiries, getCallCenterInquiry, refreshCallCenterInquiry, markInquiryUnverified, uniqueInventoryIds, syncItemInventory, syncSettlementSummaries, syncShippingCenters, syncBudgetsAndBrands };
