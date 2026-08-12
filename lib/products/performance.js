'use strict';

const matcher = require('./matcher.js');

const number = value => Number(value || 0);
const emptyChannel = () => ({ revenue:0, ad_spend:0, orders:0, units:0, fees:0 });

function dateKey(value) { return String(value || '').slice(0, 10); }
function within(value, start, end) { const key = dateKey(value); return Boolean(key && key >= start && key <= end); }

function buildUnifiedProductPerformance({
  masterProducts = [], channelProducts = [], productCosts = [], channelCostSettings = [],
  periodStart, periodEnd, cafe24Orders = [], cafe24OrderItems = [],
  naverKeywords = [], naverKeywordStats = [], coupangOrders = [], coupangOrderItems = [],
  coupangProductItems = [], coupangRgOrders = [], coupangRgOrderItems = [], coupangAdKeywords = []
}) {
  const rows = new Map(masterProducts.map(master => [master.id, {
    master_product_id:master.id, name:master.name, channels:{ CAFE24:emptyChannel(), NAVER:emptyChannel(), COUPANG:emptyChannel() },
    revenue:0, ad_spend:0, orders:0, units:0, contribution_profit:0, roas:null, cost_status:'COST_DATA_REQUIRED'
  }]));
  const links = new Map(channelProducts.filter(item=>item.master_product_id).map(item=>[`${item.platform}:${item.external_product_id}`,item.master_product_id]));
  const orderDate = new Map(cafe24Orders.map(item=>[String(item.order_id),item.order_date]));
  const cafeOrderSets = new Map();
  for (const item of cafe24OrderItems) {
    if (!within(orderDate.get(String(item.order_id)), periodStart, periodEnd)) continue;
    const masterId = links.get(`CAFE24:${item.external_product_no}`), row = rows.get(masterId);
    if (!row) continue;
    const channel = row.channels.CAFE24;
    channel.revenue += number(item.paid_amount ?? item.unit_price * item.quantity);
    channel.units += number(item.quantity);
    if (!cafeOrderSets.has(masterId)) cafeOrderSets.set(masterId,new Set());
    cafeOrderSets.get(masterId).add(String(item.order_id));
  }
  for (const [masterId,set] of cafeOrderSets) rows.get(masterId).channels.CAFE24.orders = set.size;

  const keywordGroup = new Map(naverKeywords.map(item=>[String(item.ncc_keyword_id),String(item.ncc_adgroup_id)]));
  for (const item of naverKeywordStats) {
    const groupId = keywordGroup.get(String(item.ncc_keyword_id));
    const masterId = links.get(`NAVER:${groupId}`), row = rows.get(masterId);
    if (!row) continue;
    const channel = row.channels.NAVER;
    channel.revenue += number(item.conversion_revenue);
    channel.ad_spend += number(item.cost);
    channel.orders += number(item.conversions);
    channel.units += number(item.conversions);
  }

  const rgOrderIds = new Set(coupangRgOrders.map(item=>String(item.order_id)));
  const sellerOrderDate = new Map(coupangOrders.map(item=>[String(item.order_id),item.paid_at || item.ordered_at]));
  const coupangOrderSets = new Map();
  for (const item of coupangOrderItems) {
    if (rgOrderIds.has(String(item.order_id)) || !within(sellerOrderDate.get(String(item.order_id)),periodStart,periodEnd)) continue;
    const masterId = links.get(`COUPANG:${item.seller_product_id}`), row = rows.get(masterId);
    if (!row) continue;
    const channel = row.channels.COUPANG;
    channel.revenue += number(item.paid_amount ?? item.unit_price * item.quantity);
    channel.units += number(item.quantity);
    if (!coupangOrderSets.has(masterId)) coupangOrderSets.set(masterId,new Set());
    coupangOrderSets.get(masterId).add(String(item.order_id));
  }
  const vendorSeller = new Map(coupangProductItems.map(item=>[String(item.vendor_item_id),String(item.seller_product_id || '')]));
  const rgOrderDate = new Map(coupangRgOrders.map(item=>[String(item.order_id),item.paid_at]));
  for (const item of coupangRgOrderItems) {
    if (!within(rgOrderDate.get(String(item.order_id)),periodStart,periodEnd)) continue;
    const masterId = links.get(`COUPANG:${vendorSeller.get(String(item.vendor_item_id))}`), row = rows.get(masterId);
    if (!row) continue;
    const channel = row.channels.COUPANG;
    channel.revenue += number(item.amount);
    channel.units += number(item.quantity);
    if (!coupangOrderSets.has(masterId)) coupangOrderSets.set(masterId,new Set());
    coupangOrderSets.get(masterId).add(String(item.order_id));
  }
  for (const [masterId,set] of coupangOrderSets) rows.get(masterId).channels.COUPANG.orders = set.size;

  let unassignedCoupangAdSpend = 0, assignedCoupangAdSpend = 0;
  for (const item of coupangAdKeywords) {
    const ranked = matcher.rankCandidates(masterProducts,{name:item.keyword,selling_price:null},2);
    const best = ranked[0], margin = best ? best.score - (ranked[1]?.score || 0) : 0;
    if (!best || best.score < 0.72 || margin < 0.1) { unassignedCoupangAdSpend += number(item.ad_spend); continue; }
    const row = rows.get(best.master.id); if (!row) continue;
    row.channels.COUPANG.ad_spend += number(item.ad_spend);
    assignedCoupangAdSpend += number(item.ad_spend);
  }

  const costs = new Map(productCosts.map(item=>[item.master_product_id,item]));
  const settings = new Map(channelCostSettings.map(item=>[item.platform,item]));
  for (const row of rows.values()) {
    const cost = costs.get(row.master_product_id);
    let variableCosts = 0;
    for (const [platform,channel] of Object.entries(row.channels)) {
      const setting = settings.get(platform) || {};
      channel.fees = channel.revenue * (number(setting.commission_rate) + number(setting.payment_fee_rate)) + channel.orders * number(setting.default_shipping_cost);
      variableCosts += channel.fees;
    }
    row.revenue = Object.values(row.channels).reduce((sum,item)=>sum+item.revenue,0);
    row.ad_spend = Object.values(row.channels).reduce((sum,item)=>sum+item.ad_spend,0);
    row.orders = Object.values(row.channels).reduce((sum,item)=>sum+item.orders,0);
    row.units = Object.values(row.channels).reduce((sum,item)=>sum+item.units,0);
    row.roas = row.ad_spend > 0 ? row.revenue / row.ad_spend * 100 : null;
    if (cost && number(cost.unit_cost) + number(cost.packaging_cost) + number(cost.other_unit_cost) > 0) {
      const unitCost = number(cost.unit_cost) + number(cost.packaging_cost) + number(cost.other_unit_cost);
      row.contribution_profit = row.revenue - row.ad_spend - variableCosts - row.units * unitCost;
      row.cost_status = 'CALCULATED';
    }
    for (const channel of Object.values(row.channels)) {
      for (const key of ['revenue','ad_spend','fees']) channel[key] = Math.round(channel[key]);
    }
    for (const key of ['revenue','ad_spend','contribution_profit']) row[key] = Math.round(row[key]);
    if (row.roas != null) row.roas = Number(row.roas.toFixed(2));
  }
  const items = [...rows.values()].filter(item=>item.revenue || item.ad_spend || Object.values(item.channels).some(channel=>channel.orders)).sort((a,b)=>b.revenue-a.revenue);
  return {
    period_start:periodStart, period_end:periodEnd, items,
    summary:{
      mapped_products:new Set(channelProducts.filter(item=>item.master_product_id).map(item=>item.master_product_id)).size,
      active_products:items.length,
      revenue:items.reduce((sum,item)=>sum+item.revenue,0),
      ad_spend:items.reduce((sum,item)=>sum+item.ad_spend,0),
      contribution_profit:items.filter(item=>item.cost_status==='CALCULATED').reduce((sum,item)=>sum+item.contribution_profit,0),
      cost_covered_products:items.filter(item=>item.cost_status==='CALCULATED').length,
      coupang_ad_spend_assigned:Math.round(assignedCoupangAdSpend),
      coupang_ad_spend_unassigned:Math.round(unassignedCoupangAdSpend)
    }
  };
}

async function loadUnifiedProductPerformance({ db, periodStart, periodEnd, ...input }) {
  const [keywords, stats, coupangAds] = await Promise.all([
    db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id').limit(10000),
    db.from('naver_keyword_stats').select('ncc_keyword_id,cost,conversions,conversion_revenue').eq('period_start',periodStart).eq('period_end',periodEnd).limit(10000),
    db.from('coupang_ad_keyword_daily').select('keyword,ad_spend,date').gte('date',periodStart).lte('date',periodEnd).limit(5000)
  ]);
  const firstError = [keywords,stats,coupangAds].find(result=>result.error)?.error;
  if (firstError) throw firstError;
  return buildUnifiedProductPerformance({ ...input, periodStart, periodEnd, naverKeywords:keywords.data||[], naverKeywordStats:stats.data||[], coupangAdKeywords:coupangAds.data||[] });
}

module.exports = { buildUnifiedProductPerformance, loadUnifiedProductPerformance };
