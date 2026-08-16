'use strict';

const crypto = require('node:crypto');
const PRIVATE_KEYS = /^(orderer|receiver|name|phone|phoneNumber|safeNumber|email|address|address2|postCode|shippingPlaceName|customerName|customerPhone|customerMobile|returnCustomerName|returnPhone|returnMobile|returnAddress|returnAddressDetail|deliveryCustomerName|deliveryPhone|deliveryMobile|deliveryAddress|deliveryAddressDetail|requesterName|requesterPhoneNumber|requesterRealPhoneNumber|requesterAddress|requesterAddressDetail|requesterZipCode|orderedByMobile|content|question|answer|reply|memo|extraMessage)$/i;
const number = value => {
  const candidate = value && typeof value === 'object' ? Number(value.units || 0) + Number(value.nanos || 0) / 1e9 : Number(value || 0);
  return Number.isFinite(candidate) ? candidate : 0;
};
const text = value => value == null ? null : String(value);
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const timestamp = value => {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d{11,}$/.test(String(value))) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return value;
};

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_KEYS.test(key))
    .map(([key, item]) => [key, sanitize(item)]));
}

function mapProduct(item) {
  return {
    seller_product_id: text(item.sellerProductId ?? item.seller_product_id),
    product_id: text(item.productId ?? item.product_id),
    product_name: item.sellerProductName || item.productName || item.product_name || '상품명 없음',
    status: text(item.statusName ?? item.status),
    brand: text(item.brand),
    sale_started_at: item.saleStartedAt || item.saleStartAt || null,
    sale_ended_at: item.saleEndedAt || item.saleEndAt || null,
    raw_data: sanitize(item),
    updated_at: new Date().toISOString()
  };
}

function mapProductDetailItems(detail) {
  const data = detail?.data || detail || {};
  return (data.items || []).flatMap((item, index) => {
    const rg = item.rocketGrowthItemData;
    const marketplace = item.marketplaceItemData;
    const vendorItemId = rg?.vendorItemId ?? marketplace?.vendorItemId ?? item.vendorItemId;
    if (!vendorItemId) return [];
    const price = rg?.priceData || marketplace?.priceData || item.priceData || {};
    return [{
      vendor_item_id: text(vendorItemId),
      seller_product_id: text(data.sellerProductId),
      item_name: [data.sellerProductName, item.itemName].filter(Boolean).join(' · ') || `RG item ${index + 1}`,
      sale_price: number(price.salePrice),
      status: text(data.statusName),
      raw_data: sanitize({
        productName: data.sellerProductName,
        displayProductName: data.displayProductName,
        itemName: item.itemName,
        sellerProductItemId: rg?.sellerProductItemId ?? marketplace?.sellerProductItemId ?? item.sellerProductItemId,
        itemId: rg?.itemId ?? marketplace?.itemId ?? item.itemId,
        vendorItemId,
        externalVendorSku: rg?.externalVendorSku ?? marketplace?.externalVendorSku ?? item.externalVendorSku,
        priceData: price,
        barcode: rg?.barcode ?? marketplace?.barcode ?? item.barcode,
        skuInfo: rg?.skuInfo ?? marketplace?.skuInfo ?? item.skuInfo,
        images:item.images || data.images || null,
        image:item.image || data.image || null,
        representativeImage:item.representativeImage || data.representativeImage || null,
      }),
      updated_at: new Date().toISOString()
    }];
  });
}

function mapOrder(order) {
  const items = order.orderItems || order.items || [];
  const shipmentBoxId = text(order.shipmentBoxId ?? order.shipment_box_id ?? order.orderId);
  const orderId = text(order.orderId ?? order.order_id ?? shipmentBoxId);
  const grossAmount = items.reduce((sum, item) => sum + number(item.orderPrice ?? item.salesPrice ?? item.unitPrice) * number(item.shippingCount ?? item.quantity ?? 1), 0);
  return {
    shipment_box_id: shipmentBoxId,
    order_id: orderId,
    ordered_at: order.orderedAt || order.orderDate || null,
    paid_at: order.paidAt || null,
    status: text(order.status ?? order.shipmentStatus),
    gross_amount: grossAmount,
    raw_data: sanitize(order),
    updated_at: new Date().toISOString()
  };
}

function mapOrderItems(order) {
  const shipmentBoxId = text(order.shipmentBoxId ?? order.shipment_box_id ?? order.orderId);
  const orderId = text(order.orderId ?? order.order_id ?? shipmentBoxId);
  return (order.orderItems || order.items || []).map((item, index) => {
    const vendorItemId = text(item.vendorItemId ?? item.vendor_item_id);
    const quantity = number(item.shippingCount ?? item.quantity ?? 1);
    const unitPrice = number(item.orderPrice ?? item.salesPrice ?? item.unitPrice);
    return {
      external_item_key: hash(`${shipmentBoxId}:${vendorItemId || index}:${item.orderItemId || index}`),
      shipment_box_id: shipmentBoxId,
      order_id: orderId,
      vendor_item_id: vendorItemId,
      seller_product_id: text(item.sellerProductId ?? item.seller_product_id),
      product_name: item.vendorItemName || item.productName || item.sellerProductName || '상품명 없음',
      quantity,
      unit_price: unitPrice,
      paid_amount: unitPrice * quantity,
      status: text(item.status ?? order.status ?? order.shipmentStatus),
      raw_data: sanitize(item),
      updated_at: new Date().toISOString()
    };
  });
}

function mapSettlementRows(entry) {
  const items = entry.items || entry.orderItems || [entry];
  return items.map((item, index) => {
    const orderId = text(item.orderId ?? entry.orderId);
    const vendorItemId = text(item.vendorItemId ?? entry.vendorItemId);
    const recognitionDate = String(item.recognitionDate ?? entry.recognitionDate ?? '').slice(0, 10);
    const saleType = text(item.saleType ?? entry.saleType);
    return {
      settlement_key: hash(`${orderId}:${vendorItemId || index}:${recognitionDate}:${saleType}:${item.settlementAmount ?? item.saleAmount ?? index}`),
      order_id: orderId,
      vendor_item_id: vendorItemId,
      sale_type: saleType,
      recognition_date: recognitionDate,
      settlement_date: String(item.settlementDate ?? entry.settlementDate ?? '').slice(0, 10) || null,
      sale_amount: number(item.saleAmount),
      service_fee: number(item.serviceFee),
      service_fee_vat: number(item.serviceFeeVat ?? item.serviceFeeVAT),
      settlement_amount: number(item.settlementAmount),
      quantity: number(item.quantity ?? item.saleCount),
      raw_data: sanitize({ ...entry, items: undefined, item }),
      updated_at: new Date().toISOString()
    };
  }).filter(item => item.recognition_date);
}

function inventoryStatus(quantity, salesLast30Days) {
  quantity = number(quantity); salesLast30Days = number(salesLast30Days);
  if (quantity <= 0) return { averageDailySales: salesLast30Days / 30, daysOfStock: 0, status: 'OUT_OF_STOCK' };
  if (salesLast30Days <= 0) return { averageDailySales: 0, daysOfStock: null, status: 'OVERSTOCK' };
  const averageDailySales = salesLast30Days / 30;
  const daysOfStock = quantity / averageDailySales;
  const status = daysOfStock < 7 ? 'CRITICAL' : daysOfStock < 14 ? 'LOW' : daysOfStock <= 60 ? 'HEALTHY' : 'OVERSTOCK';
  return { averageDailySales, daysOfStock, status };
}

function mapRocketGrowthInventory(item, now = new Date()) {
  const vendorItemId = text(item.vendorItemId ?? item.vendor_item_id);
  const quantity = Math.max(0, Math.round(number(item.inventoryDetails?.totalOrderableQuantity ?? item.totalOrderableQuantity)));
  const salesLast30Days = Math.max(0, Math.round(number(item.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS ?? item.salesLast30Days)));
  const calculated = inventoryStatus(quantity, salesLast30Days);
  return {
    vendor_item_id: vendorItemId,
    external_sku_id: text(item.externalSkuId ?? item.external_sku_id),
    total_orderable_quantity: quantity,
    sales_last_30_days: salesLast30Days,
    average_daily_sales: calculated.averageDailySales,
    days_of_stock: calculated.daysOfStock,
    stock_status: calculated.status,
    raw_data: sanitize(item),
    snapshot_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

function mapRocketGrowthOrder(order) {
  const items = order.orderItems || order.items || order.orderItemDtoList || [];
  const orderId = text(order.orderId ?? order.id);
  const itemAmount = item => number(item.amount ?? item.orderPrice ?? item.unitPrice ?? item.unitSalesPrice ?? item.salesPrice) * number(item.quantity ?? item.shippingCount ?? item.salesQuantity ?? 1);
  return {
    order: {
      order_id: orderId,
      status: text(order.status ?? order.orderStatus ?? order.deliveryStatus),
      paid_at: timestamp(order.paidAt || order.paidDate || order.paymentDate),
      shipped_at: timestamp(order.shippedAt || order.shippedDate || order.deliveryDate),
      total_amount: number(order.totalAmount ?? order.orderAmount ?? order.paymentAmount ?? items.reduce((sum, item) => sum + itemAmount(item), 0)),
      item_count: items.length,
      raw_data: sanitize(order), updated_at: new Date().toISOString()
    },
    items: items.map((item, index) => ({
      external_item_key: hash(`RG:${orderId}:${item.orderItemId ?? item.vendorItemId ?? index}`),
      order_id: orderId,
      vendor_item_id: text(item.vendorItemId), external_sku_id: text(item.externalSkuId ?? item.externalVendorSku),
      product_name: item.vendorItemName || item.productName || item.sellerProductName || '상품명 없음',
      quantity: number(item.quantity ?? item.shippingCount ?? item.salesQuantity ?? 1),
      amount: itemAmount(item),
      raw_data: sanitize(item), updated_at: new Date().toISOString()
    }))
  };
}

function mapReturn(item) {
  return {
    receipt_id: text(item.receiptId ?? item.returnId ?? item.cancelId), order_id: text(item.orderId),
    status: text(item.receiptStatus ?? item.returnStatus ?? item.status), cancel_type: text(item.cancelType),
    reason_code: text(item.reasonCode), reason_text: text(item.reasonCodeText ?? item.reason), fault_type: text(item.faultType),
    requested_at: item.createdAt || item.requestedAt || null,
    amount: number(item.returnAmount ?? item.cancelAmount ?? item.refundAmount), raw_data: sanitize(item), updated_at: new Date().toISOString()
  };
}

function mapExchange(item) {
  const items = item.exchangeItemDtoV1s || item.items || [];
  return {
    exchange_id: text(item.exchangeId), order_id: text(item.orderId), status: text(item.exchangeStatus ?? item.status),
    reason_code: text(item.reasonCode), reason_text: text(item.reasonCodeText ?? item.reason), fault_type: text(item.faultType),
    requested_at: item.createdAt || null, amount: number(item.exchangeAmount), item_count: items.length,
    raw_data: sanitize(item), updated_at: new Date().toISOString()
  };
}

function mapInquiry(item, type) {
  const inquiryId = text(item.inquiryId ?? item.id);
  const status = text(item.inquiryStatus ?? item.status ?? item.answeredType);
  return {
    inquiry_key: `${type}:${inquiryId}`, inquiry_type: type, inquiry_id: inquiryId, status,
    answered: Boolean(item.answered ?? (/answer|complete|done|closed/i.test(status || '') || (item.commentDtoList || []).length > 0)),
    product_id: text(item.productId), seller_product_id: text(item.sellerProductId), vendor_item_id: text(item.vendorItemId),
    order_id: text(Array.isArray(item.orderIds) ? item.orderIds[0] : item.orderId),
    question_text: text(item.content ?? item.question ?? item.inquiryContent ?? item.title),
    parent_answer_id: text(item.parentAnswerId ?? item.answerId ?? item.transferAnswerId),
    inquired_at: item.inquiryAt || item.createdAt || null, raw_data: sanitize(item), updated_at: new Date().toISOString()
  };
}

function mapItemInventory(item, vendorItemId) {
  const data = item?.data && !Array.isArray(item.data) ? item.data : item;
  return {
    vendor_item_id: text(data.vendorItemId ?? vendorItemId), quantity: number(data.amountInStock ?? data.quantity ?? data.stockQuantity),
    sale_price: number(data.salePrice ?? data.price), original_price: number(data.originalPrice),
    status: text(data.salesStatus ?? data.status), external_sku_id: text(data.externalVendorSkuCode ?? data.externalSkuId),
    raw_data: sanitize(data), checked_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
}

function mapSettlementSummary(item, month) {
  const key = hash(`${month}:${item.settlementType}:${item.settlementDate}:${item.revenueRecognitionDateFrom}:${item.revenueRecognitionDateTo}`);
  return {
    summary_key: key, recognition_month: month, settlement_type: text(item.settlementType), settlement_date: item.settlementDate || null,
    status: text(item.status), total_sale: number(item.totalSale), service_fee: number(item.serviceFee),
    settlement_target_amount: number(item.settlementTargetAmount), settlement_amount: number(item.settlementAmount),
    last_amount: number(item.lastAmount), pending_released_amount: number(item.pendingReleasedAmount), final_amount: number(item.finalAmount),
    seller_discount_coupon: number(item.sellerDiscountCoupon), downloadable_coupon: number(item.downloadableCoupon),
    raw_data: sanitize(item), updated_at: new Date().toISOString()
  };
}

function mapShippingCenter(item, type) {
  const code = text(item.outboundShippingPlaceCode ?? item.returnCenterCode ?? item.shippingPlaceCode ?? item.centerCode ?? item.id);
  return { center_key: `${type}:${code}`, center_type: type, center_code: code, center_name: item.shippingPlaceName || item.returnCenterName || item.centerName || null, usable: item.usable ?? item.isActive ?? null, raw_data: sanitize(item), updated_at: new Date().toISOString() };
}

function mapBudget(item, index = 0) {
  const key = text(item.budgetId ?? item.contractId ?? item.id ?? hash(JSON.stringify(sanitize(item)) + index));
  const budgetAmount = number(item.totalBudgetAmount ?? item.budgetAmount ?? item.totalBudget);
  const usedAmount = number(item.usedBudgetAmount ?? item.usedAmount ?? item.spentAmount);
  return { budget_key: key, contract_id: text(item.contractId), status: text(item.status), budget_amount: budgetAmount, used_amount: usedAmount, remaining_amount: number(item.remainingAmount ?? item.availableAmount ?? Math.max(0, budgetAmount - usedAmount)), raw_data: sanitize(item), checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

function mapBrand(item) {
  return { brand_id: text(item.brandId ?? item.id), name: item.brandName || item.name || null, status: text(item.status), raw_data: sanitize(item), updated_at: new Date().toISOString() };
}

module.exports = { sanitize, mapProduct, mapProductDetailItems, mapOrder, mapOrderItems, mapSettlementRows, inventoryStatus, mapRocketGrowthInventory, mapRocketGrowthOrder, mapReturn, mapExchange, mapInquiry, mapItemInventory, mapSettlementSummary, mapShippingCenter, mapBudget, mapBrand };
