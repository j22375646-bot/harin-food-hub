'use strict';

const num = value => Number(value || 0);
const round = value => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const shippingRules = require('./shipping-rules.js');
const financialTrust = require('./financial-trust.js');

function calculateProfitability({ items = [], productLinks = [], productCosts = [], channelSetting = {}, shippingRule = {}, adSpend = 0 } = {}) {
  const linkByExternalId = new Map(productLinks.map(row => [String(row.external_product_id), row.master_product_id]));
  const costByMasterId = new Map(productCosts.map(row => [row.master_product_id, row]));
  const commissionRate = num(channelSetting.commission_rate);
  const paymentFeeRate = num(channelSetting.payment_fee_rate);
  const shippingPerOrder = num(channelSetting.default_shipping_cost);
  const reservePerOrder = shippingRules.calculateShippingReserve({ orders:1, rule:shippingRule });
  const orders = new Map();

  for (const item of items) {
    const orderId = String(item.order_id || 'UNKNOWN');
    const revenue = num(item.paid_amount ?? num(item.unit_price) * num(item.quantity));
    const order = orders.get(orderId) || { revenue: 0, items: [] };
    order.revenue += revenue;
    order.items.push({ ...item, revenue });
    orders.set(orderId, order);
  }

  const productMap = new Map();
  let revenue = 0, productCost = 0, fees = 0, baseShippingCost = 0, returnReserve = 0, remoteAreaReserve = 0, shippingCost = 0, coveredRevenue = 0;
  for (const order of orders.values()) {
    for (const item of order.items) {
      const quantity = num(item.quantity);
      const masterProductId = linkByExternalId.get(String(item.external_product_no || '')) || null;
      const cost = masterProductId ? costByMasterId.get(masterProductId) : null;
      const unitCost = cost ? num(cost.unit_cost) + num(cost.packaging_cost) + num(cost.other_unit_cost) : 0;
      const itemProductCost = unitCost * quantity;
      const itemFees = item.revenue * (commissionRate + paymentFeeRate);
      const allocation = order.revenue > 0 ? item.revenue / order.revenue : 0;
      const itemBaseShipping = shippingPerOrder * allocation;
      const itemReturnReserve = reservePerOrder.return_reserve * allocation;
      const itemRemoteAreaReserve = reservePerOrder.remote_area_reserve * allocation;
      const itemShipping = itemBaseShipping + itemReturnReserve + itemRemoteAreaReserve;
      const key = masterProductId || `unmapped:${item.product_name || item.external_product_no || 'unknown'}`;
      const row = productMap.get(key) || { master_product_id: masterProductId, name: item.product_name || '상품명 없음', revenue: 0, quantity: 0, product_cost: 0, fees: 0, base_shipping_cost:0, return_reserve:0, remote_area_reserve:0, shipping_cost: 0, cost_configured: Boolean(cost) };
      row.revenue += item.revenue; row.quantity += quantity; row.product_cost += itemProductCost; row.fees += itemFees; row.base_shipping_cost += itemBaseShipping; row.return_reserve += itemReturnReserve; row.remote_area_reserve += itemRemoteAreaReserve; row.shipping_cost += itemShipping;
      row.cost_configured = row.cost_configured && Boolean(cost);
      productMap.set(key, row);
      revenue += item.revenue; productCost += itemProductCost; fees += itemFees; baseShippingCost += itemBaseShipping; returnReserve += itemReturnReserve; remoteAreaReserve += itemRemoteAreaReserve; shippingCost += itemShipping;
      if (cost) coveredRevenue += item.revenue;
    }
  }

  const products = [...productMap.values()].map(row => {
    const contributionBeforeAds = row.revenue - row.product_cost - row.fees - row.shipping_cost;
    const marginRate = row.cost_configured && row.revenue ? contributionBeforeAds / row.revenue : null;
    return { ...row, revenue: round(row.revenue), product_cost: round(row.product_cost), fees: round(row.fees), base_shipping_cost:round(row.base_shipping_cost), return_reserve:round(row.return_reserve), remote_area_reserve:round(row.remote_area_reserve), shipping_cost: round(row.shipping_cost), contribution_before_ads: row.cost_configured ? round(contributionBeforeAds) : null, contribution_margin_rate: marginRate == null ? null : round(marginRate * 100), break_even_roas: row.cost_configured && marginRate > 0 ? round(100 / marginRate) : null };
  }).sort((a, b) => b.revenue - a.revenue);
  const contributionBeforeAds = revenue - productCost - fees - shippingCost;
  const contributionProfit = contributionBeforeAds - num(adSpend);
  const marginRate = revenue ? contributionBeforeAds / revenue : null;
  // A lightweight overview can intentionally omit raw order rows. Keep that
  // state unknown instead of manufacturing a misleading 0% coverage result.
  const coverageRate = revenue ? coveredRevenue / revenue * 100 : null;
  const missingCostProducts = products.filter(row => !row.cost_configured);
  const result = {
    revenue: round(revenue), product_cost: round(productCost), fees: round(fees), base_shipping_cost:round(baseShippingCost), return_reserve:round(returnReserve), remote_area_reserve:round(remoteAreaReserve), shipping_cost: round(shippingCost), ad_spend: round(adSpend),
    contribution_before_ads: round(contributionBeforeAds), contribution_profit: round(contributionProfit), contribution_margin_rate: marginRate == null ? null : round(marginRate * 100),
    break_even_roas: coverageRate > 0 && marginRate > 0 ? round(100 / marginRate) : null, cost_coverage_rate: coverageRate == null ? null : round(coverageRate), cost_status: coverageRate == null ? 'NO_DATA' : coverageRate >= financialTrust.MIN_COST_COVERAGE_RATE ? 'COMPLETE' : coverageRate > 0 ? 'PARTIAL' : 'COST_DATA_REQUIRED',
    missing_cost_products: missingCostProducts.length,
    missing_cost_revenue: round(missingCostProducts.reduce((sum, row) => sum + num(row.revenue), 0)),
    products
  };
  return financialTrust.applyProfitabilityGate(result);
}

module.exports = { calculateProfitability };
