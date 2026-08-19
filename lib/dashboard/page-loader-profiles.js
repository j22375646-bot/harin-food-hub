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

const VIEW_PROFILES = {
  main:['cafe24_orders','naver_commerce_orders','coupang_orders','coupang_rg_orders','coupang_rg_inventory','business_targets','customer_service_items'],
  orders:['cafe24_orders','cafe24_order_items','cafe24_products','cafe24_oauth_tokens','channel_products','naver_commerce_orders','naver_commerce_order_items','coupang_products','coupang_product_items','coupang_orders','coupang_order_items','coupang_rg_orders','coupang_returns','shipping_reference_snapshots','ai_analysis_results'],
  inventory:['cafe24_oauth_tokens','coupang_products','coupang_product_items','coupang_rg_inventory','coupang_item_inventory','ai_analysis_results'],
  insight:['reports','platform_events','alerts','ai_analysis_results'],
  keyword:[...PRODUCT_CORE,...NAVER_AD_CORE,...COUPANG_AD_CORE,'naver_search_terms','product_detail_checklists'],
  product:[...PRODUCT_CORE,'cafe24_orders','cafe24_order_items','cafe24_products','product_ad_targets','product_mapping_history','product_detail_checklists',...NAVER_AD_CORE,'coupang_orders','coupang_order_items','coupang_settlements','coupang_rg_orders','coupang_rg_order_items','coupang_cost_transactions',...COUPANG_AD_CORE]
};

const WORKSPACE_PROFILES = {
  insight:{
    overview:['reports','platform_events','alerts','cafe24_oauth_tokens','ai_analysis_results'],
    causes:['reports','actions','platform_events','alerts','cafe24_oauth_tokens','ai_analysis_results'],
    channels:['reports','actions','platform_events','alerts','cafe24_oauth_tokens','ai_analysis_results'],
    profitability:[...PRODUCT_PERFORMANCE_CORE,'alerts']
  },
  keyword:{
    'search-terms':['naver_keywords','naver_search_terms','cafe24_oauth_tokens','ai_analysis_results'],
    registered:[...PRODUCT_CORE,'product_ad_targets','cafe24_oauth_tokens',...NAVER_AD_CORE,...COUPANG_AD_CORE],
    diagnosis:[...PRODUCT_CORE,'product_ad_targets','cafe24_oauth_tokens',...NAVER_AD_CORE,...COUPANG_AD_CORE,'product_detail_checklists'],
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

module.exports={VIEW_PROFILES,WORKSPACE_PROFILES,profileForState,createLoaderSession};
