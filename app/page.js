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
import productOperationsModule from '../lib/products/operations-center.js';
import cafe24CatalogModule from '../lib/products/cafe24-catalog.js';
import unifiedInventoryModule from '../lib/inventory/unified-center.js';
import unifiedSettlementModule from '../lib/settlement/unified-center.js';
import unifiedCollectionModule from '../lib/collection/unified-center.js';
import costCalibrationModule from '../lib/analytics/cost-calibration.js';
import shippingRulesModule from '../lib/analytics/shipping-rules.js';
import financialTrustModule from '../lib/analytics/financial-trust.js';
import financialReadinessModule from '../lib/analytics/financial-readiness.js';
import priorityCenterModule from '../lib/actions/priority-center.js';
import dataHealthModule from '../lib/dashboard/data-health.js';
import coupangQueueHealthModule from '../lib/dashboard/coupang-queue-health.js';
import hubRoutesModule from '../lib/navigation/hub-routes.js';
import salesCommandCenterModule from '../lib/dashboard/sales-command-center.js';
import marketingDiagnosisModule from '../lib/marketing/diagnosis.js';
import productAdTargetsModule from '../lib/marketing/product-ad-targets.js';
import naverBidWorkbenchModule from '../lib/marketing/naver-bid-workbench.js';
import naverBidExecutionModule from '../lib/naver/bid-execution.js';
import naverSearchTermCenterModule from '../lib/naver/search-term-center.js';
import naverExecutiveBoardModule from '../lib/marketing/naver-executive-board.js';
import aiFoundationModule from '../lib/ai/foundation.js';
import openaiClientModule from '../lib/ai/openai-client.js';
import aiPagePanelsModule from '../lib/ai/page-panels.js';
import aiPageResultsModule from '../lib/ai/page-results.js';
import reportLearningModule from '../lib/reports/learning-history.js';
import kstScheduleModule from '../lib/automation/kst-schedule.js';
import retentionValidationModule from '../lib/customers/retention-validation.js';
import channelCapabilitiesModule from '../lib/platforms/channel-capabilities.js';
import unifiedOrdersModule from '../lib/orders/unified-orders.js';
import unifiedCustomerServiceModule from '../lib/customer-service/unified-center.js';
import customerServiceStore from '../lib/customer-service/store.js';
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

const SHELL_TABLES = ['sync_logs','alerts'];
const VIEW_TABLES = {
  main:[
    'cafe24_orders','cafe24_order_items','cafe24_traffic_daily','cafe24_referrers_daily','cafe24_products',
    'reports','actions','master_products','channel_products','naver_campaigns','naver_adgroups','naver_keywords','naver_stats_daily',
    'automation_runs','data_quality_checks','action_evaluations','platform_events','product_costs','channel_cost_settings','channel_shipping_rules',
    'coupang_products','coupang_orders','coupang_order_items','coupang_settlements','coupang_rg_inventory','coupang_sync_requests',
    'coupang_rg_orders','coupang_item_inventory','coupang_product_items','coupang_rg_order_items','coupang_cost_transactions',
    'coupang_ad_daily_summary','coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily',
    'naver_keyword_stats','naver_commerce_orders','naver_commerce_order_items','naver_commerce_settlements',
    'coupang_ad_keyword_daily','business_targets','budget_snapshots','ai_analysis_results'
  ],
  orders:['cafe24_orders','cafe24_order_items','naver_commerce_orders','naver_commerce_order_items','coupang_orders','coupang_order_items','coupang_rg_orders','coupang_rg_order_items','coupang_returns'],
  cs:['cafe24_orders','cafe24_order_items','coupang_orders','coupang_order_items','coupang_returns','coupang_exchanges','coupang_inquiries','coupang_operation_requests','customer_service_items'],
  inventory:['master_products','channel_products','cafe24_products','coupang_products','coupang_rg_inventory','coupang_item_inventory','coupang_product_items','ai_analysis_results'],
  settlement:['cafe24_orders','naver_commerce_orders','naver_commerce_settlements','coupang_orders','coupang_order_items','coupang_settlements','coupang_rg_orders','coupang_rg_order_items','coupang_settlement_summaries','coupang_promotion_budgets','coupang_product_items','coupang_cost_transactions','coupang_cost_imports','channel_cost_settings','channel_shipping_rules','ai_analysis_results'],
  collection:['cafe24_products','automation_runs','data_quality_checks','coupang_sync_requests','coupang_products','coupang_api_capabilities'],
  insight:['cafe24_orders','cafe24_order_items','cafe24_traffic_daily','cafe24_referrers_daily','reports','actions','platform_events','master_products','channel_products','naver_campaigns','naver_adgroups','naver_keywords','naver_stats_daily','naver_keyword_stats','naver_search_terms','naver_commerce_orders','naver_commerce_order_items','naver_commerce_settlements','product_costs','product_ad_targets','channel_cost_settings','channel_shipping_rules','product_detail_checklists','coupang_orders','coupang_order_items','coupang_settlements','coupang_rg_inventory','coupang_rg_orders','coupang_product_items','coupang_rg_order_items','coupang_ad_daily_summary','coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily','coupang_ad_keyword_daily','ai_analysis_results'],
  keyword:['master_products','channel_products','naver_campaigns','naver_adgroups','naver_keywords','naver_stats_daily','naver_keyword_stats','naver_search_terms','product_detail_checklists','product_costs','channel_cost_settings','channel_shipping_rules','coupang_products','coupang_rg_inventory','coupang_item_inventory','coupang_product_items','coupang_ad_daily_summary','coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily','coupang_ad_keyword_daily','ai_analysis_results'],
  product:['cafe24_orders','cafe24_order_items','cafe24_products','master_products','channel_products','naver_campaigns','naver_adgroups','naver_keywords','naver_keyword_stats','product_costs','product_ad_targets','channel_cost_settings','channel_shipping_rules','product_mapping_history','product_detail_checklists','coupang_products','coupang_orders','coupang_order_items','coupang_settlements','coupang_rg_inventory','coupang_item_inventory','coupang_product_items','coupang_rg_orders','coupang_rg_order_items','coupang_cost_transactions','coupang_ad_keyword_daily','ai_analysis_results'],
  knowledge:[],
  reports:['reports','actions','action_evaluations','automation_runs','product_costs','channel_cost_settings','channel_shipping_rules'],
  changes:['cafe24_orders','cafe24_order_items','master_products','channel_products','naver_keywords','naver_keyword_stats','product_costs','product_ad_targets','channel_cost_settings','channel_shipping_rules','coupang_orders','coupang_order_items','coupang_product_items','coupang_rg_orders','coupang_rg_order_items','naver_keyword_product_links','financial_change_requests','financial_change_audit_logs'],
  validation:['cafe24_orders','cafe24_order_items','cafe24_referrers_daily','reports','actions','action_evaluations','automation_runs','financial_change_requests','financial_change_audit_logs','ab_tests'],
  experiments:[],
  notifications:['reports']
};

function emptySupabaseQuery() {
  const result={ data:[], error:null, count:0, status:200, statusText:'OK', scopedOut:true };
  let query;
  query=new Proxy(()=>query,{
    get(_target,key){
      if(key==='then')return (resolve,reject)=>Promise.resolve(result).then(resolve,reject);
      return query;
    },
    apply(){return query;}
  });
  return query;
}

function databaseForView(db, view) {
  const allowed=new Set([...SHELL_TABLES,...(VIEW_TABLES[view]||VIEW_TABLES.main)]);
  return new Proxy(db,{
    get(target,key){
      if(key==='from')return table=>allowed.has(table)?target.from(table):emptySupabaseQuery();
      const value=target[key];
      return typeof value==='function'?value.bind(target):value;
    }
  });
}

async function getDashboardData(state) {
  const view=state?.view||'main';
  const db = databaseForView(supabaseModule.getSupabase(), view);
  const rowLimit=(kind, fallback)=>{
    const limits={
      main:{orders:2500,items:5000,costs:3000},
      orders:{orders:1000,items:3000,costs:1000},
      cs:{orders:1000,items:2500,costs:500},
      settlement:{orders:3000,items:5000,costs:5000},
      insight:{orders:2500,items:5000,costs:3000},
      keyword:{orders:1500,items:3000,costs:1500},
      product:{orders:2500,items:5000,costs:3000},
      reports:{orders:1500,items:3000,costs:1500},
      changes:{orders:1000,items:2000,costs:1000}
    };
    return Math.min(fallback,limits[view]?.[kind]||fallback);
  };
  const needsPacing=new Set(['main','insight','keyword','product','reports','changes']).has(view);
  const pacingPromise = (needsPacing?pacingService.buildPacingDashboard({ db }):Promise.resolve({status:'NO_DATA',channels:[],reasons:[]})).catch(error => {
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
  // Start independent view queries together. Previously these waited for the large
  // base query one group at a time, which made every navigation inherit the full waterfall.
  const supplementalQueries={
    productTargets:Promise.allSettled([
      db.from('product_ad_targets').select('master_product_id,target_profit_margin_rate,notes,formula_version,updated_at').limit(500)
    ]),
    naverCommerce:Promise.allSettled([
      db.from('naver_commerce_orders').select('order_id,order_date,payment_date,status,paid_amount,receiver_name,receiver_phone,receiver_address,shipping_memo,shipment_id,invoice_no,delivery_company,raw_data,updated_at').order('order_date',{ascending:false}).limit(rowLimit('orders',5000)),
      db.from('naver_commerce_order_items').select('product_order_id,order_id,product_id,original_product_id,product_name,option_name,quantity,unit_price,paid_amount,status,shipping_due_date,raw_data,updated_at').limit(rowLimit('items',10000)),
      db.from('naver_commerce_settlements').select('settlement_key,settle_basis_start_date,settle_basis_end_date,settle_expect_date,settle_complete_date,settle_amount,pay_settle_amount,commission_settle_amount,benefit_settle_amount,deduction_restore_settle_amount,pay_holdback_amount,difference_settle_amount,updated_at').order('settle_basis_end_date',{ascending:false}).limit(1000)
    ]),
    phase7:Promise.allSettled([
      db.from('financial_change_requests').select('id,change_type,platform,target_key,status,impact_preview,created_at,executed_at,verified_at,rolled_back_at,verification_result,error_message').order('created_at',{ascending:false}).limit(100),
      db.from('financial_change_audit_logs').select('id,change_request_id,event_type,from_status,to_status,created_at').order('created_at',{ascending:true}).limit(1000),
      db.from('ab_tests').select('id,name,platform,status,evaluation_status,result_summary,created_at,ab_test_variants(id,entity_id)').order('created_at',{ascending:false}).limit(100)
    ]),
    csAudits:Promise.allSettled([
      db.from('coupang_operation_requests').select('id,operation_type,target_type,target_id,status,requested_at,executed_at,error_message').in('target_type',['INQUIRY','RETURN','EXCHANGE']).order('requested_at',{ascending:false}).limit(300)
    ]),
    channelCs:Promise.allSettled([
      db.from('customer_service_items').select('id,source_key,platform,kind,source_id,source_subtype,status,completed,answered,order_id,product_id,occurred_at,title_envelope,content_envelope,raw_summary,source_updated_at,collected_at').order('occurred_at',{ascending:false}).limit(1000)
    ]),
    keywordPeriod:Promise.allSettled([
      db.from('naver_keyword_stats').select('period_start,period_end').order('period_end',{ascending:false}).limit(1).maybeSingle()
    ]),
    aiResults:Promise.allSettled([
      db.from('ai_analysis_results').select('id,page_key,status,result_mode,data_status,period_label,formula_version,result,created_at,model,knowledge_versions')
        .not('page_key','is',null).order('created_at',{ascending:false}).limit(30)
    ]),
    bidLinks:Promise.allSettled([
      db.from('naver_keyword_product_links').select('ncc_keyword_id,master_product_id,updated_at').limit(5000)
    ])
  };
  const settledQueries = await Promise.allSettled([
    db.from('cafe24_orders').select('order_id,order_date,customer_id,payment_status,paid_amount,order_price,cancel_amount,refund_amount,raw_data').order('order_date', { ascending: false }).limit(rowLimit('orders',10000)),
    db.from('cafe24_order_items').select('order_id,external_item_id,external_product_no,product_name,option_name,quantity,unit_price,paid_amount,raw_data').limit(rowLimit('items',10000)),
    db.from('cafe24_traffic_daily').select('date,visitors,pageviews,source_status,raw_data').order('date', { ascending: true }).limit(31),
    db.from('cafe24_referrers_daily').select('date,source,visitors,orders,revenue').order('visitors', { ascending: false }).limit(500),
    db.from('cafe24_products').select('external_product_no,product_name,price,display,selling,raw_data,updated_at').order('updated_at', { ascending: false }).limit(500),
    db.from('sync_logs').select('id,platform,job_type,status,started_at,finished_at,rows_received,error_message,metadata').in('job_type', ['FETCH_ALL','FILE_IMPORT','RG_INVENTORY','RG_REALTIME','LOCAL_IP_CHECK','COMMERCE_CONNECTION_TEST','COMMERCE_SYNC','CUSTOMER_SERVICE']).order('started_at', { ascending: false }).limit(80),
    db.from('reports').select('id,platform,report_type,period_start,period_end,title,status,summary_json,version,supersedes_report_id,is_latest,revision_note,approved_at,approved_by,created_at').order('period_end', { ascending: false }).order('created_at',{ascending:false}).limit(80),
    db.from('actions').select('id,platform,target_type,target_id,target_name,action_type,reason,status,before_value,after_value,decided_at,executed_at,review_after,priority,assignee,due_at,hold_reason,review_result,created_at').order('decided_at', { ascending: false }).limit(100),
    db.from('master_products').select('id,name,selling_price,is_active').order('updated_at',{ascending:false}).limit(200),
    db.from('channel_products').select('id,master_product_id,platform,external_product_id,external_product_name,selling_price,is_active,match_method,match_confidence,matched_at,matched_by,raw_data,updated_at').order('updated_at',{ascending:false}).limit(500),
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
    db.from('coupang_order_items').select('external_item_key,shipment_box_id,order_id,vendor_item_id,seller_product_id,product_name,quantity,unit_price,paid_amount,status,raw_data').limit(rowLimit('items',5000)),
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
    db.from('coupang_rg_order_items').select('order_id,vendor_item_id,product_name,quantity,amount').limit(rowLimit('items',5000)),
    db.from('coupang_cost_transactions').select('source_type,transaction_type,event_date,recognition_date,order_id,reference_id,vendor_item_id,sku_id,product_name,option_name,quantity,gross_sales,seller_discount,cost_amount,cost_vat,credit_amount,raw_data').order('event_date',{ascending:false}).limit(rowLimit('costs',10000)),
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
  const productTargetSettled=dataHealthModule.settleQueries(await supplementalQueries.productTargets,[{platform:'SHARED',dataset:'product_ad_targets'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...productTargetSettled.issues);
  const productAdTargetRows=productTargetSettled.results[0].data||[];
  const naverCommerceSettled=dataHealthModule.settleQueries(await supplementalQueries.naverCommerce,[
    {platform:'NAVER',dataset:'naver_commerce_orders'},
    {platform:'NAVER',dataset:'naver_commerce_order_items'},
    {platform:'NAVER',dataset:'naver_commerce_settlements'}
  ],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...naverCommerceSettled.issues);
  const [naverCommerceOrdersResult,naverCommerceItemsResult,naverCommerceSettlementsResult]=naverCommerceSettled.results;
  const phase7Settled=dataHealthModule.settleQueries(await supplementalQueries.phase7,[
    {platform:'SHARED',dataset:'financial_change_requests'},
    {platform:'SHARED',dataset:'financial_change_audit_logs'},
    {platform:'SHARED',dataset:'ab_tests'}
  ],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...phase7Settled.issues);
  const [phase7ChangesResult,phase7AuditsResult,phase7ExperimentsResult]=phase7Settled.results;
  const csAuditSettled=dataHealthModule.settleQueries(await supplementalQueries.csAudits,[{platform:'COUPANG',dataset:'coupang_operation_requests_cs'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...csAuditSettled.issues);
  const csOperationAudits=csAuditSettled.results[0].data||[];
  const channelCsSettled=dataHealthModule.settleQueries(await supplementalQueries.channelCs,[{platform:'SHARED',dataset:'customer_service_items'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...channelCsSettled.issues);
  const channelCsItems=customerServiceStore.hydrateRows(channelCsSettled.results[0].data||[]);
  const keywordPeriodSettled=dataHealthModule.settleQueries(await supplementalQueries.keywordPeriod,[{platform:'NAVER',dataset:'naver_keyword_stats_period'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...keywordPeriodSettled.issues);
  const keywordPeriodResult=keywordPeriodSettled.results[0];
  const keywordPeriod=keywordPeriodResult.data;
  const aiResultsSettled=dataHealthModule.settleQueries(await supplementalQueries.aiResults,[{platform:'SHARED',dataset:'ai_analysis_results'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...aiResultsSettled.issues);
  const latestAiPageResults=aiPageResultsModule.latestByPage(aiResultsSettled.results[0].data||[]);
  const bidLinksSettled=dataHealthModule.settleQueries(await supplementalQueries.bidLinks,[{platform:'NAVER',dataset:'naver_keyword_product_links'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...bidLinksSettled.issues);
  const naverKeywordProductLinks=bidLinksSettled.results[0].data||[];
  let keywordTop=[],keywordWaste=[];
  if(keywordPeriod){const keywordStatsSettled=dataHealthModule.settleQueries(await Promise.allSettled([db.from('naver_keyword_stats').select('ncc_keyword_id,keyword,campaign_type,impressions,clicks,cost,conversions,conversion_revenue,roas,ctr').eq('period_start',keywordPeriod.period_start).eq('period_end',keywordPeriod.period_end).order('conversion_revenue',{ascending:false}).limit(20),db.from('naver_keyword_stats').select('ncc_keyword_id,keyword,campaign_type,impressions,clicks,cost,conversions,conversion_revenue,roas,ctr').eq('period_start',keywordPeriod.period_start).eq('period_end',keywordPeriod.period_end).eq('conversion_revenue',0).gt('cost',0).order('cost',{ascending:false}).limit(20)]),[{platform:'NAVER',dataset:'naver_keyword_stats_top'},{platform:'NAVER',dataset:'naver_keyword_stats_waste'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));queryIssues.push(...keywordStatsSettled.issues);keywordTop=keywordStatsSettled.results[0].data||[];keywordWaste=keywordStatsSettled.results[1].data||[];}
  let marketingKeywordStats=[],marketingKeywordCatalog=[],marketingDetailChecklists=[];
  if(keywordPeriod){
    const marketingInputsSettled=dataHealthModule.settleQueries(await Promise.allSettled([
      db.from('naver_keyword_stats').select('ncc_keyword_id,keyword,campaign_type,period_start,period_end,impressions,clicks,cost,conversions,conversion_revenue,roas,ctr').eq('period_start',keywordPeriod.period_start).eq('period_end',keywordPeriod.period_end).order('impressions',{ascending:false}).limit(5000),
      db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id,keyword,bid_amount,status,user_lock,updated_at').limit(5000),
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
  const searchTermContextSettled=dataHealthModule.settleQueries(await Promise.allSettled([
    db.from('naver_search_terms').select('period_start,period_end').order('period_end',{ascending:false}).order('period_start',{ascending:false}).limit(1).maybeSingle(),
    db.from('sync_logs').select('status,error_message,finished_at,metadata').eq('platform','NAVER').eq('job_type','SEARCH_TERMS').order('started_at',{ascending:false}).limit(1).maybeSingle()
  ]),[
    {platform:'NAVER',dataset:'naver_search_terms_period'},
    {platform:'NAVER',dataset:'naver_search_terms_sync'}
  ],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
  queryIssues.push(...searchTermContextSettled.issues);
  const searchTermPeriod=searchTermContextSettled.results[0].data||null;
  const searchTermSync=searchTermContextSettled.results[1].data||null;
  let searchTermRows=[];
  if(searchTermPeriod){
    const rowsSettled=dataHealthModule.settleQueries(await Promise.allSettled([
      db.from('naver_search_terms').select('id,period_start,period_end,ncc_adgroup_id,search_term,impressions,clicks,cost,conversions,conversion_revenue,classification_auto,classification_override,classification_confidence,recommended_action,action_reason,action_status,is_registered_exact,owner_note,collected_at').eq('period_start',searchTermPeriod.period_start).eq('period_end',searchTermPeriod.period_end).order('cost',{ascending:false}).limit(500)
    ]),[{platform:'NAVER',dataset:'naver_search_terms'}],(error,issue)=>console.error(`[dashboard] ${issue.platform}/${issue.dataset} unavailable`,error));
    queryIssues.push(...rowsSettled.issues);searchTermRows=rowsSettled.results[0].data||[];
  }
  const naverSearchTermCenter=naverSearchTermCenterModule.buildSearchTermCenter({
    rows:searchTermRows,
    registeredKeywords:marketingKeywordCatalog,
    period:searchTermPeriod,
    lastError:searchTermSync?.status==='FAILED'?searchTermSync.error_message:null,
    collectionTotal:searchTermSync?.metadata?.counts?.search_terms
  });
  naverSearchTermCenter.latest_sync=searchTermSync;

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
  const shiftDate=(value,days)=>{if(!value)return null;const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return dateOnly(date.toISOString());};
  const weekStart=latestNaverDate?shiftDate(latestNaverDate,-6):null;
  const previousWeekEnd=weekStart?shiftDate(weekStart,-1):null;
  const previousWeekStart=previousWeekEnd?shiftDate(previousWeekEnd,-6):null;
  const recentNaver=weekStart?allNaverStats.filter(row=>row.date>=weekStart&&row.date<=latestNaverDate):[];
  const previousNaver=previousWeekStart?allNaverStats.filter(row=>row.date>=previousWeekStart&&row.date<=previousWeekEnd):[];
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
  const sellableCafe24Ids = new Set((productsResult.data || [])
    .filter(product=>cafe24CatalogModule.classifyCafe24Product(product).is_sellable)
    .map(product=>String(product.external_product_no)));
  const sellableMasterIds = new Set((channelsResult.data || [])
    .filter(item=>item.platform==='CAFE24'&&item.is_active!==false&&sellableCafe24Ids.has(String(item.external_product_id)))
    .map(item=>item.master_product_id));
  const sellableMasterProducts = (masterResult.data || []).filter(item=>item.is_active!==false&&sellableMasterIds.has(item.id));
  const productMapping = mappingService.buildMappingDashboard({
    masterProducts:sellableMasterProducts,
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
  const generatedAt = new Date().toISOString();
  const productOperations = productOperationsModule.buildUnifiedProductOperations({
    masterProducts:sellableMasterProducts,
    channelProducts:allChannelProducts,
    cafe24Products:productsResult.data || [],
    coupangProducts:coupangProductsResult.data || [],
    coupangProductItems:coupangProductItemsResult.data || [],
    coupangItemInventory:coupangItemInventoryResult.data || []
  });
  const unifiedSettlement = unifiedSettlementModule.buildUnifiedSettlementCenter({
    cafe24Orders:ordersResult.data || [],
    naverOrders:naverCommerceOrdersResult.data || [],
    naverSettlements:naverCommerceSettlementsResult.data || [],
    coupangSettlements:coupangSettlementsResult.data || [],
    coupangCostTransactions:coupangCostsResult.data || [],
    coupangSettlementSummaries:coupangSettlementSummaryResult.data || [],
    channelCostSettings:effectiveChannelCostSettings,
    syncs:syncResult.data || [],
    unavailable:{
      CAFE24:Boolean(ordersResult.unavailable),
      NAVER:Boolean(naverCommerceSettlementsResult.unavailable),
      COUPANG:Boolean(coupangSettlementsResult.unavailable && coupangSettlementSummaryResult.unavailable)
    },
    now:new Date(generatedAt)
  });
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
  const unifiedInventory = unifiedInventoryModule.buildUnifiedInventoryCenter({
    masterProducts:masterResult.data || [],
    channelProducts:allChannelProducts,
    cafe24Products:productsResult.data || [],
    coupangProductItems:coupangProductItemsResult.data || [],
    coupangItemInventory:coupangItemInventoryResult.data || [],
    coupangRgInventory:coupangInventoryResult.data || [],
    productPerformance:unifiedProductPerformance.items || [],
    salesPeriodDays:7,
    now:new Date(generatedAt)
  });
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
  const productAdTargets = productAdTargetsModule.buildProductAdTargets({ performance:unifiedProductPerformance, targets:productAdTargetRows, financialTrust, asOf:generatedAt });
  const naverBidWorkbenchRaw=naverBidWorkbenchModule.buildNaverBidWorkbench({
    keywords:marketingKeywordCatalog,
    stats:marketingKeywordStats,
    productTargets:productAdTargets.items||[],
    keywordProductLinks:naverKeywordProductLinks,
    masterProducts:masterResult.data||[],
    financialTrust:{ allowed_cpc:financialTrust.allowed?.allowed_cpc === true, financial_actions:financialTrust.allowed?.bid_increase === true },
    period:keywordPeriod||{},
    executionEnabled:naverBidExecutionModule.configuration().write_enabled
  });
  const naverBidWorkbench={...naverBidWorkbenchRaw,candidates:naverBidWorkbenchRaw.candidates.map(candidate=>{
    const snapshot=naverBidWorkbenchModule.proposalSnapshot(candidate);
    return {...candidate,snapshot_token:snapshot?authModule.signBidProposalSnapshot(snapshot):null};
  })};
  const executiveOrderIds=new Set((ordersResult.data||[])
    .filter(order=>!naverExecutiveBoardModule.isOpenMarketMirror(order)&&dateOnly(order.order_date)>=weekStart&&dateOnly(order.order_date)<=latestNaverDate)
    .map(order=>String(order.order_id)));
  const executiveItems=(itemsResult.data||[]).filter(item=>executiveOrderIds.has(String(item.order_id)));
  const rawExecutiveProfitability=profitabilityModule.calculateProfitability({
    items:executiveItems,
    productLinks:(channelsResult.data||[]).filter(item=>item.platform==='CAFE24'),
    productCosts:costsResult.data||[],
    channelSetting:cafe24CostSetting,
    shippingRule:cafe24ShippingRule,
    adSpend:naverTotals.cost
  });
  const executiveFinancialTrust=financialTrustModule.evaluateFinancialTrust({
    costCoverageRate:rawExecutiveProfitability.cost_coverage_rate,
    missingCostProducts:rawExecutiveProfitability.missing_cost_products,
    missingCostRevenue:rawExecutiveProfitability.missing_cost_revenue,
    requireAdAssignment:false
  });
  const executiveProfitability=financialTrustModule.applyProfitabilityGate(rawExecutiveProfitability,executiveFinancialTrust);
  const naverExecutiveBoard=naverExecutiveBoardModule.buildNaverExecutiveBoard({
    currentAdRows:recentNaver,
    previousAdRows:previousNaver,
    cafe24Orders:ordersResult.data||[],
    naverOrders:naverCommerceOrdersResult.data||[],
    naverSettlements:naverCommerceSettlementsResult.data||[],
    profitability:executiveProfitability,
    productAdTargets,
    searchTermCenter:naverSearchTermCenter,
    periodStart:weekStart,
    periodEnd:latestNaverDate,
    targetRoas:targetRoasPercent,
    asOf:generatedAt,
    unavailable:{
      ads:Boolean(naverStatsResult.unavailable),
      orders:Boolean(naverCommerceOrdersResult.unavailable),
      settlements:Boolean(naverCommerceSettlementsResult.unavailable)
    }
  });
  const aiSnapshot=aiFoundationModule.buildNaverAiSnapshot(naverExecutiveBoard);
  const aiConfiguration=openaiClientModule.configuration();
  const aiFoundation={
    phase:'12-4',
    configured:aiConfiguration.configured,
    execution_enabled:aiConfiguration.execution_enabled,
    model:aiConfiguration.model,
    structured_outputs:aiConfiguration.structured_outputs,
    pii_guard:aiConfiguration.pii_guard,
    file_search_configured:aiConfiguration.file_search_configured,
    write_actions_enabled:false,
    snapshot_token:authModule.signAiSnapshot(aiSnapshot)
  };
  const financialReadiness = financialReadinessModule.buildFinancialReadiness({
    performance:unifiedProductPerformance,
    profitability:liveProfitability,
    financialTrust,
    productCosts:costsResult.data||[],
    channelCostSettings:effectiveChannelCostSettings,
    channelShippingRules:shippingRulesResult.data||[]
  });
  const trustedNaverPerformance = financialTrustModule.applyBidGuideGate(naverPerformance, financialTrust);
  keywordTop=keywordTop.map(item=>({...item,metrics:financialTrustModule.applyBidGuideGate(item.metrics,financialTrust)}));
  keywordWaste=keywordWaste.map(item=>({...item,metrics:financialTrustModule.applyBidGuideGate(item.metrics,financialTrust)}));
  const trustedNaverTopCampaigns=naverTopCampaigns.map(item=>({...item,metrics:financialTrustModule.applyBidGuideGate(item.metrics,financialTrust)}));
  const financialTrustToken=authModule.signFinancialTrust(financialTrust);
  const pacing = await pacingPromise;
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
  const reportLearningHistory=reportLearningModule.buildLearningHistory({
    reports:reportsResult.data||[],
    automationRuns:automationResult.data||[]
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
  const aiPagePanels=aiPagePanelsModule.buildAiPagePanels({
    dataHealth,
    priorityCenter,
    salesCommandCenter,
    productOperations,
    unifiedInventory,
    unifiedSettlement,
    searchTermCenter:naverSearchTermCenter,
    aiConfiguration,
    generatedAt,
    period:kstScheduleModule.kstDateKey(generatedAt)
  });
  for(const [pageKey,panel] of Object.entries(aiPagePanels)){
    const preview=aiPageResultsModule.buildPagePreview({
      page:pageKey,
      period:panel.period,
      generatedAt,
      dataStatus:panel.data_status,
      metrics:panel.metrics,
      panel
    });
    panel.preview_result=preview.result;
    panel.preview_formula_version=preview.snapshot.formula_version;
    panel.snapshot_token=authModule.signAiSnapshot(preview.snapshot);
    panel.latest_result=latestAiPageResults[pageKey]||null;
  }
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
      periodStart:weekStart, periodEnd:latestNaverDate,
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
  const channelConnections = await channelCapabilitiesModule.buildChannelCapabilities({
    syncs:syncResult.data || [],
    cafe24Counts:{ products:productsResult.data?.length || 0, orders:orders.length },
    coupangCounts:{
      products:coupangProductsResult.data?.length || 0,
      orders:coupangOrdersResult.data?.length || 0,
      inquiries:coupangInquiriesResult.data?.length || 0,
      claims:(coupangReturnsResult.data?.length || 0) + (coupangExchangesResult.data?.length || 0)
    }
  });
  const collectionCenter = unifiedCollectionModule.buildUnifiedCollectionCenter({
    dataHealth,
    channelConnections,
    syncs:syncResult.data || [],
    automationRuns:automationResult.data || [],
    qualityChecks:qaResult.data || [],
    alerts:alertsResult.data || [],
    queueHealth:coupangQueueHealth
  });
  const unifiedOrders = unifiedOrdersModule.buildUnifiedOrders({
    cafe24Orders:ordersResult.data || [], cafe24OrderItems:itemsResult.data || [],
    naverOrders:naverCommerceOrdersResult.data || [], naverOrderItems:naverCommerceItemsResult.data || [],
    coupangOrders:coupangOrdersResult.data || [], coupangOrderItems:coupangItemsResult.data || [],
    coupangReturns:coupangReturnsResult.data || [], coupangRgOrders:coupangRgOrdersResult.data || [],
    coupangRgOrderItems:coupangRgOrderItemsResult.data || [], channelConnections:channelConnections.channels || [],
    unavailable:{ CAFE24:Boolean(ordersResult.unavailable), COUPANG:Boolean(coupangOrdersResult.unavailable && coupangRgOrdersResult.unavailable), NAVER:Boolean(naverCommerceOrdersResult.unavailable) }
  });
  const coupangReturnViews=(coupangReturnsResult.data || []).map(returnCaseView);
  const coupangExchangeViews=(coupangExchangesResult.data || []).map(exchangeCaseView);
  const customerService=unifiedCustomerServiceModule.buildUnifiedCustomerService({
    cafe24Orders:ordersResult.data || [], cafe24OrderItems:itemsResult.data || [],
    coupangOrders:coupangOrdersResult.data || [], coupangOrderItems:coupangItemsResult.data || [],
    coupangReturns:coupangReturnViews, coupangExchanges:coupangExchangeViews,
    coupangInquiries:(coupangInquiriesResult.data || []).map(({raw_data,...item})=>item),
    channelItems:channelCsItems,
    collectorPlatforms:[...new Set((syncResult.data || [])
      .filter(item=>item.job_type==='CUSTOMER_SERVICE'&&['SUCCESS','PARTIAL'].includes(item.status))
      .map(item=>item.platform))],
    operationAudits:csOperationAudits, channelConnections:channelConnections.channels || []
  });
  return {
    loadedView:view,
    generatedAt,
    dataHealth,
    channelConnections,
    collectionCenter,
    unifiedOrders,
    customerService,
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
    products: (productsResult.data || []).map(product => {
      const catalog = cafe24CatalogModule.catalogProduct(product);
      return {
        id: product.external_product_no,
        name: product.product_name,
        price: number(product.price),
        selling: product.selling,
        display: product.display,
        catalog_status:catalog.catalog_status,
        status_label:catalog.status_label,
        is_sellable:catalog.is_sellable,
        excluded:catalog.excluded,
        exclusion_reason:catalog.exclusion_reason,
        image: product.raw_data?.small_image || product.raw_data?.list_image || null
      };
    }),
    syncs: syncResult.data || [],
    reports: reportsResult.data || [],
    reportLearningHistory,
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
    productOperations,
    unifiedInventory,
    unifiedSettlement,
    unifiedProductPerformance:trustedProductPerformance,
    productAdTargets,
    financialReadiness,
    productCosts: costsResult.data || [],
    channelCostSettings: channelCostsResult.data || [],
    channelShippingRules: shippingRulesResult.data || [],
    shippingRuleEvidence,
    costCalibration,
    liveProfitability:trustedProfitability,
    financialTrust,
    financialTrustToken,
    naverBidWorkbench,
    aiFoundation,
    aiPagePanels,
    pacing,
    naver: { campaigns:naverCampaignResult.data?.length||0, adgroups:naverGroupResult.count||0, keywords:naverKeywordResult.count||0, latestSync:naverSyncResult.data||null, periodStart:weekStart, periodEnd:latestNaverDate, totals:{...naverTotals,roas:naverPerformance.roasPercent,ctr:naverPerformance.ctrPercent,metrics:trustedNaverPerformance}, daily:[...naverDailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)), topCampaigns:trustedNaverTopCampaigns, keywordPeriod, keywordTop, keywordWaste, searchTermCenter:naverSearchTermCenter, marketingDiagnosis, executiveBoard:naverExecutiveBoard },
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
      returns: coupangReturnViews,
      returnCount: coupangReturnsResult.data?.length || 0,
      exchanges: coupangExchangeViews,
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

async function renderDashboardState(initialState) {
  const cookieStore = await cookies();
  const currentUser = await authModule.validateSession(cookieStore.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if (!currentUser) redirect('/login');
  try {
    return <Dashboard initialData={await getDashboardData(initialState)} initialState={initialState} />;
  } catch (error) {
    return <Dashboard initialData={{ error: error.message }} initialState={initialState} />;
  }
}

export async function renderDashboardRoute(view, searchParams) {
  const params=await searchParams;
  const initialState=hubRoutesModule.normalizeHubState({...params,view});
  return renderDashboardState(initialState);
}

export default async function Home({ searchParams }) {
  const initialState = hubRoutesModule.normalizeHubState(await searchParams);
  return renderDashboardState(initialState);
}
