'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const loaders=require('../lib/dashboard/page-loader-profiles.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-2 gives orders and Rocket Growth inventory independent table profiles',()=>{
  const orders=loaders.profileForState({view:'orders',workspace:null,platform:'all'});
  const inventory=loaders.profileForState({view:'inventory',workspace:null,platform:'coupang'});
  assert.ok(orders.tables.includes('cafe24_orders'));
  assert.ok(orders.tables.includes('naver_commerce_orders'));
  assert.ok(orders.tables.includes('coupang_orders'));
  assert.equal(orders.tables.includes('coupang_rg_order_items'),false);
  assert.equal(orders.tables.includes('shipping_reference_snapshots'),true);
  assert.equal(orders.tables.includes('cafe24_oauth_tokens'),true);
  assert.equal(inventory.tables.includes('coupang_rg_inventory'),true);
  assert.equal(inventory.tables.includes('cafe24_products'),false);
  assert.equal(inventory.tables.includes('naver_commerce_orders'),false);
  assert.equal(inventory.tables.includes('cafe24_oauth_tokens'),true);
  assert.equal(inventory.target_ms,2500);
});

test('23-2 never mixes Naver and Coupang keyword provider queries',()=>{
  const naver=loaders.profileForState({view:'keyword',workspace:'registered',platform:'naver'});
  const coupang=loaders.profileForState({view:'keyword',workspace:'registered',platform:'coupang'});
  const searchTerms=loaders.profileForState({view:'keyword',workspace:'search-terms',platform:'naver'});
  const diagnosisNaver=loaders.profileForState({view:'keyword',workspace:'diagnosis',platform:'naver'});
  const diagnosisCoupang=loaders.profileForState({view:'keyword',workspace:'diagnosis',platform:'coupang'});
  assert.ok(naver.tables.includes('naver_keywords'));
  assert.equal(naver.tables.some(table=>table.startsWith('coupang_')),false);
  assert.ok(coupang.tables.includes('coupang_ad_keyword_summary'));
  assert.equal(coupang.tables.some(table=>table.startsWith('naver_')),false);
  assert.equal(naver.tables.includes('cafe24_oauth_tokens'),true);
  assert.equal(coupang.tables.includes('cafe24_oauth_tokens'),true);
  assert.equal(naver.tables.includes('product_ad_targets'),true);
  assert.deepEqual(searchTerms.tables,['naver_keywords','naver_search_terms','cafe24_oauth_tokens','ai_analysis_results']);
  assert.equal(diagnosisNaver.tables.some(table=>table.startsWith('coupang_')),false);
  assert.equal(diagnosisCoupang.tables.some(table=>table.startsWith('naver_')),false);
  assert.equal(diagnosisNaver.tables.includes('product_detail_checklists'),true);
  assert.equal(diagnosisCoupang.tables.includes('channel_products'),false);
  assert.equal(diagnosisCoupang.tables.includes('product_costs'),false);
  assert.deepEqual(diagnosisCoupang.tables,[
    'cafe24_oauth_tokens','ai_analysis_results','coupang_ad_daily_summary',
    'coupang_ad_keyword_summary','coupang_ad_campaign_summary','coupang_ad_billing_daily'
  ]);
  assert.equal(naver.target_ms,4000);
});

test('23-2 scopes insight and product workspaces to the data they render',()=>{
  const collection=loaders.profileForState({view:'collection',workspace:'overview',platform:'all'});
  const overview=loaders.profileForState({view:'insight',workspace:'overview',platform:'all'});
  const causes=loaders.profileForState({view:'insight',workspace:'causes',platform:'all'});
  const channels=loaders.profileForState({view:'insight',workspace:'channels',platform:'all'});
  const history=loaders.profileForState({view:'keyword',workspace:'history',platform:'naver'});
  const profit=loaders.profileForState({view:'insight',workspace:'profitability',platform:'all'});
  const costs=loaders.profileForState({view:'product',workspace:'costs',platform:'all'});
  const mappings=loaders.profileForState({view:'product',workspace:'mappings',platform:'all'});
  const catalog=loaders.profileForState({view:'product',workspace:'catalog',platform:'all'});
  const naverCatalog=loaders.profileForState({view:'product',workspace:'catalog',platform:'naver'});
  const productProfit=loaders.profileForState({view:'product',workspace:'profit',platform:'all'});
  const adTargets=loaders.profileForState({view:'product',workspace:'ad-targets',platform:'all'});
  assert.deepEqual(collection.tables,[
    'cafe24_oauth_tokens','cafe24_products','coupang_products','automation_runs',
    'coupang_sync_requests','coupang_operation_requests','worker_heartbeats'
  ]);
  assert.equal(collection.tables.some(table=>table.startsWith('coupang_ad_')),false);
  assert.deepEqual(overview.tables,['reports','platform_events','alerts','cafe24_oauth_tokens','ai_analysis_results']);
  assert.deepEqual(causes.tables,['reports','actions','platform_events','alerts','cafe24_oauth_tokens','ai_analysis_results']);
  assert.deepEqual(channels.tables,['reports','actions','platform_events','alerts','cafe24_oauth_tokens','ai_analysis_results']);
  assert.deepEqual(history.tables,['financial_change_requests','cafe24_oauth_tokens','ai_analysis_results']);
  assert.deepEqual(profit.tables,[
    'master_products','channel_products','product_costs','channel_cost_settings','channel_shipping_rules','ai_analysis_results',
    'cafe24_products','cafe24_orders','cafe24_order_items','cafe24_oauth_tokens','naver_keywords','naver_keyword_stats',
    'coupang_orders','coupang_order_items','coupang_product_items','coupang_rg_orders','coupang_rg_order_items','coupang_ad_keyword_daily','alerts'
  ]);
  assert.ok(profit.tables.includes('product_costs'));
  assert.equal(profit.tables.includes('coupang_settlements'),false);
  assert.ok(costs.tables.includes('product_costs'));
  assert.equal(costs.tables.includes('coupang_orders'),false);
  assert.equal(costs.tables.includes('cafe24_oauth_tokens'),true);
  assert.equal(mappings.tables.includes('product_mapping_history'),true);
  assert.equal(mappings.tables.includes('coupang_item_inventory'),false);
  assert.equal(mappings.tables.includes('coupang_orders'),false);
  assert.equal(mappings.tables.includes('cafe24_oauth_tokens'),true);
  assert.equal(catalog.tables.includes('cafe24_oauth_tokens'),true);
  assert.deepEqual(naverCatalog.tables,['channel_products','cafe24_oauth_tokens','ai_analysis_results']);
  assert.equal(productProfit.tables.includes('coupang_settlements'),false);
  assert.equal(productProfit.tables.includes('naver_commerce_orders'),false);
  assert.equal(productProfit.tables.includes('coupang_ad_keyword_daily'),true);
  assert.equal(adTargets.tables.includes('product_ad_targets'),true);
});

test('23-R3 scopes every collection workspace to its own provider data',()=>{
  const naver=loaders.profileForState({view:'collection',workspace:'naver-api',platform:'all'});
  const advertising=loaders.profileForState({view:'collection',workspace:'advertising',platform:'all'});
  const shipping=loaders.profileForState({view:'collection',workspace:'shipping-reference',platform:'all'});
  const operations=loaders.profileForState({view:'collection',workspace:'operations-health',platform:'all'});
  const runtime=loaders.profileForState({view:'collection',workspace:'provider-runtime',platform:'all'});
  assert.deepEqual(naver.tables,['cafe24_oauth_tokens','cafe24_products','coupang_products']);
  assert.equal(advertising.tables.includes('naver_stats_daily'),true);
  assert.equal(advertising.tables.includes('coupang_ad_keyword_summary'),true);
  assert.equal(shipping.tables.includes('shipping_reference_snapshots'),true);
  assert.equal(shipping.tables.includes('operations_health_snapshots'),false);
  assert.equal(operations.tables.includes('operations_health_snapshots'),true);
  assert.equal(operations.tables.some(table=>table.startsWith('coupang_ad_')),false);
  assert.equal(runtime.tables.includes('provider_request_runs'),true);
  assert.equal(runtime.tables.includes('optional_provider_snapshots'),true);
});

test('23-2 records real, skipped and target loader telemetry',()=>{
  const session=loaders.createLoaderSession({view:'inventory',platform:'coupang'});
  session.mark('coupang_rg_inventory',true);
  session.mark('cafe24_orders',false);
  session.finish('coupang_rg_inventory',180,false);
  const snapshot=session.snapshot();
  assert.equal(snapshot.profile,'inventory:default:coupang');
  assert.equal(snapshot.remote_query_count,1);
  assert.deepEqual(snapshot.remote_tables,['coupang_rg_inventory']);
  assert.equal(snapshot.skipped_query_count,1);
  assert.deepEqual(snapshot.slow_queries,[{table:'coupang_rg_inventory',duration_ms:180,failed:false}]);
  assert.equal(snapshot.within_target,true);
});

test('23-2 dashboard uses the focused profile and exposes loader timing',()=>{
  const page=read('app/dashboard-route.js');
  const dashboard=read('app/legacy-dashboard-client.js');
  const analysis=read('app/_analysis/harin-analysis-workbench.js');
  assert.match(page,/pageLoaderProfilesModule\.createLoaderSession/);
  assert.match(page,/loaderPerformance:loaderSession\.snapshot\(\)/);
  assert.match(page,/databaseForLoaderState\(db, view, workspace, platform='all', loaderSession=null\)/);
  assert.match(page,/orders:\{orders:200,items:400,costs:300\}/);
  assert.match(page,/view==='collection'[\s\S]*?\? SHELL_TABLES[\s\S]*?MINIMAL_SHELL_TABLES:LIGHT_SHELL_TABLES/);
  assert.match(page,/coupang_orders'[\s\S]*?limit\(rowLimit\('orders',2000\)\)/);
  assert.match(page,/shippingReference:view==='orders'[\s\S]*?\.eq\('provider','HOLIDAY_CALENDAR'\)[\s\S]*?\.limit\(10\)/);
  assert.match(page,/\.limit\(view==='orders'\?100:500\)/);
  assert.match(page,/coupang_product_items'[\s\S]*?\.limit\(view==='orders'\?200:1000\)/);
  assert.match(page,/naver_commerce_orders'\)\.select\(view==='main'\?'order_id[\s\S]*?updated_at':view==='orders'\?'order_id[\s\S]*?updated_at':'order_id[\s\S]*?raw_data,updated_at'/);
  assert.match(page,/cafe24_products'[\s\S]*?\.limit\(view==='orders'\?100:500\)/);
  assert.match(page,/if\(view==='orders'\)\{[\s\S]*?return buildOrdersDashboardData\(/);
  assert.match(page,/buildOrdersDashboardData[\s\S]*?finalizeAiPagePanels\(\{orders:builtPanels\.orders\}/);
  assert.match(page,/if\(view==='inventory'\|\|focusedInsightReport\|\|\(view==='product'&&state\?\.workspace==='costs'\)\)\{/);
  assert.match(page,/return buildInventoryDashboardData\(/);
  assert.match(page,/buildInventoryDashboardData[\s\S]*?finalizeAiPagePanels\(\{inventory:builtPanels\.inventory\}/);
  assert.match(page,/return buildInsightOverviewDashboardData\(/);
  assert.match(page,/buildInsightOverviewDashboardData[\s\S]*?finalizeAiPagePanels\(\{insight:builtPanels\.insight\}/);
  assert.match(page,/return buildProductCostsDashboardData\(/);
  assert.match(page,/buildProductCostsDashboardData[\s\S]*?finalizeAiPagePanels\(\{product:builtPanels\.product\}/);
  assert.match(page,/focusedProductWorkspace=view==='product'/);
  assert.match(page,/return buildProductCatalogDashboardData\(/);
  assert.match(page,/buildProductCatalogDashboardData[\s\S]*?mappingService\.buildMappingDashboard/);
  assert.match(page,/focusedProductPerformance=view==='product'/);
  assert.match(page,/: buildProductPerformanceDashboardData\(performanceInput\)/);
  assert.match(page,/buildProductPerformanceDashboardData[\s\S]*?loadUnifiedProductPerformance/);
  assert.match(page,/const seoulDateKey[\s\S]*?periodEnd=seoulDateKey\(generatedAt\)/);
  assert.match(page,/focusedKeywordHistory=view==='keyword'/);
  assert.match(page,/return buildKeywordHistoryDashboardData\(/);
  assert.match(page,/buildInsightChannelsDashboardData/);
  assert.match(page,/focusedInsightProfitability=view==='insight'/);
  assert.match(page,/return focusedInsightProfitability[\s\S]*?buildInsightProfitabilityDashboardData/);
  assert.match(page,/buildInsightProfitabilityDashboardData[\s\S]*?finalizeAiPagePanels\(\{insight:builtPanels\.insight\}/);
  assert.match(page,/focusedSearchTerms=view==='keyword'&&state\?\.workspace==='search-terms'/);
  assert.match(page,/return buildSearchTermsDashboardData\(/);
  assert.match(page,/buildSearchTermsDashboardData[\s\S]*?finalizeAiPagePanels\(\{keyword:builtPanels\.keyword\}/);
  assert.match(page,/focusedKeywordWorkspace=view==='keyword'&&\['registered','diagnosis'\]\.includes\(state\?\.workspace\)/);
  assert.match(page,/return buildRegisteredKeywordDashboardData\(/);
  assert.match(page,/buildRegisteredKeywordDashboardData[\s\S]*?finalizeAiPagePanels\(\{keyword:builtPanels\.keyword\}/);
  assert.match(page,/selectedPlatform==='naver'[\s\S]*?registered_keyword_performance[\s\S]*?registered_keyword_catalog/);
  assert.match(page,/workspace==='diagnosis'&&isNaver\?marketingDiagnosisModule\.buildMarketingDiagnosis/);
  assert.match(page,/return buildInsightCausesDashboardData\(/);
  assert.match(page,/buildInsightCausesDashboardData[\s\S]*?loadedWorkspace:'causes'/);
  assert.match(page,/reportsResult\.count\?\?reportsResult\.data\?\.length\?\?0/);
  assert.match(page,/view==='insight'&&state\?\.workspace==='overview'[\s\S]*?select\(reportFields,\{count:'exact'\}\)[\s\S]*?limit\(12\)/);
  assert.match(page,/focusedEarlyReturn\?Promise\.resolve\(\{data:null,error:null\}\):db\.from\('sync_logs'\)/);
  assert.match(page,/cafe24Token:focusedEarlyReturn\|\|view==='collection' \? Promise\.allSettled/);
  assert.match(page,/cafe24Token:cafe24TokenSettled\.results\[0\]\.data\?\.token_data\|\|null/);
  assert.match(analysis,/loadedReportCount=\(data\.reports\|\|\[\]\)\.filter\(report=>scopeReportPlatform\(report\.platform,platform\)\)\.length/);
  assert.match(dashboard,/data-loader-profile=\{initialData\.loaderPerformance\?\.profile/);
  assert.match(dashboard,/data-loader-ms=\{initialData\.loaderPerformance\?\.duration_ms/);
  assert.match(dashboard,/data-loader-slowest=\{/);
});

test('26-8 gives customer service a focused loader instead of the full dashboard waterfall',()=>{
  const page=read('app/dashboard-route.js');
  const cs=loaders.profileForState({view:'cs',workspace:null,platform:'all'},[
    'cafe24_orders','cafe24_order_items','cafe24_oauth_tokens','coupang_orders','coupang_order_items',
    'coupang_returns','coupang_exchanges','coupang_inquiries','coupang_operation_requests',
    'customer_service_items','ai_analysis_results'
  ]);

  assert.ok(cs.tables.includes('customer_service_items'));
  assert.ok(cs.tables.includes('coupang_inquiries'));
  assert.ok(cs.tables.includes('cafe24_oauth_tokens'));
  assert.ok(cs.tables.includes('ai_analysis_results'));
  assert.equal(cs.tables.includes('naver_keyword_stats'),false);
  assert.equal(cs.tables.includes('coupang_settlements'),false);
  assert.match(page,/focusedEarlyReturn=view==='main'\|\|view==='orders'\|\|view==='cs'/);
  assert.match(page,/if\(view==='cs'\)\{[\s\S]*?return buildCsDashboardData\(/);
  assert.match(page,/buildCsDashboardData[\s\S]*?finalizeAiPagePanels\(\{cs:builtPanels\.cs\}/);
});

test('26-8 gives diagnoses and change history focused execution loaders',()=>{
  const page=read('app/dashboard-route.js');
  const reports=loaders.profileForState({view:'reports',workspace:null,platform:'all'});
  const changes=loaders.profileForState({view:'changes',workspace:null,platform:'all'});

  assert.ok(reports.tables.includes('reports'));
  assert.ok(reports.tables.includes('automation_runs'));
  assert.ok(reports.tables.includes('financial_change_requests'));
  assert.ok(reports.tables.includes('ai_analysis_results'));
  assert.equal(reports.tables.includes('cafe24_orders'),false);
  assert.equal(reports.tables.includes('coupang_orders'),false);
  assert.equal(reports.tables.includes('product_costs'),false);

  assert.ok(changes.tables.includes('financial_change_requests'));
  assert.ok(changes.tables.includes('financial_change_audit_logs'));
  assert.ok(changes.tables.includes('naver_campaigns'));
  assert.ok(changes.tables.includes('naver_adgroups'));
  assert.ok(changes.tables.includes('naver_keywords'));
  assert.ok(changes.tables.includes('naver_keyword_stats'));
  assert.ok(changes.tables.includes('naver_keyword_product_links'));
  assert.ok(changes.tables.includes('product_ad_targets'));
  assert.equal(changes.tables.includes('cafe24_orders'),false);
  assert.equal(changes.tables.includes('coupang_orders'),false);
  assert.equal(changes.tables.some(table=>table.startsWith('coupang_')),false);

  assert.match(page,/focusedEarlyReturn=view==='main'\|\|view==='orders'\|\|view==='cs'\|\|view==='inventory'\|\|view==='reports'\|\|view==='changes'/);
  assert.match(page,/if\(view==='reports'\)\{[\s\S]*?return buildReportsDashboardData\(/);
  assert.match(page,/buildReportsDashboardData[\s\S]*?buildLearningHistory/);
  assert.match(page,/buildReportsDashboardData[\s\S]*?finalizeAiPagePanels\(\{reports:builtPanels\.reports\}/);
  assert.match(page,/if\(view==='changes'\)\{[\s\S]*?return buildChangesDashboardData\(/);
  assert.match(page,/buildChangesDashboardData[\s\S]*?buildNaverBidWorkbench/);
  assert.match(page,/buildChangesDashboardData[\s\S]*?finalizeAiPagePanels\(\{changes:builtPanels\.changes\}/);
});

test('26-8 prewarms Naver change inputs and keeps unrelated Coupang jobs out of execution pages',()=>{
  const page=read('app/dashboard-route.js');

  assert.match(page,/const MINIMAL_SHELL_TABLES = \['sync_logs','alerts'\]/);
  assert.match(page,/\['reports','changes','validation','experiments'\]\.includes\(view\)\?MINIMAL_SHELL_TABLES/);
  assert.match(page,/const changesBidInputsPromise=view==='changes'/);
  assert.match(page,/changesBidInputsPromise[\s\S]*?activeAdgroupIds/);
  assert.match(page,/changesBidInputsPromise[\s\S]*?change_keyword_performance/);
  assert.match(page,/if\(view==='changes'\)[\s\S]*?changesBidInputsPromise/);
});

test('26-8 loads only indexed latest report links for the change workbench',()=>{
  const page=read('app/dashboard-route.js');

  assert.match(page,/view==='changes'[\s\S]*?from\('reports'\)[\s\S]*?select\('id,platform,title,created_at'\)[\s\S]*?eq\('is_latest',true\)[\s\S]*?order\('created_at',\{ascending:false\}\)[\s\S]*?limit\(12\)/);
});
