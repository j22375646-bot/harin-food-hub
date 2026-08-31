'use strict';

const unique = values => [...new Set((values || []).filter(Boolean))];

const PRODUCT_CORE = ['master_products','channel_products','product_costs','channel_cost_settings','channel_shipping_rules','ai_analysis_results'];
const NAVER_AD_CORE = ['naver_campaigns','naver_adgroups','naver_keywords','naver_stats_daily','naver_keyword_stats','naver_keyword_product_links'];
const COUPANG_AD_CORE = ['coupang_products','coupang_product_items','coupang_rg_inventory','coupang_item_inventory','coupang_ad_daily_summary','coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily','coupang_ad_keyword_daily'];
const PRODUCT_PERFORMANCE_CORE = [
  ...PRODUCT_CORE,'cafe24_products','cafe24_orders','cafe24_order_items','cafe24_oauth_tokens',
  'naver_keywords','naver_keyword_stats','coupang_orders','coupang_order_items','coupang_product_items',
  'coupang_rg_orders','coupang_rg_order_items','coupang_ad_keyword_daily'
];
const COLLECTION_READINESS_CORE = ['cafe24_oauth_tokens','cafe24_products','coupang_products'];

const VIEW_PROFILES = {
  main:[
    'cafe24_orders','cafe24_order_items','cafe24_oauth_tokens','naver_commerce_orders','naver_commerce_order_items',
    'coupang_orders','coupang_order_items','coupang_rg_orders','coupang_rg_order_items','coupang_product_items','coupang_returns',
    'coupang_rg_inventory','business_targets','customer_service_items','reports','hub_work_items',
    'channel_products','product_costs','channel_cost_settings','channel_shipping_rules','naver_stats_daily','coupang_ad_daily_summary'
  ],
  calendar:['hub_work_items'],
  orders:['cafe24_orders','cafe24_order_items','cafe24_products','cafe24_oauth_tokens','channel_products','naver_commerce_orders','naver_commerce_order_items','coupang_products','coupang_product_items','coupang_orders','coupang_order_items','coupang_rg_orders','coupang_returns','shipping_reference_snapshots','ai_analysis_results'],
  cs:[
    'cafe24_orders','cafe24_order_items','cafe24_oauth_tokens',
    'coupang_orders','coupang_order_items','coupang_returns','coupang_exchanges','coupang_inquiries',
    'coupang_operation_requests','customer_service_items','ai_analysis_results'
  ],
  inventory:['cafe24_oauth_tokens','coupang_products','coupang_product_items','coupang_rg_inventory','coupang_item_inventory','inventory_lots','ai_analysis_results'],
  insight:['reports','platform_events','alerts','ai_analysis_results'],
  keyword:[...PRODUCT_CORE,...NAVER_AD_CORE,...COUPANG_AD_CORE,'naver_search_terms','product_detail_checklists'],
  'product-analysis':[...PRODUCT_PERFORMANCE_CORE,'reports'],
  product:[...PRODUCT_CORE,'cafe24_orders','cafe24_order_items','cafe24_products','product_ad_targets','product_mapping_history','product_detail_checklists',...NAVER_AD_CORE,'coupang_orders','coupang_order_items','coupang_settlements','coupang_rg_orders','coupang_rg_order_items','coupang_cost_transactions',...COUPANG_AD_CORE],
  reports:[
    'reports','actions','action_evaluations','automation_runs',
    'financial_change_requests','financial_change_audit_logs','ab_tests','ai_analysis_results'
  ],
  changes:[
    'reports','actions','action_evaluations','automation_runs',
    'financial_change_requests','financial_change_audit_logs','ab_tests',
    'master_products','product_costs','product_ad_targets',
    'naver_campaigns','naver_adgroups','naver_keywords','naver_keyword_stats','naver_keyword_product_links',
    'ai_analysis_results'
  ],
  validation:['actions','action_evaluations','financial_change_requests','financial_change_audit_logs','ai_analysis_results'],
  experiments:['ab_tests','ai_analysis_results']
};

const WORKSPACE_PROFILES = {
  collection:{
    // The collection landing page is a connection and retry workbench. Ad
    // performance and settlement rows belong to their dedicated routes and
    // previously made this status screen wait on the slowest analytics tables.
    // Open alerts already carry the latest quality exceptions and the page AI
    // is deterministic while paid AI execution is disabled. Avoid blocking the
    // landing screen on the historically slow quality/AI history tables.
    overview:[...COLLECTION_READINESS_CORE,'automation_runs','coupang_sync_requests','coupang_operation_requests','worker_heartbeats'],
    'naver-api':COLLECTION_READINESS_CORE,
    advertising:[
      ...COLLECTION_READINESS_CORE,
      'naver_campaigns','naver_adgroups','naver_keywords','naver_stats_daily',
      'coupang_ad_daily_summary','coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily'
    ],
    'provider-fallback':[...COLLECTION_READINESS_CORE,'owned_site_api_snapshots'],
    'optional-providers':[...COLLECTION_READINESS_CORE,'optional_provider_snapshots'],
    'provider-runtime':[
      ...COLLECTION_READINESS_CORE,'provider_request_runs','market_context_snapshots','market_sources',
      'owned_site_api_snapshots','shipping_reference_snapshots','operations_health_snapshots','optional_provider_snapshots'
    ],
    'execution-paths':[...COLLECTION_READINESS_CORE,'execution_path_controls','automation_runs'],
    'owned-site':[...COLLECTION_READINESS_CORE,'owned_site_api_snapshots'],
    'shipping-reference':[...COLLECTION_READINESS_CORE,'shipping_reference_snapshots'],
    'operations-health':[...COLLECTION_READINESS_CORE,'operations_health_snapshots','worker_heartbeats']
  },
  insight:{
    overview:['reports','platform_events','alerts','automation_runs','cafe24_oauth_tokens','ai_analysis_results'],
    saved:['reports','platform_events','alerts','automation_runs','cafe24_oauth_tokens','ai_analysis_results'],
    causes:['reports','actions','platform_events','alerts','automation_runs','cafe24_oauth_tokens','ai_analysis_results'],
    channels:['reports','actions','platform_events','alerts','automation_runs','cafe24_oauth_tokens','ai_analysis_results'],
    diagnostics:['reports','automation_runs','alerts','cafe24_oauth_tokens','ai_analysis_results'],
    profitability:[...PRODUCT_PERFORMANCE_CORE,'automation_runs','alerts']
  },
  keyword:{
    'search-terms':['naver_keywords','naver_search_terms','cafe24_oauth_tokens','ai_analysis_results'],
    registered:[...PRODUCT_CORE,'product_ad_targets','cafe24_oauth_tokens',...NAVER_AD_CORE,...COUPANG_AD_CORE],
    diagnosis:[...PRODUCT_CORE,'product_ad_targets','cafe24_oauth_tokens',...NAVER_AD_CORE,...COUPANG_AD_CORE,'product_detail_checklists'],
    performance:[...PRODUCT_CORE,'product_ad_targets','cafe24_oauth_tokens',...NAVER_AD_CORE],
    history:['financial_change_requests','cafe24_oauth_tokens','ai_analysis_results']
  },
  product:{
    catalog:['master_products','channel_products','cafe24_products','coupang_products','coupang_product_items','coupang_item_inventory','cafe24_oauth_tokens','ai_analysis_results'],
    mappings:['master_products','channel_products','cafe24_products','coupang_products','coupang_product_items','product_mapping_history','cafe24_oauth_tokens','ai_analysis_results'],
    costs:[...PRODUCT_CORE,'cafe24_products','cafe24_oauth_tokens','coupang_products','coupang_product_items'],
    profit:PRODUCT_PERFORMANCE_CORE,
    offers:[...PRODUCT_CORE,'cafe24_products','cafe24_oauth_tokens','coupang_products','coupang_product_items'],
    'ad-targets':[...PRODUCT_PERFORMANCE_CORE,'product_ad_targets']
  }
};

const PLATFORM_TABLES = {
  naver:['naver_campaigns','naver_adgroups','naver_keywords','naver_stats_daily','naver_keyword_stats','naver_search_terms','naver_keyword_product_links','naver_commerce_orders','naver_commerce_order_items','naver_commerce_settlements'],
  coupang:['coupang_products','coupang_product_items','coupang_rg_inventory','coupang_item_inventory','coupang_orders','coupang_order_items','coupang_settlements','coupang_rg_orders','coupang_rg_order_items','coupang_cost_transactions','coupang_ad_daily_summary','coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily','coupang_ad_keyword_daily'],
  cafe24:['cafe24_orders','cafe24_order_items','cafe24_products','cafe24_traffic_daily','cafe24_referrers_daily']
};

const COUPANG_KEYWORD_PROFILE = [
  'cafe24_oauth_tokens','ai_analysis_results','coupang_ad_daily_summary',
  'coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily'
];

const PRODUCT_CATALOG_PLATFORM_PROFILES = {
  naver:['channel_products','cafe24_oauth_tokens','ai_analysis_results'],
  cafe24:['master_products','channel_products','cafe24_products','cafe24_oauth_tokens','ai_analysis_results']
};

function applyPlatformScope(tables, state) {
  const platform=String(state?.platform||'all').toLowerCase();
  if(!['insight','keyword'].includes(state?.view)||platform==='all')return tables;
  const foreign=Object.entries(PLATFORM_TABLES)
    .filter(([key])=>key!==platform)
    .flatMap(([,values])=>values);
  const blocked=new Set(foreign);
  return tables.filter(table=>!blocked.has(table));
}

function profileForState(state={}, fallbackTables=[]) {
  const view=state.view||'main';
  const workspace=state.workspace||'default';
  const focused=WORKSPACE_PROFILES[view]?.[workspace];
  const coupangKeyword=view==='keyword'&&state.platform==='coupang'&&['registered','diagnosis'].includes(workspace);
  const productCatalog=view==='product'&&workspace==='catalog'&&PRODUCT_CATALOG_PLATFORM_PROFILES[state.platform];
  const base=coupangKeyword?COUPANG_KEYWORD_PROFILE:(productCatalog||focused||VIEW_PROFILES[view]||fallbackTables);
  const tables=unique(applyPlatformScope(base,state));
  const targetMs=['keyword'].includes(view)||view==='insight'&&workspace==='causes'?4000:2500;
  return {
    key:`${view}:${workspace}:${state.platform||'all'}`,
    view,
    workspace,
    platform:state.platform||'all',
    target_ms:targetMs,
    tables
  };
}

function scopeInsightReportQuery(query) {
  return query
    .eq('report_type','WEEKLY')
    .eq('is_latest',true)
    .in('platform',['NAVER','CAFE24','COUPANG'])
    .order('period_end',{ascending:false})
    .order('created_at',{ascending:false})
    .limit(36);
}

function createLoaderSession(state={}, fallbackTables=[]) {
  const profile=profileForState(state,fallbackTables);
  const startedAt=Date.now();
  const requested=[];
  const remote=[];
  const skipped=[];
  const completed=[];
  return {
    profile,
    mark(table,allowed){
      requested.push(table);
      (allowed?remote:skipped).push(table);
    },
    finish(table,durationMs,error=null){
      completed.push({table,duration_ms:Math.max(0,Number(durationMs)||0),failed:Boolean(error)});
    },
    snapshot(){
      const durationMs=Date.now()-startedAt;
      const slowQueries=[...completed]
        .sort((left,right)=>right.duration_ms-left.duration_ms)
        .slice(0,5);
      return {
        profile:profile.key,
        target_ms:profile.target_ms,
        duration_ms:durationMs,
        within_target:durationMs<=profile.target_ms,
        remote_query_count:remote.length,
        remote_tables:unique(remote),
        skipped_query_count:skipped.length,
        requested_query_count:requested.length,
        completed_query_count:completed.length,
        slow_queries:slowQueries
      };
    }
  };
}

module.exports={VIEW_PROFILES,WORKSPACE_PROFILES,profileForState,scopeInsightReportQuery,createLoaderSession};
