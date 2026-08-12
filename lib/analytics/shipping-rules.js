'use strict';

const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const RETURN_COST_TYPES = new Set(['RETURN_PICKUP', 'RETURN_RESTOCKING', 'RETURN_HANDLING', 'RETURN_SHIPPING']);

function normalizeShippingRule(rule = {}) {
  return {
    platform:String(rule.platform || ''),
    return_shipping_cost:Math.max(0, number(rule.return_shipping_cost)),
    return_rate:Math.min(1, Math.max(0, number(rule.return_rate))),
    remote_area_surcharge:Math.max(0, number(rule.remote_area_surcharge)),
    remote_area_rate:Math.min(1, Math.max(0, number(rule.remote_area_rate)))
  };
}

function calculateShippingReserve({ orders = 0, rule = {} } = {}) {
  const normalized = normalizeShippingRule(rule);
  const orderCount = Math.max(0, number(orders));
  const returnReserve = orderCount * normalized.return_shipping_cost * normalized.return_rate;
  const remoteAreaReserve = orderCount * normalized.remote_area_surcharge * normalized.remote_area_rate;
  return {
    orders:orderCount,
    return_reserve:round(returnReserve),
    remote_area_reserve:round(remoteAreaReserve),
    total_reserve:round(returnReserve + remoteAreaReserve),
    reserve_per_order:round(normalized.return_shipping_cost * normalized.return_rate + normalized.remote_area_surcharge * normalized.remote_area_rate)
  };
}

function buildCoupangShippingEvidence({ returns = [], costTransactions = [] } = {}) {
  const returnRows = costTransactions.filter(row => RETURN_COST_TYPES.has(row.source_type));
  const shippingRows = costTransactions.filter(row => row.source_type === 'SHIPPING' && row.order_id);
  const returnCases = new Set(returns.map(row => String(row.receipt_id || row.order_id || '')).filter(Boolean)).size;
  const returnCostOrders = new Set(returnRows.map(row => String(row.order_id || row.reference_id || '')).filter(Boolean)).size;
  const actualReturnCost = Math.max(0, returnRows.reduce((sum,row)=>sum+number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount),0));
  const remoteRows = shippingRows.filter(row => number(row.raw_data?.additional_cost) > 0);
  const remoteOrders = new Set(remoteRows.map(row => String(row.order_id))).size;
  const shippingOrders = new Set(shippingRows.map(row => String(row.order_id))).size;
  const actualRemoteCost = remoteRows.reduce((sum,row)=>sum+number(row.raw_data?.additional_cost),0);
  return {
    return_cases:returnCases,
    return_cost_orders:returnCostOrders,
    actual_return_cost:round(actualReturnCost),
    actual_return_cost_per_case:returnCostOrders && actualReturnCost > 0 ? round(actualReturnCost / returnCostOrders) : null,
    return_confidence:returnCostOrders >= 20 && actualReturnCost > 0 ? 'MEDIUM' : 'LOW',
    shipping_orders:shippingOrders,
    remote_orders:remoteOrders,
    actual_remote_cost:round(actualRemoteCost),
    observed_remote_rate:shippingOrders ? round(remoteOrders / shippingOrders * 100) : null,
    remote_confidence:remoteOrders >= 20 && actualRemoteCost > 0 ? 'MEDIUM' : 'LOW',
    privacy_basis:'AGGREGATED_COST_ONLY'
  };
}

module.exports = { RETURN_COST_TYPES, normalizeShippingRule, calculateShippingReserve, buildCoupangShippingEvidence };
