'use strict';

const crypto = require('node:crypto');
const client = require('./client.js');
const configModule = require('./config.js');
const map = require('./mappers.js');
const supabaseModule = require('../cafe24/supabase.js');

const text = value => value == null ? '' : String(value).trim();
const numericId = (value, label) => {
  const candidate = text(value);
  if (!/^\d+$/.test(candidate)) throw Object.assign(new Error(`${label} 형식이 올바르지 않습니다.`), { status: 400 });
  return candidate;
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function snapshotHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function normalizeCoupangError(error) {
  const message = text(error?.message);
  const ipMatch = message.match(/ip address\s+([0-9a-f:.]+)/i);
  if (error?.status === 403 && /ip address|not allowed/i.test(message)) {
    const normalized = new Error(`쿠팡이 현재 서버 IP${ipMatch?.[1] ? ` (${ipMatch[1]})` : ''}를 허용하지 않아 조회·처리를 차단했습니다. 쿠팡 Open API 허용 IP에 고정 출구 IP를 등록해야 합니다.`);
    normalized.status = 503;
    normalized.code = 'COUPANG_IP_NOT_ALLOWED';
    normalized.response = { code: normalized.code, blockedIp: ipMatch?.[1] || null };
    return normalized;
  }
  return error;
}

function exactNumericJson(value, fields) {
  const markers = new Map();
  const prepared = JSON.parse(JSON.stringify(value, (key, item) => {
    if (fields.has(key) && /^\d+$/.test(String(item))) {
      const marker = `__COUPANG_INTEGER_${markers.size}__`;
      markers.set(marker, String(item)); return marker;
    }
    return item;
  }));
  let result = JSON.stringify(prepared);
  for (const [marker, digits] of markers) result = result.replace(`"${marker}"`, digits);
  return result;
}

async function auditStart(operationType, targetType, targetId, payload) {
  const db = supabaseModule.getSupabase();
  const saved = await db.from('coupang_operation_requests').insert({
    operation_type: operationType,
    target_type: targetType,
    target_id: text(targetId),
    status: 'EXECUTING',
    payload: map.sanitize(payload),
    confirmed_at: new Date().toISOString()
  }).select('id').single();
  if (saved.error) throw saved.error;
  return { db, id: saved.data.id };
}

async function auditFinish(audit, status, result, errorMessage = null) {
  const saved = await audit.db.from('coupang_operation_requests').update({
    status,
    result_json: map.sanitize(result || {}),
    error_message: errorMessage,
    executed_at: new Date().toISOString()
  }).eq('id', audit.id);
  if (saved.error) console.error('[coupang operation audit]', saved.error.message);
}

async function refreshSellerOrder(shipmentBoxId, db = supabaseModule.getSupabase()) {
  const config = configModule.getConfig();
  const path = `/v2/providers/openapi/apis/api/v5/vendors/${encodeURIComponent(config.vendorId)}/ordersheets/${numericId(shipmentBoxId, '묶음배송번호')}`;
  const result = await client.request('GET', path);
  const order = result.data?.data || result.data;
  if (!order || Array.isArray(order)) throw Object.assign(new Error('주문 상세를 찾지 못했습니다.'), { status: 404 });
  const orderRow = map.mapOrder(order);
  const itemRows = map.mapOrderItems(order);
  const savedOrder = await db.from('coupang_orders').upsert(orderRow, { onConflict: 'shipment_box_id' });
  if (savedOrder.error) throw savedOrder.error;
  if (itemRows.length) {
    const savedItems = await db.from('coupang_order_items').upsert(itemRows, { onConflict: 'external_item_key' });
    if (savedItems.error) throw savedItems.error;
  }
  return order;
}

function publicOrderDetail(order) {
  const receiver = order.receiver || {};
  const orderer = order.orderer || {};
  return {
    shipmentBoxId: text(order.shipmentBoxId), orderId: text(order.orderId), status: order.status,
    orderedAt: order.orderedAt, paidAt: order.paidAt,
    orderer: { name: orderer.name || '', safeNumber: orderer.safeNumber || '' },
    receiver: {
      name: receiver.name || '', safeNumber: receiver.safeNumber || receiver.receiverNumber || '',
      address: receiver.addr1 || receiver.address || '', addressDetail: receiver.addr2 || receiver.addressDetail || '',
      postCode: receiver.postCode || '', message: receiver.deliveryMessage || receiver.message || ''
    },
    invoiceNumber: order.invoiceNumber || '', deliveryCompanyName: order.deliveryCompanyName || '',
    items: (order.orderItems || []).map(item => ({
      vendorItemId: text(item.vendorItemId), name: item.vendorItemName || item.sellerProductName || '상품',
      quantity: Number(item.shippingCount || item.quantity || 0), price: Number(item.orderPrice || item.salesPrice || 0),
      cancelQuantity: Number(item.holdCountForCancel || 0)
    }))
  };
}

function orderHasInvoice(order, invoiceNumber) {
  const expected=text(invoiceNumber);
  if(!expected)return false;
  const rows=[order,...(order?.orderItems||[]),...(order?.items||[])].filter(Boolean);
  return rows.some(row=>[
    row.invoiceNumber,row.invoice_number,row.trackingNumber,row.tracking_no
  ].some(value=>text(value)===expected));
}

async function getOrderDetail(shipmentBoxId) {
  try {
    return publicOrderDetail(await refreshSellerOrder(shipmentBoxId));
  } catch (error) {
    throw normalizeCoupangError(error);
  }
}

async function getProductDetail(sellerProductId) {
  const id = numericId(sellerProductId, '쿠팡 등록상품 ID');
  try {
    const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${encodeURIComponent(id)}`;
    const result = await client.request('GET', path);
    const product = result.data?.data || result.data;
    if (!product || typeof product !== 'object' || Array.isArray(product)) throw Object.assign(new Error('쿠팡 상품 조회 결과를 확인할 수 없습니다.'), { status:502 });
    // 상품 변경 API는 직전 조회의 전체 JSON을 요구하므로 암호화 작업 큐 안에서는 원본을 유지한다.
    return { sellerProductId:id, product, snapshotHash:snapshotHash(product) };
  } catch (error) {
    throw normalizeCoupangError(error);
  }
}

async function executeProductAction(action, input) {
  if (action !== 'PRODUCT_UPDATE') throw Object.assign(new Error('지원하지 않는 쿠팡 상품 작업입니다.'), { status:400 });
  if (String(process.env.COUPANG_PRODUCT_WRITE_ENABLED || '').toLowerCase() !== 'true') {
    throw Object.assign(new Error('쿠팡 상품 변경 환경 잠금이 켜져 있습니다. 읽기 검증 후에만 열 수 있습니다.'), { status:403, code:'COUPANG_PRODUCT_WRITE_LOCKED' });
  }
  const config = configModule.getConfig();
  const sellerProductId = numericId(input.sellerProductId, '쿠팡 등록상품 ID');
  const expectedSnapshotHash = text(input.expectedSnapshotHash);
  if (!/^[a-f0-9]{64}$/.test(expectedSnapshotHash)) throw Object.assign(new Error('최신 상품 조회 확인값이 필요합니다.'), { status:409 });
  if (!input.product || typeof input.product !== 'object' || Array.isArray(input.product)) throw Object.assign(new Error('쿠팡 상품 전체 조회본이 필요합니다.'), { status:400 });
  const current = await getProductDetail(sellerProductId);
  if (current.snapshotHash !== expectedSnapshotHash) throw Object.assign(new Error('상품 정보가 조회 이후 달라졌습니다. 다시 조회한 뒤 변경해주세요.'), { status:409, code:'COUPANG_PRODUCT_CHANGED' });
  const product = JSON.parse(JSON.stringify(input.product));
  if (String(product.sellerProductId || '') !== sellerProductId) throw Object.assign(new Error('조회한 상품 ID와 변경할 상품 ID가 다릅니다.'), { status:400 });
  if (text(product.vendorId) !== config.vendorId) throw Object.assign(new Error('다른 쿠팡 판매자 상품은 변경할 수 없습니다.'), { status:403 });
  try {
    const result = await client.request('PUT', '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products', {}, { body:product });
    const verified = await getProductDetail(sellerProductId);
    return { response:map.sanitize(result.data), product:verified };
  } catch (error) {
    throw normalizeCoupangError(error);
  }
}

async function executeOrderAction(action, input, options = {}) {
  const config = configModule.getConfig();
  const shipmentBoxId = numericId(input.shipmentBoxId, '묶음배송번호');
  const orderId = numericId(input.orderId, '주문번호');
  const audit = options.audit || await auditStart(action, 'ORDER', shipmentBoxId, input);
  const manageAudit = !options.audit;
  try {
    let result;
    if (action === 'ACKNOWLEDGE') {
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/ordersheets/acknowledgement`;
      const rawBody = `{"vendorId":${JSON.stringify(config.vendorId)},"shipmentBoxIds":[${shipmentBoxId}]}`;
      result = await client.request('PATCH', path, {}, { rawBody });
    } else if (action === 'UPLOAD_INVOICE') {
      const invoiceNumber = text(input.invoiceNumber);
      const deliveryCompanyCode = text(input.deliveryCompanyCode);
      if (!/^\d{6,30}$/.test(invoiceNumber)) throw Object.assign(new Error('송장번호는 하이픈 없이 숫자 6~30자리로 입력해주세요.'), { status: 400 });
      if (!/^[A-Z0-9_]{2,20}$/.test(deliveryCompanyCode)) throw Object.assign(new Error('택배사 코드를 선택해주세요.'), { status: 400 });
      const vendorItemIds = [...new Set((input.vendorItemIds || []).map(value => numericId(value, '옵션 ID')))];
      if (!vendorItemIds.length) throw Object.assign(new Error('송장을 적용할 상품 옵션이 없습니다.'), { status: 400 });
      const current=await refreshSellerOrder(shipmentBoxId,audit.db);
      if(orderHasInvoice(current,invoiceNumber)) {
        const reused={code:'ALREADY_REGISTERED',message:'같은 송장번호가 쿠팡에 이미 등록되어 전송을 반복하지 않았습니다.'};
        if(manageAudit)await auditFinish(audit,'SUCCESS',reused);
        return {requestId:audit.id,response:reused,order:publicOrderDetail(current),reused:true};
      }
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/orders/invoices`;
      const body = {
        vendorId: config.vendorId,
        orderSheetInvoiceApplyDtos: vendorItemIds.map(vendorItemId => ({ shipmentBoxId, orderId, vendorItemId, deliveryCompanyCode, invoiceNumber, splitShipping: false, preSplitShipped: false, estimatedShippingDate: '' }))
      };
      result = await client.request('POST', path, {}, { rawBody: exactNumericJson(body, new Set(['shipmentBoxId','orderId','vendorItemId'])) });
    } else {
      throw Object.assign(new Error('지원하지 않는 주문 작업입니다.'), { status: 400 });
    }
    const refreshed = await refreshSellerOrder(shipmentBoxId, audit.db);
    if (manageAudit) await auditFinish(audit, 'SUCCESS', result.data);
    return { requestId: audit.id, response: result.data, order: publicOrderDetail(refreshed) };
  } catch (error) {
    if (manageAudit) await auditFinish(audit, 'FAILED', error.response, error.message);
    throw normalizeCoupangError(error);
  }
}

async function executeCsAction(action, input, options = {}) {
  const config = configModule.getConfig();
  const inquiryId = numericId(input.inquiryId, '문의번호');
  const replyBy = text(input.replyBy);
  if (!replyBy) throw Object.assign(new Error('쿠팡 Wing 사용자 ID를 입력해주세요.'), { status: 400 });
  const audit = options.audit || await auditStart(action, 'INQUIRY', inquiryId, input);
  const manageAudit = !options.audit;
  try {
    let path; let body;
    if (action === 'REPLY_ONLINE') {
      const content = text(input.content);
      if (content.length < 2 || content.length > 1000) throw Object.assign(new Error('답변은 2~1,000자로 입력해주세요.'), { status: 400 });
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/onlineInquiries/${inquiryId}/replies`;
      body = { content, vendorId: config.vendorId, replyBy };
    } else if (action === 'REPLY_CALL_CENTER') {
      const content = text(input.content);
      const parentAnswerId = numericId(input.parentAnswerId, '부모 답변번호');
      if (content.length < 2 || content.length > 1000) throw Object.assign(new Error('답변은 2~1,000자로 입력해주세요.'), { status: 400 });
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/callCenterInquiries/${inquiryId}/replies`;
      body = { vendorId: config.vendorId, inquiryId: String(inquiryId), content, replyBy, parentAnswerId };
    } else if (action === 'CONFIRM_CALL_CENTER') {
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/callCenterInquiries/${inquiryId}/confirms`;
      body = { confirmBy: replyBy };
    } else throw Object.assign(new Error('지원하지 않는 CS 작업입니다.'), { status: 400 });
    const result = await client.request('POST', path, {}, { body });
    if (manageAudit) await auditFinish(audit, 'SUCCESS', result.data);
    return { requestId: audit.id, response: result.data };
  } catch (error) {
    if (manageAudit) await auditFinish(audit, 'FAILED', error.response, error.message);
    throw normalizeCoupangError(error);
  }
}

async function caseRecord(db, type, id) {
  const table = type === 'RETURN' ? 'coupang_returns' : 'coupang_exchanges';
  const key = type === 'RETURN' ? 'receipt_id' : 'exchange_id';
  const result = await db.from(table).select(`${key},status,raw_data`).eq(key, id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw Object.assign(new Error(`${type === 'RETURN' ? '반품' : '교환'} 접수정보를 찾지 못했습니다.`), { status: 404 });
  return result.data;
}

function caseInvoice(input) {
  const deliveryCompanyCode = text(input.deliveryCompanyCode);
  const invoiceNumber = text(input.invoiceNumber);
  if (!/^[A-Z0-9_]{2,20}$/.test(deliveryCompanyCode)) throw Object.assign(new Error('택배사를 선택해주세요.'), { status: 400 });
  if (!/^\d{6,30}$/.test(invoiceNumber)) throw Object.assign(new Error('송장번호는 숫자 6~30자리로 입력해주세요.'), { status: 400 });
  return { deliveryCompanyCode, invoiceNumber };
}

async function executeCaseAction(action, input, options = {}) {
  const config = configModule.getConfig();
  const isReturn = action.startsWith('RETURN_');
  const targetType = isReturn ? 'RETURN' : 'EXCHANGE';
  const targetId = numericId(isReturn ? input.receiptId : input.exchangeId, isReturn ? '반품 접수번호' : '교환 접수번호');
  const audit = options.audit || await auditStart(action, targetType, targetId, input);
  const manageAudit = !options.audit;
  try {
    const record = await caseRecord(audit.db, targetType, targetId);
    const raw = record.raw_data || {};
    let method = 'PATCH'; let path; let rawBody;

    if (action === 'RETURN_RECEIVE') {
      if (record.status !== 'RETURNS_UNCHECKED') throw Object.assign(new Error('반품접수 상태에서만 입고확인할 수 있습니다.'), { status: 409 });
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/returnRequests/${targetId}/receiveConfirmation`;
      rawBody = exactNumericJson({ vendorId: config.vendorId, receiptId: targetId }, new Set(['receiptId']));
    } else if (action === 'RETURN_APPROVE') {
      if (record.status !== 'VENDOR_WAREHOUSE_CONFIRM') throw Object.assign(new Error('입고완료 상태에서만 반품 승인할 수 있습니다.'), { status: 409 });
      const cancelCount = Number(raw.cancelCountSum || (raw.returnItems || []).reduce((sum, item) => sum + Number(item.cancelCount || item.cancelCountSum || 0), 0));
      if (!Number.isInteger(cancelCount) || cancelCount < 1) throw Object.assign(new Error('반품 승인 수량을 확인할 수 없습니다. 다시 동기화해주세요.'), { status: 409 });
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/returnRequests/${targetId}/approval`;
      rawBody = exactNumericJson({ vendorId: config.vendorId, receiptId: targetId, cancelCount }, new Set(['receiptId']));
    } else if (action === 'RETURN_PICKUP_INVOICE' || action === 'EXCHANGE_PICKUP_INVOICE') {
      method = 'POST';
      const invoice = caseInvoice(input);
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/return-exchange-invoices/manual`;
      rawBody = exactNumericJson({ returnExchangeDeliveryType: isReturn ? 'RETURN' : 'EXCHANGE', receiptId: targetId, ...invoice, regNumber: text(input.regNumber) }, new Set(['receiptId']));
    } else if (action === 'EXCHANGE_RECEIVE') {
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/exchangeRequests/${targetId}/receiveConfirmation`;
      rawBody = exactNumericJson({ exchangeId: targetId, vendorId: config.vendorId }, new Set(['exchangeId']));
    } else if (action === 'EXCHANGE_REJECT') {
      const exchangeRejectCode = text(input.exchangeRejectCode);
      if (!['SOLDOUT', 'WITHDRAW'].includes(exchangeRejectCode)) throw Object.assign(new Error('교환 거부 사유를 선택해주세요.'), { status: 400 });
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/exchangeRequests/${targetId}/rejection`;
      rawBody = exactNumericJson({ exchangeId: targetId, exchangeRejectCode, vendorId: config.vendorId }, new Set(['exchangeId']));
    } else if (action === 'EXCHANGE_SHIPPING_INVOICE') {
      method = 'POST';
      const invoice = caseInvoice(input);
      const shipmentBoxId = numericId(input.shipmentBoxId, '교환 배송번호');
      path = `/v2/providers/openapi/apis/api/v4/vendors/${encodeURIComponent(config.vendorId)}/exchangeRequests/${targetId}/invoices`;
      rawBody = exactNumericJson([{ exchangeId: targetId, vendorId: config.vendorId, shipmentBoxId, goodsDeliveryCode: invoice.deliveryCompanyCode, invoiceNumber: invoice.invoiceNumber }], new Set(['exchangeId', 'shipmentBoxId']));
    } else throw Object.assign(new Error('지원하지 않는 반품·교환 작업입니다.'), { status: 400 });

    const result = await client.request(method, path, {}, { rawBody });
    if (manageAudit) await auditFinish(audit, 'SUCCESS', result.data);
    return { requestId: audit.id, response: result.data };
  } catch (error) {
    const normalized = normalizeCoupangError(error);
    if (manageAudit) await auditFinish(audit, 'FAILED', normalized.response || error.response, normalized.message);
    throw normalized;
  }
}

module.exports = { snapshotHash, orderHasInvoice, getProductDetail, executeProductAction, getOrderDetail, executeOrderAction, executeCsAction, executeCaseAction, normalizeCoupangError };
