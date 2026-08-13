import Dashboard from './dashboard-client';
import supabaseModule from '../lib/cafe24/supabase.js';
import authModule from '../lib/dashboard-auth.js';
import profitabilityModule from '../lib/analytics/profitability.js';
import coupangMarketingModule from '../lib/coupang/marketing.js';
import metricCalculator from '../lib/metrics/calculator.js';
import metricSnapshotModule from '../lib/metrics/snapshot.js';
import pacingService from '../lib/analytics/pacing-service.js';
import cafe24AnalyticsModule from '../lib/cafe24/analytics.js';
import mappingService from '../lib/products/mapping-service.js';
import productPerformance from '../lib/products/performance.js';
import costCalibrationModule from '../lib/analytics/cost-calibration.js';
import shippingRulesModule from '../lib/analytics/shipping-rules.js';
import financialTrustModule from '../lib/analytics/financial-trust.js';
import priorityCenterModule from '../lib/actions/priority-center.js';
import dataHealthModule from '../lib/dashboard/data-health.js';
import coupangQueueHealthModule from '../lib/dashboard/coupang-queue-health.js';
import hubRoutesModule from '../lib/navigation/hub-routes.js';
import salesCommandCenterModule from '../lib/dashboard/sales-command-center.js';
import marketingDiagnosisModule from '../lib/marketing/diagnosis.js';
import retentionValidationModule from '../lib/customers/retention-validation.js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const number = value => Number(value || 0);
const dateOnly = value => String(value || '').slice(0, 10);

function orderAmount(order) {
  return number(order.paid_amount ?? order.raw_data?.payment_amount ?? order.raw_data?.actual_order_amount?.payment_amount);
}

function dailyVisitors(row) {
  if (row.visitors != null) return number(row.visitors);
  const match = row.raw_data?.visitors?.view?.find(item => dateOnly(item.date) === row.date);
  return number(match?.visit_count);
}

function returnCaseView(item) {
  const raw = item.raw_data || {};
  return {
    receipt_id:item.receipt_id, order_id:item.order_id, status:item.status, cancel_type:item.cancel_type,
    reason_text:item.reason_text, requested_at:item.requested_at, amount:item.amount,
    cancel_count:Number(raw.cancelCountSum || 0),
    can_receive:item.status === 'RETURNS_UNCHECKED',
    can_approve:item.status === 'VENDOR_WAREHOUSE_CONFIRM',
    can_pickup_invoice:item.status === 'RETURNS_UNCHECKED'
  };
}

function exchangeCaseView(item) {
  const raw = item.raw_data || {};
  const shipmentBoxId = (raw.deliveryInvoiceGroupDtos || []).map(group => group.shipmentBoxId).find(Boolean);
  return {
    exchange_id:item.exchange_id, order_id:item.order_id, status:item.status, reason_text:item.reason_text,
    requested_at:item.requested_at, item_count:item.item_count,
    collect_status:raw.collectStatus || null,
    can_receive:item.status === 'PROGRESS' && ['CompleteCollect','Delivering'].includes(raw.collectStatus),
    can_reject:Boolean(raw.rejectable) && !['SUCCESS','REJECT','CANCEL'].includes(item.status),
    can_pickup_invoice:item.status === 'RECEIPT' && raw.collectStatus === 'BeforeDirection',
    can_shipping_invoice:Boolean(raw.deliveryInvoiceModifiable) && Boolean(shipmentBoxId),
    shipment_box_id:shipmentBoxId ? String(shipmentBoxId) : null
  };
}

async function getDashboardData() {
  const db = supabaseModule.getSupabase();
  const pacingPromise = pacingService.buildPacingDashboard({ db }).catch(error => {
    console.error('[dashboard] pacing unavailable', error);
    return { status:'NO_DATA', channels:[], reasons:['목표 진행률을 불러오지 못했습니다.'] };
  });
  const queryMetadata = [
    ['CAFE24','cafe24_orders'],['CAFE24','cafe24_order_items'],['CAFE24','cafe24_traffic_daily'],['CAFE24','cafe24_referrers_daily'],['CAFE24','cafe24_products'],
    ['SHARED','sync_logs'],['SHARED','reports'],['SHARED','actions'],['SHARED','master_products'],['SHARED','channel_products'],
    ['NAVER','naver_campaigns'],['NAVER','naver_adgroups'],['NAVER','naver_keywords'],['NAVER','sync_logs'],['NAVER','naver_stats_daily'],
    ['SHARED','automation_runs'],['SHARED','data_quality_checks'],['SHARED','action_evaluations'],['SHARED','alerts'],['SHARED','platform_events'],
    ['SHARED','product_costs'],['SHARED','channel_cost_settings'],['SHARED','channel_shipping_rules'],
    ['COUPANG','coupang_products'],['COUPANG','coupang_orders'],['COUPANG','coupang_order_items'],['COUPANG','coupang_settlements'],['COUPANG','coupang_rg_inventory'],['COUPANG','coupang_sync_requests'],['COUPANG','coupang_rg_orders'],['COUPANG','coupang_returns'],['COUPANG','coupang_exchanges'],['COUPANG','coupang_inquiries'],['COUPANG','coupang_item_inventory'],['COUPANG','coupang_settlement_summaries'],['COUPANG','coupang_promotion_budgets'],['COUPANG','coupang_api_capabilities'],['COUPANG','coupang_product_items'],['COUPANG','coupang_rg_order_items'],['COUPANG','coupang_cost_transactions'],['COUPANG','coupang_cost_imports'],['COUPANG','coupang_ad_daily_summary'],['COUPANG','coupang_ad_keyword_summary_top'],['COUPANG','coupang_ad_keyword_summary_waste'],['COUPANG','coupang_ad_campaign_summary'],['COUPANG','coupang_ad_billing_daily']
  ].map(([platform,dataset])=>({platform,dataset}));
  const settledQueries = await Promise.allSettled([
    db.from('cafe24_orders').select('order_id,order_date,customer_id,paid_amount,order_price,raw_data').order('order_date', { ascending: false }).limit(10000),
    db.from('cafe24_order_items').select('order_id,external_product_no,product_name,quantity,unit_price,paid_amount,raw_data').limit(10000),
    db.from('cafe24_traffic_daily').select('date,visitors,pageviews,source_status,raw_data').order('date', { ascending: true }).limit(31),
    db.from('cafe24_referrers_daily').select('date,source,visitors,orders,revenue').order('visitors', { ascending: false }).limit(500),
    db.from('cafe24_products').select('external_product_no,product_name,price,selling,raw_data').order('updated_at', { ascending: false }).limit(100),
    db.from('sync_logs').select('id,platform,job_type,status,started_at,finished_at,rows_received,error_message,metadata').in('job_type', ['FETCH_ALL','FILE_IMPORT','RG_INVENTORY','RG_REALTIME']).order('started_at', { ascending: false }).limit(20),
    db.from('reports').select('id,platform,report_type,period_start,period_end,title,status,summary_json,version,supersedes_report_id,is_latest,revision_note,approved_at,approved_by,created_at').order('period_end', { ascending: false }).order('created_at',{ascending:false}).limit(80),
    db.from('actions').select('id,platform,target_type,target_id,target_name,action_type,reason,status,before_value,after_value,decided_at,executed_at,review_after,priority,assignee,due_at,hold_reason,review_result,created_at').order('decided_at', { ascending: false }).limit(100),
    db.from('master_products').select('id,name,selling_price,is_active').order('updated_at',{ascending:false}).limit(200),
    db.from('channel_products').select('id,master_product_id,platform,external_product_id,external_product_name,selling_price,is_active,match_method,match_confidence,matched_at,matched_by').order('updated_at',{ascending:false}).limit(500),
    db.from('naver_campaigns').select('ncc_campaign_id,name,campaign_type,status,user_lock'),
    db.from('naver_adgroups').select('ncc_adgroup_id,ncc_campaign_id,name,status,user_lock',{count:'exact'}).limit(1000),
    db.from('naver_keywords').select('*',{count:'exact',head:true}),
    db.from('sync_logs').select('status,finished_at,error_message,metadata').eq('platform','NAVER').eq('job_type','FETCH_ALL').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('naver_stats_daily').select('date,entity_id,impressions,clicks,cost,conversions,conversion_revenue').order('date',{ascending:false}).limit(1200),
    db.from('automation_runs').select('id,job_name,trigger_type,status,started_at,finished_at,attempt_count,result_json,error_message,idempotency_key,scheduled_for,kst_execution_date,recovery_count').order('started_at',{ascending:false}).limit(20),
    db.from('data_quality_checks').select('id,platform,dataset,status_code,severity,rows_checked,duplicate_count,message,remediation,checked_at').order('checked_at',{ascending:false}).limit(40),
    db.from('action_evaluations').select('id,action_id,baseline_start,baseline_end,evaluation_start,evaluation_end,metric_name,before_json,after_json,change_rate,outcome,explanation,evaluated_at').order('evaluated_at',{ascending:false}).limit(100),
    db.from('alerts').select('id,source_type,platform,severity,title,message,status,created_at').eq('status','OPEN').order('created_at',{ascending:false}).limit(20),
    db.from('platform_events').select('id,platform,event_type,effective_date,title,description,analysis_impact,source_url,affects_comparison,created_by').order('effective_date',{ascending:false}).limit(30),
    db.from('product_costs').select('master_product_id,unit_cost,packaging_cost,other_unit_cost,notes,effective_from'),
    db.from('channel_cost_settings').select('platform,commission_rate,payment_fee_rate,default_shipping_cost,notes'),
    db.from('channel_shipping_rules').select('platform,return_shipping_cost,return_rate,remote_area_surcharge,remote_area_rate,notes,updated_at'),
    db.from('coupang_products').select('seller_product_id,product_name,status,raw_data').order('updated_at',{ascending:false}).limit(100),
    db.from('coupang_orders').select('shipment_box_id,order_id,ordered_at,paid_at,status,gross_amount,raw_data').order('ordered_at',{ascending:false}).limit(2000),
    db.from('coupang_order_items').select('external_item_key,shipment_box_id,order_id,vendor_item_id,seller_product_id,product_name,quantity,unit_price,paid_amount,status,raw_data').limit(5000),
    db.from('coupang_settlements').select('order_id,vendor_item_id,recognition_date,sale_type,sale_amount,service_fee,service_fee_vat,settlement_amount,quantity').order('recognition_date',{ascending:false}).limit(5000),
    db.from('coupang_rg_inventory').select('vendor_item_id,external_sku_id,total_orderable_quantity,sales_last_30_days,average_daily_sales,days_of_stock,stock_status,snapshot_at').order('days_of_stock',{ascending:true,nullsFirst:false}).limit(500),
    db.from('coupang_sync_requests').select('id,request_type,status,requested_at,started_at,finished_at,error_message,attempt_count,next_attempt_at,idempotency_key,scheduled_for,kst_execution_date').order('requested_at',{ascending:false}).limit(50),
    db.from('coupang_rg_orders').select('order_id,status,paid_at,total_amount,item_count').order('paid_at',{ascending:false}).limit(2000),
    db.from('coupang_returns').select('receipt_id,order_id,status,cancel_type,reason_text,requested_at,amount,raw_data').order('requested_at',{ascending:false}).limit(100),
    db.from('coupang_exchanges').select('exchange_id,order_id,status,reason_text,requested_at,item_count,raw_data').order('requested_at',{ascending:false}).limit(100),
    db.from('coupang_inquiries').select('inquiry_key,inquiry_type,inquiry_id,status,answered,product_id,seller_product_id,vendor_item_id,order_id,question_text,parent_answer_id,inquired_at,raw_data').order('inquired_at',{ascending:false}).limit(100),
    db.from('coupang_item_inventory').select('vendor_item_id,quantity,sale_price,original_price,status,external_sku_id,checked_at').order('quantity',{ascending:true}).limit(500),
    db.from('coupang_settlement_summaries').select('recognition_month,settlement_type,settlement_date,status,total_sale,service_fee,settlement_target_amount,settlement_amount,last_amount,pending_released_amount,final_amount').order('recognition_month',{ascending:false}).order('settlement_date',{ascending:false}).limit(24),
    db.from('coupang_promotion_budgets').select('budget_key,status,budget_amount,used_amount,remaining_amount,checked_at').order('checked_at',{ascending:false}).limit(20),
    db.from('coupang_api_capabilities').select('feature_key,family,title,method,mode,status,risk_level,sync_frequency').order('family').order('title'),
    db.from('coupang_product_items').select('vendor_item_id,seller_product_id,item_name,sale_price,status,raw_data').limit(1000),
    db.from('coupang_rg_order_items').select('order_id,vendor_item_id,quantity,amount').limit(5000),
    db.from('coupang_cost_transactions').select('source_type,transaction_type,event_date,recognition_date,order_id,reference_id,vendor_item_id,sku_id,product_name,option_name,quantity,gross_sales,seller_discount,cost_amount,cost_vat,credit_amount,raw_data').order('event_date',{ascending:false}).limit(10000),
    db.from('coupang_cost_imports').select('id,file_name,source_types,status,input_rows,stored_rows,duplicate_rows,invalid_rows,gross_sales,cost_amount,cost_vat,credit_amount,period_start,period_end,imported_at').order('imported_at',{ascending:false}).limit(30),
    db.from('coupang_ad_daily_summary').select('*').order('date',{ascending:true}).limit(62),
    db.from('coupang_ad_keyword_summary').select('*').gt('revenue',0).order('revenue',{ascending:false}).limit(50),
    db.from('coupang_ad_keyword_summary').select('*').eq('revenue',0).gt('ad_spend',0).order('ad_spend',{ascending:false}).limit(50),
    db.from('coupang_ad_campaign_summary').select('*').order('revenue',{ascending:false}).limit(50),
    db.from('coupang_ad_billing_daily').select('*').order('date',{ascending:true}).limit(100)
  ]);
  const settled = dataHealthModule.settleQueries(settledQueries, queryMetadata, (error, issue) => {
    console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`, error);
  });
  const queryIssues = [...settled.issues];
  const [ordersResult, itemsResult, trafficResult, refsResult, productsResult, syncResult, reportsResult, actionsResult, masterResult, channelsResult, naverCampaignResult, naverGroupResult, naverKeywordResult, naverSyncResult, naverStatsResult, automationResult, qaResult, evaluationsResult, alertsResult, eventsResult, costsResult, channelCostsResult, shippingRulesResult, coupangProductsResult, coupangOrdersResult, coupangItemsResult, coupangSettlementsResult, coupangInventoryResult, coupangRequestsResult, coupangRgOrdersResult, coupangReturnsResult, coupangExchangesResult, coupangInquiriesResult, coupangItemInventoryResult, coupangSettlementSummaryResult, coupangBudgetsResult, coupangCapabilitiesResult, coupangProductItemsResult, coupangRgOrderItemsResult, coupangCostsResult, coupangCostImportsResult, coupangAdDailyResult, coupangAdKeywordTopResult, coupangAdKeywordWasteResult, coupangAdCampaignResult, coupangAdBillingResult] = settled.results;
  const phase7Settled=dataHealthModule.settleQueries(await Promise.allSettled([
    db.from('financial_change_requests').select('id,change_type,platform,target_key,status,impact_preview,created_at,executed_at,verified_at,rolled_back_at,verification_result,error_message').order('created_at',{ascending:false}).limit(100),
    db.from('financial_change_audit_logs').select('id,change_request_id,event_type,from_status,to_status,created_at').order('created_at',{ascending:true}).limit(1000),
    db.from('ab_tests').select('id,name,platform,status,evaluation_status,result_summary,created_at,ab_test_variants(id,entity_id)').order('created_at',{ascending:false}).limit(100)
  ]),[
    {platform:'SHARED',dataset:'financial_change_requests'},
    {platform:'SHARED',dataset:'financial_change_audit_logs'},
    {platform:'SHARED',dataset:'ab_tests'}
  ],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...phase7Settled.issues);
  const [phase7ChangesResult,phase7AuditsResult,phase7ExperimentsResult]=phase7Settled.results;
  const keywordPeriodSettled=dataHealthModule.settleQueries(await Promise.allSettled([db.from('naver_keyword_stats').select('period_start,period_end').order('period_end',{ascending:false}).limit(1).maybeSingle()]),[{platform:'NAVER',dataset:'naver_keyword_stats_period'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...keywordPeriodSettled.issues);
  const keywordPeriodResult=keywordPeriodSettled.results[0];
  const keywordPeriod=keywordPeriodResult.data;
  let keywordTop=[],keywordWaste=[];
  if(keywordPeriod){const keywordStatsSettled=dataHealthModule.settleQueries(await Promise.allSettled([db.from('naver_keyword_stats').select('ncc_keyword_id,keyword,campaign_type,impressions,clicks,cost,conversions,conversion_revenue,roas,ctr').eq('period_start',keywordPeriod.period_start).eq('period_end',keywordPeriod.period_end).order('conversion_revenue',{ascending:false}).limit(20),db.from('naver_keyword_stats').select('ncc_keyword_id,keyword,campaign_type,impressions,clicks,cost,conversions,conversion_revenue,roas,ctr').eq('period_start',keywordPeriod.period_start).eq('period_end',keywordPeriod.period_end).eq('conversion_revenue',0).gt('cost',0).order('cost',{ascending:false}).limit(20)]),[{platform:'NAVER',dataset:'naver_keyword_stats_top'},{platform:'NAVER',dataset:'naver_keyword_stats_waste'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));queryIssues.push(...keywordStatsSettled.issues);keywordTop=keywordStatsSettled.results[0].data||[];keywordWaste=keywordStatsSettled.results[1].data||[];}
  let marketingKeywordStats=[],marketingKeywordCatalog=[],marketingDetailChecklists=[];
  if(keywordPeriod){
    const marketingInputsSettled=dataHealthModule.settleQueries(await Promise.allSettled([
      db.from('naver_keyword_stats').select('ncc_keyword_id,keyword,campaign_type,impressions,clicks,cost,conversions,conversion_revenue,roas,ctr').eq('period_start',keywordPeriod.period_start).eq('period_end',keywordPeriod.period_end).order('impressions',{ascending:false}).limit(5000),
      db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id,keyword').limit(5000),
      db.from('product_detail_checklists').select('master_product_id,items,notes')
    ]),[
      {platform:'NAVER',dataset:'marketing_keyword_funnel'},
      {platform:'NAVER',dataset:'marketing_keyword_catalog'},
      {platform:'SHARED',dataset:'marketing_detail_readiness'}
    ],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
    queryIssues.push(...marketingInputsSettled.issues);
    marketingKeywordStats=marketingInputsSettled.results[0].data||[];
    marketingKeywordCatalog=marketingInputsSettled.results[1].data||[];
    marketingDetailChecklists=marketingInputsSettled.results[2].data||[];
  }

  const orders = ordersResult.data || [];
  const items = itemsResult.data || [];
  const traffic = (trafficResult.data || []).map(row => ({
    date: row.date,
    visitors: dailyVisitors(row),
    pageviews: number(row.pageviews),
    status: row.source_status
  }));
  const productMap = new Map();
  for (const item of items) {
    const key = item.product_name || '상품명 없음';
    const current = productMap.get(key) || { name: key, quantity: 0, sales: 0, orders: new Set() };
    current.quantity += number(item.quantity);
    current.sales += number(item.paid_amount ?? item.raw_data?.payment_amount ?? number(item.unit_price) * number(item.quantity));
    current.orders.add(item.order_id);
    productMap.set(key, current);
  }
  const topProducts = [...productMap.values()]
    .map(item => ({ ...item, orders: item.orders.size }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);
  const sales = orders.reduce((sum, order) => sum + orderAmount(order), 0);
  const visitors = traffic.reduce((sum, row) => sum + row.visitors, 0);
  const cafe24Analytics = cafe24AnalyticsModule.buildCafe24Analytics({
    orders,
    items,
    traffic,
    referrers: refsResult.data || [],
    customerHistory: orders
  });

  const campaignNames=new Map((naverCampaignResult.data||[]).map(item=>[item.ncc_campaign_id,item.name]));
  const allNaverStats=naverStatsResult.data||[];
  const latestNaverDate=allNaverStats[0]?.date||null;
  const weekStart=latestNaverDate?new Date(`${latestNaverDate}T00:00:00`):null;
  if(weekStart)weekStart.setDate(weekStart.getDate()-6);
  const recentNaver=weekStart?allNaverStats.filter(row=>new Date(`${row.date}T00:00:00`)>=weekStart&&row.date<=latestNaverDate):[];
  const naverTotals=recentNaver.reduce((sum,row)=>({impressions:sum.impressions+number(row.impressions),clicks:sum.clicks+number(row.clicks),cost:sum.cost+number(row.cost),conversions:sum.conversions+number(row.conversions),revenue:sum.revenue+number(row.conversion_revenue)}),{impressions:0,clicks:0,cost:0,conversions:0,revenue:0});
  const targetRoasPercent=Number(process.env.NAVER_TARGET_ROAS_PERCENT||250);
  const naverPerformance=metricCalculator.calculatePerformance({...naverTotals,targetRoasPercent});
  const withAdMetrics=item=>({...item,metrics:metricCalculator.calculatePerformance({impressions:item.impressions,clicks:item.clicks,cost:item.cost,conversions:item.conversions,revenue:item.conversion_revenue??item.revenue,targetRoasPercent})});
  keywordTop=keywordTop.map(withAdMetrics);
  keywordWaste=keywordWaste.map(withAdMetrics);
  const cafe24CostSetting=(channelCostsResult.data||[]).find(item=>item.platform==='CAFE24')||{};
  const cafe24ShippingRule=(shippingRulesResult.data||[]).find(item=>item.platform==='CAFE24')||{};
  const liveProfitability=profitabilityModule.calculateProfitability({items,productLinks:(channelsResult.data||[]).filter(item=>item.platform==='CAFE24'),productCosts:costsResult.data||[],channelSetting:cafe24CostSetting,shippingRule:cafe24ShippingRule,adSpend:naverTotals.cost});
  const naverDailyMap=new Map(); const naverCampaignMap=new Map();
  for(const row of recentNaver){const day=naverDailyMap.get(row.date)||{date:row.date,cost:0,revenue:0,clicks:0,conversions:0};day.cost+=number(row.cost);day.revenue+=number(row.conversion_revenue);day.clicks+=number(row.clicks);day.conversions+=number(row.conversions);naverDailyMap.set(row.date,day);const item=naverCampaignMap.get(row.entity_id)||{id:row.entity_id,name:campaignNames.get(row.entity_id)||row.entity_id,cost:0,revenue:0,clicks:0,conversions:0,impressions:0};item.cost+=number(row.cost);item.revenue+=number(row.conversion_revenue);item.clicks+=number(row.clicks);item.conversions+=number(row.conversions);item.impressions+=number(row.impressions);naverCampaignMap.set(row.entity_id,item);}
  const naverTopCampaigns=[...naverCampaignMap.values()].map(withAdMetrics).map(item=>({...item,roas:item.metrics.roasPercent})).sort((a,b)=>b.revenue-a.revenue).slice(0,8);
  const coupangProductItemMap = new Map((coupangProductItemsResult.data || []).map(item=>[String(item.vendor_item_id),item]));
  const coupangInventoryBase = (coupangInventoryResult.data || []).map(item=>({ ...item, productItem:coupangProductItemMap.get(String(item.vendor_item_id))||null }));
  const { items: coupangInventory, summary: inventoryMarketing } = coupangMarketingModule.buildInventoryMarketing(coupangInventoryBase);
  const rgOrders = coupangRgOrdersResult.data || [];
  const rgOrderMap = new Map(rgOrders.map(item=>[String(item.order_id),item]));
  const seoulParts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  const seoulDate=value=>{const parts=seoulParts(value);return `${parts.year}-${parts.month}-${parts.day}`;};
  const todayParts=seoulParts(new Date()); const todayKey=`${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const coupangDailyMap = new Map();
  for(let offset=29;offset>=0;offset-=1){const date=new Date(`${todayKey}T00:00:00+09:00`);date.setUTCDate(date.getUTCDate()-offset);const key=seoulDate(date);coupangDailyMap.set(key,{date:key,orders:0,units:0,revenue:0});}
  for(const order of rgOrders){if(!order.paid_at)continue;const date=seoulDate(order.paid_at);if(!coupangDailyMap.has(date))continue;const day=coupangDailyMap.get(date);day.orders+=1;day.revenue+=number(order.total_amount);}
  const coupangProductDailyMap=new Map();
  for(const item of coupangRgOrderItemsResult.data||[]){const order=rgOrderMap.get(String(item.order_id));if(!order?.paid_at)continue;const date=seoulDate(order.paid_at);if(!coupangDailyMap.has(date))continue;coupangDailyMap.get(date).units+=number(item.quantity);const productKey=String(item.vendor_item_id||'UNKNOWN');if(!coupangProductDailyMap.has(productKey))coupangProductDailyMap.set(productKey,{vendorItemId:productKey,name:coupangProductItemMap.get(productKey)?.item_name||`SKU ${productKey}`,price:number(coupangProductItemMap.get(productKey)?.sale_price),days:new Map([...coupangDailyMap.keys()].map(key=>[key,{date:key,orders:new Set(),units:0,revenue:0}]))});const product=coupangProductDailyMap.get(productKey);const day=product.days.get(date);day.orders.add(String(item.order_id));day.units+=number(item.quantity);day.revenue+=number(item.amount);}
  const coupangHourly=Array.from({length:24},(_,hour)=>({hour,orders:0,units:0,revenue:0}));
  for(const order of rgOrders){if(!order.paid_at)continue;const parts=seoulParts(order.paid_at);if(`${parts.year}-${parts.month}-${parts.day}`!==todayKey)continue;const hour=number(parts.hour);coupangHourly[hour].orders+=1;coupangHourly[hour].revenue+=number(order.total_amount);}
  for(const item of coupangRgOrderItemsResult.data||[]){const order=rgOrderMap.get(String(item.order_id));if(!order?.paid_at)continue;const parts=seoulParts(order.paid_at);if(`${parts.year}-${parts.month}-${parts.day}`!==todayKey)continue;coupangHourly[number(parts.hour)].units+=number(item.quantity);}
  const todayCoupang=coupangHourly.reduce((sum,item)=>({orders:sum.orders+item.orders,units:sum.units+item.units,revenue:sum.revenue+item.revenue}),{orders:0,units:0,revenue:0});
  const coupangProductPerformance=[...coupangProductDailyMap.values()].map(product=>{const daily=[...product.days.values()].map(day=>({...day,orders:day.orders.size}));const sumDays=days=>days.reduce((sum,day)=>({orders:sum.orders+day.orders,units:sum.units+day.units,revenue:sum.revenue+day.revenue}),{orders:0,units:0,revenue:0});const inventory=coupangInventory.find(item=>String(item.vendor_item_id)===String(product.vendorItemId));return {...product,daily,totals:sumDays(daily),last7:sumDays(daily.slice(-7)),inventory:inventory?{quantity:number(inventory.total_orderable_quantity),status:inventory.stock_status,daysOfStock:inventory.days_of_stock}:null};}).sort((a,b)=>b.totals.revenue-a.totals.revenue);
  const coupangDaily=[...coupangDailyMap.values()];
  const sumCoupangPeriod=days=>coupangDaily.slice(-days).reduce((sum,day)=>({orders:sum.orders+day.orders,units:sum.units+day.units,revenue:sum.revenue+day.revenue}),{orders:0,units:0,revenue:0});
  const salesOverview={today:todayCoupang,last7:sumCoupangPeriod(7),last30:sumCoupangPeriod(30)};
  const coupangCostRows=coupangCostsResult.data||[];
  const costCalibration=costCalibrationModule.calculateCoupangCostCalibration({
    settlements:coupangSettlementsResult.data||[],
    costTransactions:coupangCostRows,
    currentSetting:(channelCostsResult.data||[]).find(item=>item.platform==='COUPANG')||{}
  });
  const shippingRuleEvidence=shippingRulesModule.buildCoupangShippingEvidence({ returns:coupangReturnsResult.data||[], costTransactions:coupangCostRows });
  const effectiveChannelCostSettings=costCalibrationModule.withEffectiveChannelSettings(channelCostsResult.data||[],costCalibration);
  const costDates=coupangCostRows.flatMap(item=>[item.event_date,item.recognition_date].filter(Boolean)).sort();
  const costCategoryMap=new Map(); const costProductMap=new Map();
  for(const item of coupangCostRows){
    const category=costCategoryMap.get(item.source_type)||{sourceType:item.source_type,cost:0,vat:0,credit:0,rows:0};category.cost+=number(item.cost_amount);category.vat+=number(item.cost_vat);category.credit+=number(item.credit_amount);category.rows+=1;costCategoryMap.set(item.source_type,category);
    const key=String(item.vendor_item_id||item.sku_id||'UNMATCHED');const product=costProductMap.get(key)||{vendorItemId:key,name:[item.product_name,item.option_name].filter(Boolean).join(' / ')||'상품 미지정',sales:0,quantity:0,commission:0,logistics:0,vat:0,credit:0};
    if(item.source_type==='SALES_COMMISSION'){product.sales+=number(item.gross_sales);product.quantity+=number(item.quantity);product.commission+=number(item.cost_amount);}else product.logistics+=number(item.cost_amount);product.vat+=number(item.cost_vat);product.credit+=number(item.credit_amount);costProductMap.set(key,product);
  }
  const costTotals=coupangCostRows.reduce((sum,item)=>({sales:sum.sales+(item.source_type==='SALES_COMMISSION'?number(item.gross_sales):0),sellerDiscount:sum.sellerDiscount+(item.source_type==='SALES_COMMISSION'?number(item.seller_discount):0),commission:sum.commission+(item.source_type==='SALES_COMMISSION'?number(item.cost_amount):0),logistics:sum.logistics+(item.source_type==='SALES_COMMISSION'?0:number(item.cost_amount)),vat:sum.vat+number(item.cost_vat),credit:sum.credit+number(item.credit_amount)}),{sales:0,sellerDiscount:0,commission:0,logistics:0,vat:0,credit:0});
  const costStatement={...costTotals,netBeforeCogs:costTotals.sales-costTotals.sellerDiscount-costTotals.commission-costTotals.logistics-costTotals.vat+costTotals.credit,periodStart:costDates[0]||null,periodEnd:costDates.at(-1)||null,categories:[...costCategoryMap.values()],products:[...costProductMap.values()].map(item=>({...item,totalCost:item.commission+item.logistics+item.vat-item.credit,netBeforeCogs:item.sales-item.commission-item.logistics-item.vat+item.credit,unitPlatformCost:item.quantity?(item.commission+item.logistics)/Math.abs(item.quantity):0})).sort((a,b)=>b.sales-a.sales)};

  // 쿠팡은 최근 로켓그로스 상세 비용을 Open API로 직접 제공하지 않는다. 최신 WING 정산
  // 원본의 상품별 요율/개당 물류비를 최근 7일 실제 주문에 적용해 운영 추정치를 만든다.
  const last7Keys=new Set(coupangDaily.slice(-7).map(item=>item.date));
  const costProfiles=new Map();
  for(const row of coupangCostRows){
    const key=String(row.vendor_item_id||row.sku_id||'UNMATCHED');
    const profile=costProfiles.get(key)||{commissionSales:0,commission:0,warehousingQty:0,warehousing:0,shippingQty:0,shipping:0,storageQty:0,storage:0};
    const qty=number(row.quantity); const cost=number(row.cost_amount);
    if(row.source_type==='SALES_COMMISSION'){profile.commissionSales+=number(row.gross_sales);profile.commission+=cost;}
    if(row.source_type==='WAREHOUSING'){profile.warehousingQty+=qty;profile.warehousing+=cost;}
    if(row.source_type==='SHIPPING'){profile.shippingQty+=qty;profile.shipping+=cost;}
    if(row.source_type==='STORAGE'){profile.storageQty+=qty;profile.storage+=cost;}
    costProfiles.set(key,profile);
  }
  const profileRate=(profile,value,total,fallback)=>profile&&number(profile[total])?number(profile[value])/number(profile[total]):fallback;
  const globalCommissionRate=costTotals.sales?costTotals.commission/costTotals.sales:0;
  const typeUnitRate=sourceType=>{const rows=coupangCostRows.filter(row=>row.source_type===sourceType);const qty=rows.reduce((sum,row)=>sum+number(row.quantity),0);return qty?rows.reduce((sum,row)=>sum+number(row.cost_amount),0)/qty:0;};
  const globalWarehousingRate=typeUnitRate('WAREHOUSING');
  const globalShippingRate=typeUnitRate('SHIPPING');
  const globalStorageRate=typeUnitRate('STORAGE');
  const recentRgProducts=new Map();
  for(const item of coupangRgOrderItemsResult.data||[]){
    const order=rgOrderMap.get(String(item.order_id));
    if(!order?.paid_at||!last7Keys.has(seoulDate(order.paid_at)))continue;
    const key=String(item.vendor_item_id||'UNKNOWN'); const qty=number(item.quantity); const revenue=number(item.amount);
    const profile=costProfiles.get(key);
    const commission=revenue*profileRate(profile,'commission','commissionSales',globalCommissionRate);
    const warehousing=qty*profileRate(profile,'warehousing','warehousingQty',globalWarehousingRate);
    const shipping=qty*profileRate(profile,'shipping','shippingQty',globalShippingRate);
    const storage=qty*profileRate(profile,'storage','storageQty',globalStorageRate);
    const current=recentRgProducts.get(key)||{vendorItemId:key,name:coupangProductItemMap.get(key)?.item_name||`SKU ${key}`,sales:0,quantity:0,orders:new Set(),commission:0,warehousing:0,shipping:0,storage:0};
    current.sales+=revenue;current.quantity+=qty;current.orders.add(String(item.order_id));current.commission+=commission;current.warehousing+=warehousing;current.shipping+=shipping;current.storage+=storage;recentRgProducts.set(key,current);
  }
  const rgCostProducts=[...recentRgProducts.values()].map(item=>{const vat=Math.round((item.commission+item.warehousing+item.shipping+item.storage)*.1);const totalCost=Math.round(item.commission+item.warehousing+item.shipping+item.storage+vat);return {...item,orders:item.orders.size,commission:Math.round(item.commission),warehousing:Math.round(item.warehousing),shipping:Math.round(item.shipping),storage:Math.round(item.storage),vat,totalCost,unitPlatformCost:item.quantity?totalCost/item.quantity:0,netBeforeCogs:item.sales-totalCost};}).sort((a,b)=>b.sales-a.sales);
  const rgEstimate=rgCostProducts.reduce((sum,item)=>({sales:sum.sales+item.sales,orders:sum.orders+item.orders,units:sum.units+item.quantity,commission:sum.commission+item.commission,warehousing:sum.warehousing+item.warehousing,shipping:sum.shipping+item.shipping,storage:sum.storage+item.storage,vat:sum.vat+item.vat,totalCost:sum.totalCost+item.totalCost}),{sales:0,orders:0,units:0,commission:0,warehousing:0,shipping:0,storage:0,vat:0,totalCost:0});
  rgEstimate.sales=salesOverview.last7.revenue;rgEstimate.orders=salesOverview.last7.orders;rgEstimate.units=salesOverview.last7.units;
  rgEstimate.netBeforeCogs=rgEstimate.sales-rgEstimate.totalCost;
  const rgOrderIds=new Set(rgOrders.map(order=>String(order.order_id)));
  const sellerOrders=(coupangOrdersResult.data||[]).filter(order=>!rgOrderIds.has(String(order.order_id))&&order.ordered_at&&last7Keys.has(seoulDate(order.ordered_at)));
  const sellerOrderIds=new Set(sellerOrders.map(order=>String(order.order_id)));
  const sellerUnits=(coupangItemsResult.data||[]).filter(item=>sellerOrderIds.has(String(item.order_id))).reduce((sum,item)=>sum+number(item.quantity),0);
  const sellerSales=sellerOrders.reduce((sum,order)=>sum+number(order.gross_amount),0);
  const actualSellerRows=(coupangSettlementsResult.data||[]).filter(row=>sellerOrderIds.has(String(row.order_id)));
  const actualSellerOrderIds=new Set(actualSellerRows.map(row=>String(row.order_id)));
  const unsettledSellerSales=sellerOrders.filter(order=>!actualSellerOrderIds.has(String(order.order_id))).reduce((sum,order)=>sum+number(order.gross_amount),0);
  const sellerCommission=Math.round(actualSellerRows.reduce((sum,row)=>sum+number(row.service_fee),0)+unsettledSellerSales*globalCommissionRate);
  const sellerVat=Math.round(actualSellerRows.reduce((sum,row)=>sum+number(row.service_fee_vat),0)+unsettledSellerSales*globalCommissionRate*.1);
  const sellerEstimate={sales:sellerSales,orders:sellerOrders.length,units:sellerUnits,commission:sellerCommission,warehousing:0,shipping:0,storage:0,vat:sellerVat,totalCost:sellerCommission+sellerVat,netBeforeCogs:sellerSales-sellerCommission-sellerVat,actualSettledOrders:actualSellerOrderIds.size,estimatedOrders:Math.max(0,sellerOrders.length-actualSellerOrderIds.size)};
  const combinedEstimate={sales:rgEstimate.sales+sellerEstimate.sales,orders:rgEstimate.orders+sellerEstimate.orders,units:rgEstimate.units+sellerEstimate.units,commission:rgEstimate.commission+sellerEstimate.commission,warehousing:rgEstimate.warehousing,shipping:rgEstimate.shipping,storage:rgEstimate.storage,vat:rgEstimate.vat+sellerEstimate.vat,totalCost:rgEstimate.totalCost+sellerEstimate.totalCost};
  combinedEstimate.netBeforeCogs=combinedEstimate.sales-combinedEstimate.totalCost;
  const recentCostEstimate={periodStart:coupangDaily.at(-7)?.date||null,periodEnd:coupangDaily.at(-1)?.date||null,basisPeriodStart:costStatement.periodStart,basisPeriodEnd:costStatement.periodEnd,rocketGrowth:rgEstimate,sellerDelivery:sellerEstimate,total:combinedEstimate,products:rgCostProducts,method:'ACTUAL_SALES_ESTIMATED_FEES'};
  const recognizedRows=(coupangSettlementsResult.data||[]).filter(row=>row.recognition_date&&last7Keys.has(row.recognition_date));
  const actualSettlement7=recognizedRows.reduce((sum,row)=>{const direction=row.sale_type==='REFUND'?-1:1;sum.sales+=direction*Math.abs(number(row.sale_amount));sum.serviceFee+=number(row.service_fee);sum.vat+=number(row.service_fee_vat);sum.settlementAmount+=number(row.settlement_amount);sum.items+=1;return sum;},{periodStart:coupangDaily.at(-7)?.date||null,periodEnd:coupangDaily.at(-1)?.date||null,sales:0,serviceFee:0,vat:0,settlementAmount:0,items:0});
  const orderItemsByShipment=new Map();
  for(const item of coupangItemsResult.data||[]){const key=String(item.shipment_box_id||'');if(!orderItemsByShipment.has(key))orderItemsByShipment.set(key,[]);orderItemsByShipment.get(key).push({vendorItemId:item.vendor_item_id,name:item.product_name,quantity:number(item.quantity),unitPrice:number(item.unit_price),paidAmount:number(item.paid_amount),status:item.status});}
  const sellerOperationalOrders=(coupangOrdersResult.data||[]).filter(order=>!rgOrderIds.has(String(order.order_id))).slice(0,300).map(order=>({
    shipmentBoxId:order.shipment_box_id,orderId:order.order_id,orderedAt:order.ordered_at,paidAt:order.paid_at,status:order.status,
    amount:number(order.gross_amount),invoiceNumber:order.raw_data?.invoiceNumber||'',deliveryCompanyName:order.raw_data?.deliveryCompanyName||'',
    items:orderItemsByShipment.get(String(order.shipment_box_id))||[]
  }));
  const sellerActionRequired=sellerOperationalOrders.filter(order=>['ACCEPT','INSTRUCT'].includes(order.status)).length;
  const mappingHistorySettled = dataHealthModule.settleQueries(await Promise.allSettled([
    db.from('product_mapping_history').select('id,platform,external_product_id,external_product_name,previous_master_product_id,new_master_product_id,action,match_method,match_confidence,actor,created_at').order('created_at',{ascending:false}).limit(1000)
  ]), [{platform:'SHARED',dataset:'product_mapping_history'}], (error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...mappingHistorySettled.issues);
  const mappingHistoryResult = mappingHistorySettled.results[0];
  const productMapping = mappingService.buildMappingDashboard({
    masterProducts:(masterResult.data || []).filter(item=>item.is_active),
    channelProducts:channelsResult.data || [],
    coupangProducts:coupangProductsResult.data || [],
    coupangProductItems:coupangProductItemsResult.data || [],
    naverAdgroups:naverGroupResult.data || [],
    naverCampaigns:naverCampaignResult.data || [],
    history:mappingHistoryResult.data || []
  });
  const allChannelProducts = [
    ...(channelsResult.data || []).filter(item=>item.platform==='CAFE24'),
    ...productMapping.links
  ];
  const marketingDiagnosis=marketingDiagnosisModule.buildMarketingDiagnosis({
    keywordStats:marketingKeywordStats,
    naverKeywords:marketingKeywordCatalog,
    masterProducts:(masterResult.data||[]).filter(item=>item.is_active!==false),
    channelProducts:allChannelProducts,
    productItems:coupangProductItemsResult.data||[],
    itemInventory:coupangItemInventoryResult.data||[],
    rgInventory:coupangInventoryResult.data||[],
    checklists:marketingDetailChecklists,
    period:keywordPeriod,
    targetRoas:targetRoasPercent
  });
  const performanceEnd = keywordPeriod?.period_end || todayKey;
  const performanceStartDate = new Date(`${performanceEnd}T00:00:00+09:00`);
  performanceStartDate.setUTCDate(performanceStartDate.getUTCDate()-6);
  const performanceStart = keywordPeriod?.period_start || seoulDate(performanceStartDate);
  const productPerformanceInput = {
    periodStart:performanceStart, periodEnd:performanceEnd,
    masterProducts:masterResult.data || [], channelProducts:allChannelProducts,
    productCosts:costsResult.data || [], channelCostSettings:effectiveChannelCostSettings,
    channelShippingRules:shippingRulesResult.data||[], cafe24Orders:ordersResult.data || [],
    cafe24OrderItems:itemsResult.data || [], coupangOrders:coupangOrdersResult.data || [],
    coupangOrderItems:coupangItemsResult.data || [], coupangProductItems:coupangProductItemsResult.data || [],
    coupangRgOrders:coupangRgOrdersResult.data || [], coupangRgOrderItems:coupangRgOrderItemsResult.data || []
  };
  let unifiedProductPerformance;
  try {
    unifiedProductPerformance = await productPerformance.loadUnifiedProductPerformance({ db, ...productPerformanceInput });
  } catch (error) {
    const issue=dataHealthModule.safeError(error,{platform:'SHARED',dataset:'unified_product_performance'});
    queryIssues.push(issue);
    console.error('[dashboard] unified product performance inputs unavailable',error);
    unifiedProductPerformance=productPerformance.buildUnifiedProductPerformance(productPerformanceInput);
  }
  const coverageCandidates = [liveProfitability.cost_coverage_rate, unifiedProductPerformance.summary?.cost_coverage_rate]
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(value => Number(value))
    .filter(Number.isFinite);
  const financialTrust = financialTrustModule.evaluateFinancialTrust({
    costCoverageRate:coverageCandidates.length ? Math.min(...coverageCandidates) : null,
    unassignedAdSpend:unifiedProductPerformance.summary?.coupang_ad_spend_unassigned,
    missingCostProducts:Math.max(number(liveProfitability.missing_cost_products), number(unifiedProductPerformance.summary?.missing_cost_products)),
    missingCostRevenue:Math.max(number(liveProfitability.missing_cost_revenue), number(unifiedProductPerformance.summary?.missing_cost_revenue))
  });
  const trustedProfitability = financialTrustModule.applyProfitabilityGate(liveProfitability, financialTrust);
  const trustedProductPerformance = financialTrustModule.applyProductPerformanceGate(unifiedProductPerformance, financialTrust);
  const trustedNaverPerformance = financialTrustModule.applyBidGuideGate(naverPerformance, financialTrust);
  keywordTop=keywordTop.map(item=>({...item,metrics:financialTrustModule.applyBidGuideGate(item.metrics,financialTrust)}));
  keywordWaste=keywordWaste.map(item=>({...item,metrics:financialTrustModule.applyBidGuideGate(item.metrics,financialTrust)}));
  const trustedNaverTopCampaigns=naverTopCampaigns.map(item=>({...item,metrics:financialTrustModule.applyBidGuideGate(item.metrics,financialTrust)}));
  const financialTrustToken=authModule.signFinancialTrust(financialTrust);
  const pacing = await pacingPromise;
  const generatedAt = new Date().toISOString();
  const latestCafe24History=(syncResult.data||[]).find(item=>item.platform==='CAFE24'&&item.status==='SUCCESS'&&item.metadata?.order_period)?.metadata?.order_period||null;
  const retentionValidation=retentionValidationModule.buildRetentionValidation({
    orders:ordersResult.data||[],
    items:itemsResult.data||[],
    referrers:refsResult.data||[],
    actions:actionsResult.data||[],
    evaluations:evaluationsResult.data||[],
    reports:reportsResult.data||[],
    experiments:phase7ExperimentsResult.data||[],
    financialChanges:phase7ChangesResult.data||[],
    financialAudits:phase7AuditsResult.data||[],
    automationRuns:automationResult.data||[],
    orderHistoryPeriod:latestCafe24History,
    asOf:generatedAt
  });
  const dataHealth = dataHealthModule.buildDataHealth({
    issues:queryIssues,
    syncs:syncResult.data || [],
    automationRuns:automationResult.data || [],
    coupangRequests:coupangRequestsResult.data || [],
    summaries:{
      NAVER:naverKeywordResult.unavailable?'저장량 확인 불가':`${number(naverKeywordResult.count).toLocaleString('ko-KR')}개 키워드`,
      CAFE24:ordersResult.unavailable?'저장량 확인 불가':`${orders.length.toLocaleString('ko-KR')}건 주문`,
      COUPANG:coupangOrdersResult.unavailable?'저장량 확인 불가':`${number(coupangOrdersResult.data?.length).toLocaleString('ko-KR')}건 주문`
    },
    now:generatedAt
  });
  const coupangQueueHealth = coupangQueueHealthModule.buildCoupangQueueHealth({ requests:coupangRequestsResult.data || [], now:generatedAt });
  const actions = priorityCenterModule.enrichActions(
    (actionsResult.data || []).map(action => ({ ...action, evaluation: (evaluationsResult.data || []).find(item => item.action_id === action.id) || null })),
    financialTrust,
    generatedAt
  );
  const priorityCenter = priorityCenterModule.buildPriorityCenter({
    actions,
    alerts:alertsResult.data || [],
    qualityChecks:qaResult.data || [],
    pacing,
    financialTrust,
    now:generatedAt
  });
  const productSignals = salesCommandCenterModule.buildProductSignals({
    cafe24Orders:ordersResult.data || [],
    cafe24OrderItems:itemsResult.data || [],
    coupangProducts:coupangProductPerformance,
    asOf:todayKey
  });
  const salesCommandCenter = salesCommandCenterModule.buildSalesCommandCenter({
    pacing,
    priorityCenter,
    dataHealth,
    productSignals,
    profitability:trustedProfitability,
    financialTrust
  });
  const cafe24LatestSync = (syncResult.data || []).find(item=>item.platform==='CAFE24') || null;
  const coupangLatestSync = (syncResult.data || []).find(item=>item.platform==='COUPANG') || null;
  const cafe24Dates = orders.map(item=>dateOnly(item.order_date)).filter(Boolean).sort();
  const metricChannelStatus = platform => dataHealth.channels.find(item=>item.platform===platform)?.calculationStatus;
  const metricNeedsCheck = platform => metricChannelStatus(platform)==='CHECK_REQUIRED';
  const anyMetricNeedsCheck = ['CAFE24','NAVER','COUPANG'].some(metricNeedsCheck);
  const metricSnapshots = [
    metricSnapshotModule.createMetricSnapshot({
      id:'CAFE24_SALES', label:'Cafe24 매출', value:metricNeedsCheck('CAFE24') ? null : orders.length ? sales : null, unit:'KRW',
      status:metricNeedsCheck('CAFE24') ? 'STALE' : orders.length ? 'READY' : 'NO_DATA', sources:[{platform:'CAFE24',dataset:'cafe24_orders'}],
      asOf:cafe24LatestSync?.finished_at, periodStart:cafe24Dates[0], periodEnd:cafe24Dates.at(-1),
      formula:'sum(cafe24_orders.paid_amount)', sampleSize:orders.length
    }),
    metricSnapshotModule.createMetricSnapshot({
      id:'NAVER_PAID_ROAS', label:'네이버 광고 ROAS', value:metricNeedsCheck('NAVER') || naverPerformance.status==='NO_DATA' ? null : naverPerformance.roasPercent, unit:'PERCENT',
      status:metricNeedsCheck('NAVER') ? 'STALE' : naverPerformance.status==='READY' ? 'READY' : naverPerformance.status==='NO_DATA' ? 'NO_DATA' : 'PARTIAL',
      sources:[{platform:'NAVER',dataset:'naver_stats_daily'}], asOf:naverSyncResult.data?.finished_at,
      periodStart:weekStart?dateOnly(weekStart.toISOString()):null, periodEnd:latestNaverDate,
      formula:'sum(conversion_revenue) / sum(cost) * 100', sampleSize:naverTotals.clicks,
      reasons:naverPerformance.status==='INSUFFICIENT_SAMPLE' ? ['클릭 30회·전환 3건 미만'] : []
    }),
    metricSnapshotModule.createMetricSnapshot({
      id:'COUPANG_SALES_30D', label:'쿠팡 30일 매출', value:metricNeedsCheck('COUPANG') ? null : rgOrders.length ? salesOverview.last30.revenue : null, unit:'KRW',
      status:metricNeedsCheck('COUPANG') ? 'STALE' : rgOrders.length ? 'READY' : 'NO_DATA', sources:[{platform:'COUPANG',dataset:'coupang_rg_orders',mode:'FIXED_IP_WORKER'}],
      asOf:coupangLatestSync?.finished_at, periodStart:coupangDaily.at(-30)?.date || null, periodEnd:coupangDaily.at(-1)?.date || null,
      formula:'sum(coupang_rg_orders.total_amount, last 30 days)', sampleSize:salesOverview.last30.orders
    }),
    metricSnapshotModule.createMetricSnapshot({
      id:'CONTRIBUTION_PROFIT', label:'통합 기여이익', value:anyMetricNeedsCheck ? null : trustedProfitability.contribution_profit, unit:'KRW',
      status:anyMetricNeedsCheck ? 'STALE' : financialTrust.allowed?.contribution_profit ? 'READY' : 'BLOCKED',
      sources:[{platform:'CAFE24',dataset:'cafe24_order_items'},{platform:'ALL',dataset:'product_costs'},{platform:'NAVER',dataset:'naver_stats_daily'}],
      asOf:generatedAt, periodStart:cafe24Dates[0], periodEnd:cafe24Dates.at(-1),
      formula:'net_sales - product_cost - channel_fee - shipping_cost - ad_spend',
      formulaVersion:financialTrust.formula_version,
      sampleSize:orders.length, reasons:(financialTrust.reasons||[]).map(item=>item.code)
    })
  ];
  return {
    generatedAt,
    dataHealth,
    metricSnapshots,
    kpis: {
      sales,
      orders: orders.length,
      visitors,
      pageviews: traffic.reduce((sum, row) => sum + row.pageviews, 0),
      conversion: visitors ? (orders.length / visitors) * 100 : 0,
      averageOrder: orders.length ? sales / orders.length : 0,
      products: productsResult.data?.length || 0
    },
    traffic,
    referrers: refsResult.data || [],
    topProducts,
    cafe24Analytics,
    recentOrders: orders.slice(0, 8).map(order => ({ id: order.order_id, date: order.order_date, amount: orderAmount(order), channel: order.raw_data?.order_place_name || '자사몰' })),
    products: (productsResult.data || []).slice(0, 8).map(product => ({
      id: product.external_product_no,
      name: product.product_name,
      price: number(product.price),
      selling: product.selling,
      image: product.raw_data?.small_image || product.raw_data?.list_image || null
    })),
    syncs: syncResult.data || [],
    reports: reportsResult.data || [],
    actions,
    priorityCenter,
    salesCommandCenter,
    retentionValidation,
    automationRuns: automationResult.data || [],
    qualityChecks: qaResult.data || [],
    alerts: alertsResult.data || [],
    platformEvents: eventsResult.data || [],
    masterProducts: masterResult.data || [],
    channelProducts: allChannelProducts,
    productMapping,
    unifiedProductPerformance:trustedProductPerformance,
    productCosts: costsResult.data || [],
    channelCostSettings: channelCostsResult.data || [],
    channelShippingRules: shippingRulesResult.data || [],
    shippingRuleEvidence,
    costCalibration,
    liveProfitability:trustedProfitability,
    financialTrust,
    financialTrustToken,
    pacing,
    naver: { campaigns:naverCampaignResult.data?.length||0, adgroups:naverGroupResult.count||0, keywords:naverKeywordResult.count||0, latestSync:naverSyncResult.data||null, periodStart:weekStart?dateOnly(weekStart.toISOString()):null, periodEnd:latestNaverDate, totals:{...naverTotals,roas:naverPerformance.roasPercent,ctr:naverPerformance.ctrPercent,metrics:trustedNaverPerformance}, daily:[...naverDailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)), topCampaigns:trustedNaverTopCampaigns, keywordPeriod, keywordTop, keywordWaste, marketingDiagnosis },
    coupang: {
      products: coupangProductsResult.data || [],
      productCount: coupangProductsResult.data?.length || 0,
      orders: sellerOperationalOrders.map(({items,...order})=>order),
      sellerOrders: sellerOperationalOrders,
      sellerOrderCount: sellerOperationalOrders.length,
      sellerActionRequired,
      orderCount: coupangOrdersResult.data?.length || 0,
      itemCount: coupangItemsResult.data?.length || 0,
      grossSales: (coupangOrdersResult.data || []).reduce((sum,item)=>sum+number(item.gross_amount),0),
      settlementAmount: (coupangSettlementsResult.data || []).reduce((sum,item)=>sum+number(item.settlement_amount),0),
      fees: (coupangSettlementsResult.data || []).reduce((sum,item)=>sum+number(item.service_fee)+number(item.service_fee_vat),0),
      latestSync: coupangLatestSync,
      latestRealtime: (syncResult.data || []).find(item=>item.platform==='COUPANG'&&item.job_type==='RG_REALTIME') || null,
      rgInventory: coupangInventory,
      rgInventoryCount: coupangInventory.length,
      rgTotalOrderable: coupangInventory.reduce((sum,item)=>sum+number(item.total_orderable_quantity),0),
      rgSalesLast30Days: coupangInventory.reduce((sum,item)=>sum+number(item.sales_last_30_days),0),
      rgOutOfStock: coupangInventory.filter(item=>item.stock_status==='OUT_OF_STOCK').length,
      rgLowStock: coupangInventory.filter(item=>['CRITICAL','LOW'].includes(item.stock_status)).length,
      inventoryMarketing,
      syncRequests: coupangRequestsResult.data || [],
      queueHealth: coupangQueueHealth,
      rgOrders,
      rgOrderCount: rgOrders.length,
      rgRevenue: rgOrders.reduce((sum,item)=>sum+number(item.total_amount),0),
      orderDaily: coupangDaily,
      productPerformance: coupangProductPerformance,
      salesOverview,
      orderHourly: coupangHourly,
      today: {...todayCoupang,averageOrder:todayCoupang.orders?todayCoupang.revenue/todayCoupang.orders:0,date:todayKey},
      returns: (coupangReturnsResult.data || []).map(returnCaseView),
      returnCount: coupangReturnsResult.data?.length || 0,
      exchanges: (coupangExchangesResult.data || []).map(exchangeCaseView),
      exchangeCount: coupangExchangesResult.data?.length || 0,
      inquiries: (coupangInquiriesResult.data || []).map(({raw_data,...item})=>item),
      unansweredInquiries: (coupangInquiriesResult.data || []).filter(item=>!item.answered).length,
      itemInventory: coupangItemInventoryResult.data || [],
      marketplaceOutOfStock: (coupangItemInventoryResult.data || []).filter(item=>number(item.quantity)<=0).length,
      settlementFinalAmount: (coupangSettlementSummaryResult.data || []).reduce((sum,item)=>sum+number(item.final_amount),0),
      promotionRemaining: (coupangBudgetsResult.data || []).reduce((sum,item)=>sum+number(item.remaining_amount),0),
      capabilities: coupangCapabilitiesResult.data || [],
      costStatement,
      recentCostEstimate,
      actualSettlement7,
      settlementSummaries: coupangSettlementSummaryResult.data || [],
      costImports: coupangCostImportsResult.data || [],
      adDaily: coupangAdDailyResult.data || [],
      adKeywordTop: coupangAdKeywordTopResult.data || [],
      adKeywordWaste: coupangAdKeywordWasteResult.data || [],
      adCampaigns: coupangAdCampaignResult.data || [],
      adBilling: coupangAdBillingResult.data || []
    }
  };
}

export default async function Home({ searchParams }) {
  const initialState = hubRoutesModule.normalizeHubState(await searchParams);
  const cookieStore = await cookies();
  const currentUser = await authModule.validateSession(cookieStore.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if (!currentUser) redirect('/login');
  try {
    return <Dashboard initialData={await getDashboardData()} initialState={initialState} />;
  } catch (error) {
    return <Dashboard initialData={{ error: error.message }} initialState={initialState} />;
  }
}
