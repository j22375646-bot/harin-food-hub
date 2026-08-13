'use strict';

const number = value => value == null || value === '' ? null : Number(String(value).replace(/,/g, ''));
const bool = value => value == null ? null : ['T', 'true', '1', true, 1].includes(value);

function product(p) {
  return {
    external_product_no: String(p.product_no), product_name: p.product_name,
    price: number(p.price), display: bool(p.display), selling: bool(p.selling),
    category_no: p.category_no == null ? null : String(p.category_no),
    source_updated_at: p.updated_date || p.updated_at || null, raw_data: p
  };
}

function order(o) {
  return {
    order_id: String(o.order_id), order_date: o.order_date || o.created_date || null,
    customer_id: o.member_id || o.customer_id || null, payment_status: o.payment_status || o.order_status || null,
    order_price: number(o.order_price_amount?.order_price ?? o.actual_order_amount?.order_price ?? o.order_price),
    paid_amount: number(o.actual_payment_amount ?? o.paid_amount ?? o.payment_amount ?? o.actual_order_amount?.payment_amount),
    discount_amount: number(o.order_price_amount?.total_discount_price ?? o.discount_amount),
    shipping_fee: number(o.order_price_amount?.shipping_fee ?? o.shipping_fee),
    cancel_amount: number(o.cancel_amount), refund_amount: number(o.refund_amount),
    currency: o.currency || 'KRW', raw_data: o
  };
}

function item(orderId, i, index) {
  const externalId = i.order_item_code || i.variant_code || `${i.product_no || 'unknown'}-${index}`;
  return {
    order_id: String(orderId), external_item_id: String(externalId),
    external_product_no: i.product_no == null ? null : String(i.product_no), product_name: i.product_name || '(unknown)',
    quantity: number(i.quantity) ?? 1, unit_price: number(i.product_price ?? i.unit_price),
    paid_amount: number(i.payment_amount ?? i.paid_amount), option_name: i.option_value || i.option_name || null, raw_data: i
  };
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const value of Object.values(payload || {})) if (Array.isArray(value)) return value;
  return [];
}

module.exports = { product, order, item, rows, number };
