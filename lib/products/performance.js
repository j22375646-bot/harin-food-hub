'use strict';

const matcher = require('./matcher.js');
const shippingRules = require('../analytics/shipping-rules.js');
const financialTrust = require('../analytics/financial-trust.js');
const {isProductCostReady}=require('../analytics/cost-readiness.js');
const {isCafe24StorefrontOrder}=require('../cafe24/order-origin.js');
const {isCancelledStatus}=require('../analytics/monthly-revenue.js');
const {seoulDateKey}=require('../analytics/financial-date.js');

const number = value => Number(value || 0);
const emptyChannel = () => ({ revenue:0, attributed_revenue:0, attributed_orders:0, ad_spend:0, orders:0, units:0, impressions:0, clicks:0, ad_evidence_status:'CHECK_REQUIRED', fees:0, platform_fees:0, shipping_cost:0, return_reserve:0, remote_area_reserve:0 });

function dateKey(value) { return seoulDateKey(value); }
function within(value, start, end) { const key = dateKey(value); return Boolean(key && key >= start && key <= end); }
function hasNaverCoverage(evidence,start,end){
 return evidence?.status==='SUCCESS'&&evidence.complete===true&&evidence.closed===true&&evidence.source==='NAVER_COMMERCE'
   &&evidence.basis==='PAYMENT_DATE'&&/^\d{4}-\d{2}-\d{2}$/.test(evidence.period_start||'')&&/^\d{4}-\d{2}-\d{2}$/.test(evidence.period_end||'')
   &&evidence.period_start<=start&&evidence.period_end>=end
   &&Number.isFinite(Date.parse(evidence.collected_at||''))&&Date.parse(evidence.collected_at)>Date.parse(`${evidence.period_end}T23:59:59.999+09:00`);
}

function buildUnifiedProductPerformance({
  masterProducts = [], channelProducts = [], productCosts = [], channelCostSettings = [], channelShippingRules = [],
  periodStart, periodEnd, cafe24Orders = [], cafe24OrderItems = [],
  naverKeywords = [], naverKeywordStats = [], naverOrders, naverOrderItems, naverCollectionEvidence, coupangOrders = [], coupangOrderItems = [],
  coupangProductItems = [], coupangRgOrders = [], coupangRgOrderItems = [], coupangAdKeywords = []
}) {
  const rows = new Map(masterProducts.map(master => [master.id, {
    master_product_id:master.id, name:master.name, channels:{ CAFE24:emptyChannel(), NAVER:emptyChannel(), COUPANG:emptyChannel() },
    revenue:0, ad_spend:0, orders:0, units:0, contribution_profit:null, roas:null, cost_status:'COST_DATA_REQUIRED'
  }]));
  const links = new Map(channelProducts.filter(item=>item.master_product_id).map(item=>[`${item.platform}:${item.external_product_id}`,item.master_product_id]));
  const orderDate = new Map(cafe24Orders.filter(item=>isCafe24StorefrontOrder(item)&&!isCancelledStatus(item.payment_status)).map(item=>[String(item.order_id),item.order_date]));
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

  const naverItemOrderIds=new Set((naverOrderItems||[]).map(item=>String(item.order_id)));
  const naverReady=Array.isArray(naverOrders)&&Array.isArray(naverOrderItems)
    &&hasNaverCoverage(naverCollectionEvidence,periodStart,periodEnd)
    &&naverOrders.filter(item=>!isCancelledStatus(item.status)&&within(item.payment_date||item.order_date,periodStart,periodEnd)).every(item=>naverItemOrderIds.has(String(item.order_id)));
  const naverRequired=channelProducts.some(item=>item.platform==='NAVER');
  const naverDates=new Map((naverOrders||[]).filter(item=>!isCancelledStatus(item.status)).map(item=>[String(item.order_id),item.payment_date||item.order_date]));
  const naverOrderSets=new Map();
  const seenNaverItems=new Set();
  for(const item of naverOrderItems||[]){
    if(isCancelledStatus(item.status))continue;
    if(item.product_order_id&&seenNaverItems.has(String(item.product_order_id)))continue;
    if(item.product_order_id)seenNaverItems.add(String(item.product_order_id));
    if(!within(naverDates.get(String(item.order_id)),periodStart,periodEnd))continue;
    const masterId=links.get(`NAVER:${item.product_id}`)||links.get(`NAVER:${item.original_product_id}`);
    const row=rows.get(masterId);
    if(!row)continue;
    row.channels.NAVER.revenue+=number(item.paid_amount??number(item.unit_price)*number(item.quantity));
    row.channels.NAVER.units+=number(item.quantity);
    if(!naverOrderSets.has(masterId))naverOrderSets.set(masterId,new Set());
    naverOrderSets.get(masterId).add(String(item.order_id));
  }
  for(const [masterId,set] of naverOrderSets)rows.get(masterId).channels.NAVER.orders=set.size;

  const keywordGroup = new Map(naverKeywords.map(item=>[String(item.ncc_keyword_id),String(item.ncc_adgroup_id)]));
  const incompleteAdMasters=new Set();
  for (const item of naverKeywordStats) {
    const groupId = keywordGroup.get(String(item.ncc_keyword_id));
    const masterId = links.get(`NAVER:${groupId}`), row = rows.get(masterId);
    if (!row) continue;
    const channel = row.channels.NAVER;
    if([item.impressions,item.clicks].some(value=>value==null||value===''||!Number.isFinite(Number(value))))incompleteAdMasters.add(masterId);
    channel.ad_evidence_status=incompleteAdMasters.has(masterId)?'CHECK_REQUIRED':'READY';
    channel.impressions += number(item.impressions);
    channel.clicks += number(item.clicks);
    channel.attributed_revenue += number(item.conversion_revenue);
    channel.ad_spend += number(item.cost);
    channel.attributed_orders += number(item.conversions);
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

  let unassignedCoupangAdSpend = 0, assignedCoupangAdSpend = 0, directlyAssignedCoupangAdSpend = 0;
  for (const item of coupangAdKeywords) {
    const directSellerId = vendorSeller.get(String(item.advertised_option_id || ''));
    const directMasterId = directSellerId ? links.get(`COUPANG:${directSellerId}`) : null;
    if (directMasterId && rows.has(directMasterId)) {
      rows.get(directMasterId).channels.COUPANG.ad_spend += number(item.ad_spend);
      assignedCoupangAdSpend += number(item.ad_spend);
      directlyAssignedCoupangAdSpend += number(item.ad_spend);
      continue;
    }
    const sourceName = item.advertised_product_name || item.converted_product_name || item.keyword;
    const ranked = matcher.rankCandidates(masterProducts,{name:sourceName,selling_price:null},2);
    const best = ranked[0], margin = best ? best.score - (ranked[1]?.score || 0) : 0;
    if (!best || best.score < 0.72 || margin < 0.1) { unassignedCoupangAdSpend += number(item.ad_spend); continue; }
    const row = rows.get(best.master.id); if (!row) continue;
    row.channels.COUPANG.ad_spend += number(item.ad_spend);
    assignedCoupangAdSpend += number(item.ad_spend);
  }

  const costs = new Map(productCosts.map(item=>[item.master_product_id,item]));
  const settings = new Map(channelCostSettings.map(item=>[item.platform,item]));
  const rules = new Map(channelShippingRules.map(item=>[item.platform,item]));
  for (const row of rows.values()) {
    const cost = costs.get(row.master_product_id);
    let variableCosts = 0;
    for (const [platform,channel] of Object.entries(row.channels)) {
      const setting = settings.get(platform) || {};
      const reserve = shippingRules.calculateShippingReserve({ orders:channel.orders, rule:rules.get(platform) || {} });
      channel.platform_fees = channel.revenue * (number(setting.commission_rate) + number(setting.payment_fee_rate));
      channel.shipping_cost = channel.orders * number(setting.default_shipping_cost);
      channel.return_reserve = reserve.return_reserve;
      channel.remote_area_reserve = reserve.remote_area_reserve;
      channel.fees = channel.platform_fees + channel.shipping_cost + reserve.total_reserve;
      variableCosts += channel.fees;
    }
    row.revenue = Object.values(row.channels).reduce((sum,item)=>sum+item.revenue,0);
    row.ad_spend = Object.values(row.channels).reduce((sum,item)=>sum+item.ad_spend,0);
    row.orders = Object.values(row.channels).reduce((sum,item)=>sum+item.orders,0);
    row.units = Object.values(row.channels).reduce((sum,item)=>sum+item.units,0);
    row.roas = row.ad_spend > 0 ? row.revenue / row.ad_spend * 100 : null;
    if (isProductCostReady(cost)) {
      const unitCost = number(cost.unit_cost) + number(cost.packaging_cost) + number(cost.other_unit_cost);
      row.product_cost = row.units * unitCost;
      row.variable_costs = variableCosts;
      row.contribution_before_ads = row.revenue - variableCosts - row.product_cost;
      row.contribution_profit = row.contribution_before_ads - row.ad_spend;
      row.contribution_margin_rate = row.revenue > 0 ? row.contribution_before_ads / row.revenue * 100 : null;
      row.cost_status = 'CALCULATED';
    }
    for (const channel of Object.values(row.channels)) {
      for (const key of ['revenue','ad_spend','fees','platform_fees','shipping_cost','return_reserve','remote_area_reserve']) channel[key] = Math.round(channel[key]);
    }
    for (const key of ['revenue','ad_spend','product_cost','variable_costs','contribution_before_ads','contribution_profit']) if (row[key] != null) row[key] = Math.round(row[key]);
    if (row.contribution_margin_rate != null) row.contribution_margin_rate = Number(row.contribution_margin_rate.toFixed(2));
    if (row.roas != null) row.roas = Number(row.roas.toFixed(2));
  }
  const items = [...rows.values()].filter(item=>item.revenue || item.ad_spend || Object.values(item.channels).some(channel=>channel.orders)).sort((a,b)=>b.revenue-a.revenue);
  const coveredItems = items.filter(item=>item.cost_status==='CALCULATED');
  const coveredRevenue = coveredItems.reduce((sum,item)=>sum+item.revenue,0);
  const missingItems = items.filter(item=>item.cost_status!=='CALCULATED');
  const result = {
    period_start:periodStart, period_end:periodEnd, items,
    summary:{
      mapped_products:new Set(channelProducts.filter(item=>item.master_product_id).map(item=>item.master_product_id)).size,
      active_products:items.length,
      revenue:items.reduce((sum,item)=>sum+item.revenue,0),
      ad_spend:items.reduce((sum,item)=>sum+item.ad_spend,0),
      contribution_profit:coveredItems.reduce((sum,item)=>sum+number(item.contribution_profit),0),
      cost_covered_products:coveredItems.length,
      cost_coverage_rate:items.reduce((sum,item)=>sum+item.revenue,0)>0?coveredRevenue/items.reduce((sum,item)=>sum+item.revenue,0)*100:null,
      missing_cost_products:missingItems.length,
      missing_cost_revenue:missingItems.reduce((sum,item)=>sum+item.revenue,0),
      return_reserve:items.reduce((sum,item)=>sum+Object.values(item.channels).reduce((channelSum,channel)=>channelSum+number(channel.return_reserve),0),0),
      remote_area_reserve:items.reduce((sum,item)=>sum+Object.values(item.channels).reduce((channelSum,channel)=>channelSum+number(channel.remote_area_reserve),0),0),
      coupang_ad_spend_assigned:Math.round(assignedCoupangAdSpend),
      coupang_ad_spend_directly_assigned:Math.round(directlyAssignedCoupangAdSpend),
      coupang_ad_spend_unassigned:Math.round(unassignedCoupangAdSpend)
    }
  };
  if(naverRequired&&!naverReady)result.summary.cost_coverage_rate=null;
  const gated=financialTrust.applyProductPerformanceGate(result);
  gated.source_readiness={NAVER:naverReady?'READY':'CHECK_REQUIRED'};
  if(naverRequired&&!naverReady){
    gated.summary.known_revenue=gated.summary.revenue;
    gated.summary.revenue=null;
    gated.summary.contribution_profit=null;
    gated.summary.sales_status='PARTIAL';
    for(const item of gated.items){
      item.channels.NAVER.revenue=null;
      item.channels.NAVER.orders=null;
      item.channels.NAVER.units=null;
      item.known_revenue=item.revenue;
      item.revenue=null;
      item.contribution_profit=null;
      item.contribution_before_ads=null;
      item.contribution_margin_rate=null;
      item.roas=null;
    }
  }
  return gated;
}

async function loadNaverCommerce(db,periodStart,periodEnd){
  const orders=[];
  for(const field of ['payment_date','order_date']){
  for(let offset=0;offset<50000;offset+=1000){
    let query=db.from('naver_commerce_orders').select('order_id,order_date,payment_date,status').gte(field,`${periodStart}T00:00:00+09:00`).lte(field,`${periodEnd}T23:59:59.999+09:00`);
    if(field==='order_date')query=query.is('payment_date',null);
    const result=await query.order('order_id').range(offset,offset+999);
    if(result.error)throw result.error;
    orders.push(...(result.data||[]));
    if((result.data||[]).length<1000)break;
    if(offset===49000)throw new Error('NAVER_COMMERCE_ORDER_LIMIT');
  }
  }
  const items=[];
  const ids=[...new Set(orders.map(row=>row.order_id))];
  for(let batch=0;batch<ids.length;batch+=100){
    for(let offset=0;offset<50000;offset+=1000){
      const result=await db.from('naver_commerce_order_items').select('product_order_id,order_id,product_id,original_product_id,quantity,unit_price,paid_amount,status').in('order_id',ids.slice(batch,batch+100)).order('product_order_id').range(offset,offset+999);
      if(result.error)throw result.error;
      items.push(...(result.data||[]));
      if((result.data||[]).length<1000)break;
      if(offset===49000)throw new Error('NAVER_COMMERCE_ITEM_LIMIT');
    }
  }
  return {naverOrders:orders,naverOrderItems:items};
}

async function loadNaverCoverage(db,periodStart,periodEnd) {
  // Narrow to successful certificates for this period before pagination: later
  // failed runs and different rolling periods must not hide historical evidence.
  for (let offset = 0; ; offset += 100) {
    const result = await db.from('sync_logs').select('status,finished_at,metadata')
      .eq('platform','NAVER').in('job_type',['COMMERCE_SYNC','COMMERCE_PAYMENT_PERIOD'])
      .eq('status','SUCCESS').eq('metadata->order_coverage->>status','SUCCESS')
      .eq('metadata->order_coverage->complete',true).eq('metadata->order_coverage->closed',true)
      .eq('metadata->order_coverage->>source','NAVER_COMMERCE').eq('metadata->order_coverage->>basis','PAYMENT_DATE')
      .lte('metadata->order_coverage->>period_start',periodStart).gte('metadata->order_coverage->>period_end',periodEnd)
      .order('finished_at',{ascending:false}).range(offset,offset + 99);
    if (result.error) return null;
    const rows = result.data || [];
    const evidence = rows.map(row=>row.metadata?.order_coverage).find(row=>hasNaverCoverage(row,periodStart,periodEnd));
    if (evidence) return evidence;
    if (rows.length < 100) return null;
  }
}

async function loadUnifiedProductPerformance({ db, periodStart, periodEnd, ...input }) {
  const [keywords, stats, coupangAds,naverCommerce,coverageEvidence] = await Promise.all([
    db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id').limit(10000),
    db.from('naver_keyword_stats').select('ncc_keyword_id,impressions,clicks,cost,conversions,conversion_revenue').eq('period_start',periodStart).eq('period_end',periodEnd).limit(10000),
    db.from('coupang_ad_keyword_daily').select('keyword,ad_spend,date,advertised_product_name,advertised_option_id,converted_product_name,converted_option_id').gte('date',periodStart).lte('date',periodEnd).limit(5000),
    Array.isArray(input.naverOrders)&&Array.isArray(input.naverOrderItems)?Promise.resolve({naverOrders:input.naverOrders,naverOrderItems:input.naverOrderItems}):loadNaverCommerce(db,periodStart,periodEnd),
    input.naverCollectionEvidence?Promise.resolve(input.naverCollectionEvidence):loadNaverCoverage(db,periodStart,periodEnd)
  ]);
  const firstError = [keywords,stats,coupangAds].find(result=>result.error)?.error;
  if (firstError) throw firstError;
  const naverCollectionEvidence=coverageEvidence;
  return buildUnifiedProductPerformance({ ...input,...naverCommerce,naverCollectionEvidence, periodStart, periodEnd, naverKeywords:keywords.data||[], naverKeywordStats:stats.data||[], coupangAdKeywords:coupangAds.data||[] });
}

module.exports = { buildUnifiedProductPerformance, loadUnifiedProductPerformance };
