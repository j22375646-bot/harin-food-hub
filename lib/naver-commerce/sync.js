'use strict';

const crypto = require('node:crypto');
const client = require('./client.js');
const customerService = require('./customer-service.js');
const { kstIso } = require('./probe.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const text = value => value == null ? '' : String(value).trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const number = value => {
  const parsed = Number(value == null || value === '' ? 0 : value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateOnly = value => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  return text(value).slice(0, 10) || null;
};

function collection(payload) {
  for (const value of [
    payload?.contents,
    payload?.content,
    payload?.elements,
    payload?.data?.contents,
    payload?.data?.content,
    payload?.data?.elements,
    payload?.data?.lastChangeStatuses,
    payload?.data,
    payload,
  ]) if (Array.isArray(value)) return value;
  return [];
}

async function upsertMany(db, table, rows, onConflict, chunkSize = 200) {
  if (!rows.length) return 0;
  let stored = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const result = await db.from(table).upsert(rows.slice(index, index + chunkSize), { onConflict });
    if (result.error) throw result.error;
    stored += Math.min(chunkSize, rows.length - index);
  }
  return stored;
}

function flattenProducts(payload, collectedAt = new Date().toISOString()) {
  const rows = [];
  for (const origin of collection(payload)) {
    const channels = origin.channelProducts || origin.channel_products || [];
    for (const product of channels) {
      const externalProductId = text(product.channelProductNo ?? product.productNo ?? product.id);
      if (!externalProductId) continue;
      rows.push({
        externalProductId,
        externalProductName:text(product.name || origin.name) || `네이버 상품 ${externalProductId}`,
        sellingPrice:number(product.discountedPrice ?? product.salePrice),
        isActive:['SALE','WAIT'].includes(text(product.statusType).toUpperCase()),
        rawData:{
          ...product,
          originProductNo:product.originProductNo ?? origin.originProductNo ?? null,
          groupProductNo:product.groupProductNo ?? origin.groupProductNo ?? null,
          source_type:'NAVER_COMMERCE_PRODUCT',
          updatedAt:collectedAt,
        },
      });
    }
  }
  return rows;
}

async function fetchProducts(config, maxPages = 100) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await client.request('POST', '/v1/products/search', {
      config,
      body:{ page, size:100, orderType:'MOD_DATE' },
    });
    const batch = collection(result.data);
    rows.push(...batch);
    if (result.data?.last === true || batch.length < 100) break;
    await sleep(200);
  }
  return rows;
}

async function storeProducts(db, payloadRows, collectedAt) {
  const products = payloadRows.flatMap(row => flattenProducts({ contents:[row] }, collectedAt));
  if (!products.length) return { received:0, stored:0 };
  const existingResult = await db.from('channel_products')
    .select('external_product_id,master_product_id,match_method,match_confidence,matched_at,matched_by,raw_data')
    .eq('platform','NAVER');
  if (existingResult.error) throw existingResult.error;
  const existing = new Map((existingResult.data || []).map(row => [text(row.external_product_id), row]));
  const rows = products.map(product => {
    const prior = existing.get(product.externalProductId) || {};
    return {
      master_product_id:prior.master_product_id || null,
      platform:'NAVER',
      external_product_id:product.externalProductId,
      external_product_name:product.externalProductName,
      selling_price:product.sellingPrice,
      is_active:product.isActive,
      match_method:prior.match_method || null,
      match_confidence:prior.match_confidence ?? null,
      matched_at:prior.matched_at || null,
      matched_by:prior.matched_by || null,
      raw_data:{ ...(prior.raw_data || {}), ...product.rawData },
      updated_at:collectedAt,
    };
  });
  return { received:products.length, stored:await upsertMany(db, 'channel_products', rows, 'platform,external_product_id') };
}

function nextMore(payload) {
  const more = payload?.data?.more ?? payload?.more ?? null;
  if (!more?.moreFrom || more.moreSequence == null) return null;
  return { moreFrom:more.moreFrom, moreSequence:more.moreSequence };
}

async function fetchOrderChanges(config, { start, end }) {
  const rows = [];
  for (let cursor = new Date(start); cursor < end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const windowEnd = new Date(Math.min(end.getTime(), cursor.getTime() + DAY_MS - 1));
    let lastChangedFrom = cursor;
    let moreSequence = null;
    for (let page = 0; page < 100; page += 1) {
      const result = await client.request('GET', '/v1/pay-order/seller/product-orders/last-changed-statuses', {
        config,
        query:{
          lastChangedFrom:kstIso(lastChangedFrom),
          lastChangedTo:kstIso(windowEnd),
          limitCount:300,
          ...(moreSequence == null ? {} : { moreSequence }),
        },
      });
      const batch = collection(result.data);
      rows.push(...batch);
      const more = nextMore(result.data);
      if (!more || more.moreSequence === moreSequence) break;
      lastChangedFrom = new Date(more.moreFrom);
      moreSequence = more.moreSequence;
      await sleep(250);
    }
    await sleep(250);
  }
  return rows;
}

async function fetchOrderDetails(config, productOrderIds) {
  const rows = [];
  const unique = [...new Set(productOrderIds.map(text).filter(Boolean))];
  for (let index = 0; index < unique.length; index += 300) {
    const result = await client.request('POST', '/v1/pay-order/seller/product-orders/query', {
      config,
      body:{ productOrderIds:unique.slice(index, index + 300), quantityClaimCompatibility:true },
    });
    rows.push(...collection(result.data));
    if (index + 300 < unique.length) await sleep(250);
  }
  return rows;
}

function splitOrderEntry(entry) {
  const order = entry.order || entry.orderInfo || entry;
  const productOrder = entry.productOrder || entry.productOrderInfo || entry;
  return { order, productOrder };
}

function shippingAddress(productOrder) {
  return productOrder.shippingAddress || productOrder.shipping_address || {};
}

function deliveryInfo(productOrder) {
  return productOrder.delivery || productOrder.deliveryInfo || productOrder.shippingInfo || {};
}

function mapOrderDetail(entry, collectedAt = new Date().toISOString()) {
  const { order, productOrder } = splitOrderEntry(entry);
  const productOrderId = text(productOrder.productOrderId ?? entry.productOrderId);
  const orderId = text(order.orderId ?? productOrder.orderId ?? entry.orderId);
  if (!orderId || !productOrderId) return null;
  const address = shippingAddress(productOrder);
  const delivery = deliveryInfo(productOrder);
  const quantity = Math.max(1, number(productOrder.remainQuantity ?? productOrder.quantity));
  const paidAmount = number(productOrder.remainPaymentAmount ?? productOrder.totalPaymentAmount ?? productOrder.initialPaymentAmount);
  const status = text(productOrder.productOrderStatus ?? entry.productOrderStatus);
  return {
    order:{
      order_id:orderId,
      order_date:order.orderDate || productOrder.orderDate || null,
      payment_date:order.paymentDate || productOrder.paymentDate || null,
      status,
      paid_amount:paidAmount,
      receiver_name:text(address.name),
      receiver_phone:text(address.tel1 || address.tel2),
      receiver_address:[address.zipCode, address.baseAddress, address.detailedAddress].map(text).filter(Boolean).join(' '),
      shipping_memo:text(productOrder.shippingMemo || address.pickupLocationContent || address.entryMethodContent),
      shipment_id:text(productOrder.packageNumber || delivery.packageNumber),
      invoice_no:text(delivery.invoiceNo || delivery.invoiceNumber || productOrder.invoiceNo),
      delivery_company:text(delivery.deliveryCompany || delivery.deliveryCompanyCode || productOrder.deliveryCompany),
      raw_data:{ order, productOrder },
      collected_at:collectedAt,
      updated_at:collectedAt,
    },
    item:{
      product_order_id:productOrderId,
      order_id:orderId,
      product_id:text(productOrder.productId),
      original_product_id:text(productOrder.originalProductId),
      product_name:text(productOrder.productName) || `네이버 주문상품 ${productOrderId}`,
      option_name:text(productOrder.productOption),
      quantity,
      unit_price:quantity ? paidAmount / quantity : paidAmount,
      paid_amount:paidAmount,
      status,
      shipping_due_date:productOrder.shippingDueDate || null,
      raw_data:{ ...productOrder, orderId },
      collected_at:collectedAt,
      updated_at:collectedAt,
    },
  };
}

const STATUS_RANK = Object.freeze({
  PAYMENT_WAITING:0, PAYED:1, PREPARING_PRODUCT:2, DISPATCHED:3,
  DELIVERING:4, DELIVERED:5, PURCHASE_DECIDED:6,
  CANCELED:7, RETURNED:7, EXCHANGED:7, CANCELED_BY_NOPAYMENT:7,
});

function aggregateOrders(mapped) {
  const orders = new Map();
  for (const row of mapped) {
    const current = orders.get(row.order.order_id);
    if (!current) {
      orders.set(row.order.order_id, { ...row.order });
      continue;
    }
    current.paid_amount += row.order.paid_amount;
    const nextRank = STATUS_RANK[row.order.status] ?? 99;
    const currentRank = STATUS_RANK[current.status] ?? 99;
    if (nextRank < currentRank) current.status = row.order.status;
    for (const key of ['receiver_name','receiver_phone','receiver_address','shipping_memo','shipment_id','invoice_no','delivery_company']) {
      if (!current[key] && row.order[key]) current[key] = row.order[key];
    }
  }
  return [...orders.values()];
}

async function storeOrders(db, detailRows, collectedAt) {
  const mapped = detailRows.map(row => mapOrderDetail(row, collectedAt)).filter(Boolean);
  const orders = aggregateOrders(mapped);
  const items = mapped.map(row => row.item);
  return {
    received:mapped.length,
    orders:await upsertMany(db, 'naver_commerce_orders', orders, 'order_id'),
    orderItems:await upsertMany(db, 'naver_commerce_order_items', items, 'product_order_id'),
  };
}

async function fetchSettlements(config, { startDate, endDate }, maxPages = 100, diagnostics = []) {
  const rows = [];
  // The settlement API intermittently returns an empty `elements` array for
  // larger page sizes even when `totalElements` is non-zero. A one-row page
  // matches the provider's connection probe and lets pagination recover every
  // settlement deterministically.
  const pageSize = 1;
  const rangeEnd = new Date(`${endDate}T00:00:00.000Z`);
  for (let cursor = new Date(`${startDate}T00:00:00.000Z`); cursor <= rangeEnd; cursor = new Date(cursor.getTime() + 8 * DAY_MS)) {
    const windowEnd = new Date(Math.min(rangeEnd.getTime(), cursor.getTime() + 7 * DAY_MS));
    const windowStartDate = cursor.toISOString().slice(0, 10);
    const windowEndDate = windowEnd.toISOString().slice(0, 10);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const result = await client.request('GET', '/v1/pay-settle/settle/daily', {
        config,
        query:{ startDate:windowStartDate, endDate:windowEndDate, pageNumber, pageSize },
      });
      const batch = collection(result.data);
      rows.push(...batch);
      const totalPages = number(result.data?.pagination?.totalPages);
      diagnostics.push({
        startDate:windowStartDate,
        endDate:windowEndDate,
        pageNumber,
        received:batch.length,
        totalElements:number(result.data?.pagination?.totalElements),
      });
      if (batch.length < pageSize || (totalPages && pageNumber >= totalPages)) break;
      await sleep(250);
    }
    await sleep(250);
  }
  return rows;
}

function settlementKey(row) {
  const source = [row.settleBasisStartDate,row.settleBasisEndDate,row.settleExpectDate,row.settleCompleteDate,row.settleAmount,row.paySettleAmount,row.commissionSettleAmount].join(':');
  return crypto.createHash('sha256').update(source).digest('hex');
}

function mapSettlement(row, collectedAt = new Date().toISOString()) {
  return {
    settlement_key:settlementKey(row),
    settle_basis_start_date:dateOnly(row.settleBasisStartDate),
    settle_basis_end_date:dateOnly(row.settleBasisEndDate),
    settle_expect_date:dateOnly(row.settleExpectDate),
    settle_complete_date:dateOnly(row.settleCompleteDate),
    settle_amount:number(row.settleAmount),
    pay_settle_amount:number(row.paySettleAmount),
    commission_settle_amount:number(row.commissionSettleAmount),
    benefit_settle_amount:number(row.benefitSettleAmount),
    deduction_restore_settle_amount:number(row.deductionRestoreSettleAmount),
    pay_holdback_amount:number(row.payHoldbackAmount),
    difference_settle_amount:number(row.differenceSettleAmount),
    raw_data:row,
    collected_at:collectedAt,
    updated_at:collectedAt,
  };
}

async function sync({ db, now = new Date(), days = 31 } = {}) {
  const config = client.getConfig();
  const started = await db.from('sync_logs').insert({
    platform:'NAVER', job_type:'COMMERCE_SYNC', status:'RUNNING',
  }).select('id').single();
  if (started.error) throw started.error;
  const collectedAt = new Date().toISOString();
  const start = new Date(now.getTime() - Math.max(1, days) * DAY_MS);
  const counts = { products:0, orders:0, orderItems:0, inquiries:0, claims:0, settlements:0 };
  const errors = [];
  const diagnostics = { settlementPages:[] };
  const run = async (dataset, work) => {
    try { return await work(); }
    catch (error) {
      errors.push({ dataset, code:error.code || null, status:error.status || null, message:error.message });
      return null;
    }
  };
  try {
    await run('products', async () => {
      const productPayloads = await fetchProducts(config);
      const saved = await storeProducts(db, productPayloads, collectedAt);
      counts.products = saved.stored;
    });
    await run('orders', async () => {
      const changes = await fetchOrderChanges(config, { start, end:now });
      const ids = changes.map(row => row.productOrderId || row.product_order_id).filter(Boolean);
      const details = await fetchOrderDetails(config, ids);
      const saved = await storeOrders(db, details, collectedAt);
      counts.orders = saved.orders;
      counts.orderItems = saved.orderItems;
    });
    await run('customer_service', async () => {
      const result = await customerService.sync({ db, now });
      counts.inquiries = number(result.counts?.inquiries);
      counts.claims = number(result.counts?.claims);
      if (result.status === 'FAILED') throw new Error('네이버 문의·클레임 수집에 실패했습니다.');
    });
    await run('settlements', async () => {
      const rows = await fetchSettlements(
        config,
        { startDate:dateOnly(start), endDate:dateOnly(now) },
        100,
        diagnostics.settlementPages,
      );
      counts.settlements = await upsertMany(db, 'naver_commerce_settlements', rows.map(row => mapSettlement(row, collectedAt)), 'settlement_key');
    });
    const status = errors.length ? Object.values(counts).some(Boolean) ? 'PARTIAL' : 'FAILED' : 'SUCCESS';
    const finishedAt = new Date().toISOString();
    const updated = await db.from('sync_logs').update({
      status, finished_at:finishedAt,
      rows_received:Object.values(counts).reduce((sum, value) => sum + number(value), 0),
      error_message:errors.length ? JSON.stringify(errors) : null,
      metadata:{ counts, errors, diagnostics, fixedIp:true, sourceIp:process.env.COUPANG_ALLOWED_SOURCE_IP || null, writeEnabled:false },
    }).eq('id', started.data.id);
    if (updated.error) throw updated.error;
    return { syncLogId:started.data.id, status, counts, errors, diagnostics, fixedIp:true };
  } catch (error) {
    await db.from('sync_logs').update({
      status:'FAILED', finished_at:new Date().toISOString(), error_message:error.message,
      metadata:{ counts, errors, fixedIp:true },
    }).eq('id', started.data.id);
    throw error;
  }
}

module.exports = {
  aggregateOrders,
  collection,
  dateOnly,
  fetchOrderChanges,
  fetchOrderDetails,
  fetchProducts,
  fetchSettlements,
  flattenProducts,
  mapOrderDetail,
  mapSettlement,
  settlementKey,
  splitOrderEntry,
  storeOrders,
  storeProducts,
  sync,
};
