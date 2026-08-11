'use strict';

const num = value => Number(value || 0);
const round = value => Math.round((num(value) + Number.EPSILON) * 100) / 100;

function calculateProfitability({ items = [], productLinks = [], productCosts = [], channelSetting = {}, adSpend = 0 } = {}) {
  const linkByExternalId = new Map(productLinks.map(row => [String(row.external_product_id), row.master_product_id]));
  const costByMasterId = new Map(productCosts.map(row => [row.master_product_id, row]));
  const commissionRate = num(channelSetting.commission_rate);
  const paymentFeeRate = num(channelSetting.payment_fee_rate);
  const shippingPerOrder = num(channelSetting.default_shipping_cost);
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
  let revenue = 0, productCost = 0, fees = 0, shippingCost = 0, coveredRevenue = 0;
  for (const order of orders.values()) {
    for (const item of order.items) {
      const quantity = num(item.quantity);
      const masterProductId = linkByExternalId.get(String(item.external_product_no || '')) || null;
      const cost = masterProductId ? costByMasterId.get(masterProductId) : null;
      const unitCost = cost ? num(cost.unit_cost) + num(cost.packaging_cost) + num(cost.other_unit_cost) : 0;
      const itemProductCost = unitCost * quantity;
      const itemFees = item.revenue * (commissionRate + paymentFeeRate);
      const itemShipping = order.revenue > 0 ? shippingPerOrder * item.revenue / order.revenue : 0;
      const key = masterProductId || `unmapped:${item.product_name || item.external_product_no || 'unknown'}`;
      const row = productMap.get(key) || { master_product_id: masterProductId, name: item.product_name || '상품명 없음', revenue: 0, quantity: 0, product_cost: 0, fees: 0, shipping_cost: 0, cost_configured: Boolean(cost) };
      row.revenue += item.revenue; row.quantity += quantity; row.product_cost += itemProductCost; row.fees += itemFees; row.shipping_cost += itemShipping;
      row.cost_configured = row.cost_configured && Boolean(cost);
      productMap.set(key, row);
      revenue += item.revenue; productCost += itemProductCost; fees += itemFees; shippingCost += itemShipping;
      if (cost) coveredRevenue += item.revenue;
    }
  }

  const products = [...productMap.values()].map(row => {
    const contributionBeforeAds = row.revenue - row.product_cost - row.fees - row.shipping_cost;
    const marginRate = row.revenue ? contributionBeforeAds / row.revenue : null;
    return { ...row, revenue: round(row.revenue), product_cost: round(row.product_cost), fees: round(row.fees), shipping_cost: round(row.shipping_cost), contribution_before_ads: round(contributionBeforeAds), contribution_margin_rate: marginRate == null ? null : round(marginRate * 100), break_even_roas: row.cost_configured && marginRate > 0 ? round(100 / marginRate) : null };
  }).sort((a, b) => b.revenue - a.revenue);
  const contributionBeforeAds = revenue - productCost - fees - shippingCost;
  const contributionProfit = contributionBeforeAds - num(adSpend);
  const marginRate = revenue ? contributionBeforeAds / revenue : null;
  const coverageRate = revenue ? coveredRevenue / revenue * 100 : 0;
  return {
    revenue: round(revenue), product_cost: round(productCost), fees: round(fees), shipping_cost: round(shippingCost), ad_spend: round(adSpend),
    contribution_before_ads: round(contributionBeforeAds), contribution_profit: round(contributionProfit), contribution_margin_rate: marginRate == null ? null : round(marginRate * 100),
    break_even_roas: coverageRate > 0 && marginRate > 0 ? round(100 / marginRate) : null, cost_coverage_rate: round(coverageRate), cost_status: coverageRate >= 99 ? 'COMPLETE' : coverageRate > 0 ? 'PARTIAL' : 'COST_DATA_REQUIRED', products
  };
}

module.exports = { calculateProfitability };
