'use strict';

const monthlyRevenueModule=require('../analytics/monthly-revenue.js');
const mainSalesHistoryModule=require('../analytics/main-sales-history.js');
const pacingCalculatorModule=require('../analytics/pacing.js');
const coupangMarketingModule=require('../coupang/marketing.js');
const coupangOperationalInventoryModule=require('../coupang/operational-inventory.js');
const dataHealthModule=require('./data-health.js');
const pageLoaderProfilesModule=require('./page-loader-profiles.js');
const priorityCenterModule=require('../actions/priority-center.js');
const channelCapabilitiesModule=require('../platforms/channel-capabilities.js');
const unifiedCollectionModule=require('../collection/unified-center.js');
const unifiedOrdersModule=require('../orders/unified-orders.js');
const salesCommandCenterModule=require('./sales-command-center.js');
const calendarCenterModule=require('../calendar/calendar-center.js');
const kstScheduleModule=require('../automation/kst-schedule.js');

const MAIN_REMOTE_QUERY_BUDGET=19;
const MONTHLY_TABLES=['cafe24_orders','naver_commerce_orders','coupang_orders','coupang_rg_orders'];
const number=value=>Number(value||0);

function trackedQuery(loaderSession,table,query){
  loaderSession.mark(table,true);
  const startedAt=Date.now();
  return Promise.resolve(query).then(result=>{
    loaderSession.finish(table,Date.now()-startedAt,result?.error||null);
    return result;
  },error=>{
    loaderSession.finish(table,Date.now()-startedAt,error);
    throw error;
  });
}

function trackedMonthlyRevenue(loaderSession,db,month){
  MONTHLY_TABLES.forEach(table=>loaderSession.mark(table,true));
  const startedAt=Date.now();
  return monthlyRevenueModule.fetchMonthlyRevenue(db,month).then(result=>{
    MONTHLY_TABLES.forEach(table=>loaderSession.finish(table,Date.now()-startedAt,(result.issues||[]).find(issue=>issue.dataset===table)||null));
    return result;
  });
}

async function buildFocusedShellData({queryIssues,syncResult,alertsResult,generatedAt,cafe24Token=null,cafe24Counts={},coupangCounts={},summaries={}}){
  const syncs=syncResult.data||[];
  const alerts=alertsResult.data||[];
  const dataHealth=dataHealthModule.buildDataHealth({issues:queryIssues,syncs,automationRuns:[],coupangRequests:[],summaries,now:generatedAt});
  const channelConnections=await channelCapabilitiesModule.buildChannelCapabilities({syncs,cafe24Token,cafe24Counts,coupangCounts});
  const collectionCenter=unifiedCollectionModule.buildUnifiedCollectionCenter({
    dataHealth,channelConnections,syncs,automationRuns:[],qualityChecks:[],alerts,now:generatedAt
  });
  return {syncs,alerts,dataHealth,channelConnections,collectionCenter};
}

function buildMainPacing({generatedAt,targets=[],monthlyRevenue=null}){
  const asOf=kstScheduleModule.kstDateKey(generatedAt);
  const month=asOf.slice(0,7);
  const actuals=monthlyRevenue?.totals||{};
  const targetMap=new Map(targets.map(item=>[String(item.platform||'ALL').toUpperCase(),item]));
  const items=['ALL','NAVER','CAFE24','COUPANG'].map(platform=>{
    const target=targetMap.get(platform)||{};
    if(typeof actuals[platform]!=='number'||!Number.isFinite(actuals[platform]))return {
      month,asOf,platform,status:'NO_DATA',revenueActual:null,revenueForecast:null,adSpendActual:null,
      revenueTarget:target.revenue_target==null?null:Number(target.revenue_target),
      adBudget:target.ad_budget==null?null:Number(target.ad_budget),targetRoas:target.target_roas==null?null:Number(target.target_roas)
    };
    return pacingCalculatorModule.calculatePacing({
      month,asOf,platform,revenueActual:actuals[platform],adSpendActual:0,
      revenueTarget:target.revenue_target,adBudget:target.ad_budget,targetRoas:target.target_roas
    });
  });
  return {month,asOf,items,targets,status:monthlyRevenue?.status||'NO_DATA',counts:monthlyRevenue?.counts||{},issues:monthlyRevenue?.issues||[]};
}

async function buildMainDashboardData({
  loaderSession,generatedAt,queryIssues,syncResult,alertsResult,
  ordersResult,itemsResult,coupangOrdersResult,coupangItemsResult,coupangReturnsResult,coupangInventoryResult,coupangRgOrdersResult,
  naverCommerceOrdersResult,naverCommerceItemsResult,businessTargetsResult,monthlyRevenueResult,customerServiceRows,cafe24Token,reportsResult,calendarEntries=[]
}){
  const rawInventory=coupangInventoryResult.data||[];
  const {active:operationalInventory,excluded:excludedInventory}=coupangOperationalInventoryModule.splitOperationalInventory(rawInventory);
  const {items:rgInventory,summary:inventoryMarketing}=coupangMarketingModule.buildInventoryMarketing(operationalInventory);
  const shell=await buildFocusedShellData({
    queryIssues,syncResult,alertsResult,generatedAt,cafe24Token,
    cafe24Counts:{orders:ordersResult.data?.length||0},
    coupangCounts:{orders:coupangOrdersResult.data?.length||0,products:rgInventory.length},
    summaries:{
      CAFE24:`${number(ordersResult.data?.length).toLocaleString('ko-KR')}건 주문 저장`,
      NAVER:`${number(naverCommerceOrdersResult.data?.length).toLocaleString('ko-KR')}건 주문 저장`,
      COUPANG:`${number(coupangOrdersResult.data?.length).toLocaleString('ko-KR')}건 주문 · 판매중 RG ${rgInventory.length}개 SKU`
    }
  });
  const unifiedOrders=unifiedOrdersModule.buildUnifiedOrders({
    cafe24Orders:ordersResult.data||[],cafe24OrderItems:itemsResult.data||[],
    coupangOrders:coupangOrdersResult.data||[],coupangOrderItems:coupangItemsResult.data||[],coupangReturns:coupangReturnsResult.data||[],
    coupangOrderDetailTerminals:[],coupangRgOrders:coupangRgOrdersResult.data||[],coupangRgOrderItems:[],
    naverOrders:naverCommerceOrdersResult.data||[],naverOrderItems:naverCommerceItemsResult.data||[],
    channelConnections:shell.channelConnections.channels||[],asOf:generatedAt,refreshedAt:generatedAt
  });
  const salesHistory=mainSalesHistoryModule.buildMainSalesHistory({
    asOf:generatedAt,cafe24Orders:ordersResult.data||[],naverOrders:naverCommerceOrdersResult.data||[],
    coupangOrders:coupangOrdersResult.data||[],coupangRgOrders:coupangRgOrdersResult.data||[]
  });
  const activeCs=(customerServiceRows||[]).filter(item=>!item.completed);
  const customerService={active:activeCs.map(item=>({id:item.source_key||item.id,platform:item.platform,kind:item.kind})),summary:{active:activeCs.length}};
  const unifiedInventory=coupangOperationalInventoryModule.buildOperationalInventoryCenter(rgInventory);
  const pacing=buildMainPacing({generatedAt,targets:businessTargetsResult.data||[],monthlyRevenue:monthlyRevenueResult});
  const priorityCenter=priorityCenterModule.buildPriorityCenter({alerts:shell.alerts,pacing,financialTrust:{},now:new Date(generatedAt)});
  const riskProducts=rgInventory.filter(item=>['OUT_OF_STOCK','CRITICAL','LOW'].includes(String(item.stock_status||'').toUpperCase())).slice(0,3).map(item=>({
    key:`COUPANG:${item.vendor_item_id}`,name:item.external_sku_id||`SKU ${item.vendor_item_id}`,platform:'COUPANG',currentRevenue:0,growthAmount:0,growthRate:null,
    stockStatus:item.stock_status,daysOfStock:item.days_of_stock,
    riskReason:String(item.stock_status).toUpperCase()==='OUT_OF_STOCK'?'최근 판매가 있지만 판매가능 재고가 없어요.':`최근 판매 기준 재고가 약 ${Math.max(0,Math.floor(number(item.days_of_stock)))}일분 남았어요.`
  }));
  const salesCommandCenter=salesCommandCenterModule.buildSalesCommandCenter({
    pacing,priorityCenter,dataHealth:shell.dataHealth,productSignals:{growth:[],risk:riskProducts,period:null},profitability:{},financialTrust:{},
    unifiedOrders,customerService,unifiedInventory,reliabilityCenter:{dead_letters:[]},alerts:shell.alerts,now:generatedAt
  });
  return {
    loadedView:'main',loadedWorkspace:null,loaderPerformance:loaderSession.snapshot(),generatedAt,
    dataHealth:shell.dataHealth,channelConnections:shell.channelConnections,collectionCenter:shell.collectionCenter,
    kpis:{sales:pacing.items.find(item=>item.platform==='ALL')?.revenueActual??null,orders:unifiedOrders.summary.total,visitors:null,pageviews:null,conversion:null,averageOrder:null,products:rgInventory.length},
    products:[],syncs:shell.syncs,reports:[],growthReports:reportsResult.data||[],calendarEntries,actions:[],alerts:shell.alerts,automationRuns:[],qualityChecks:[],metricSnapshots:[],
    priorityCenter,salesCommandCenter,salesHistory,unifiedOrders,customerService,unifiedInventory,pacing,financialTrust:{},
    coupang:{
      rgInventory,rgInventoryCount:rgInventory.length,rgInventoryExcludedCount:excludedInventory.length,
      rgTotalOrderable:rgInventory.reduce((sum,item)=>sum+number(item.total_orderable_quantity),0),
      rgSalesLast30Days:rgInventory.reduce((sum,item)=>sum+number(item.sales_last_30_days),0),
      rgOutOfStock:rgInventory.filter(item=>item.stock_status==='OUT_OF_STOCK').length,
      rgLowStock:rgInventory.filter(item=>['CRITICAL','LOW'].includes(item.stock_status)).length,
      inventoryMarketing,unansweredInquiries:activeCs.filter(item=>String(item.kind).toUpperCase()==='INQUIRY').length,
      latestSync:shell.syncs.find(item=>item.platform==='COUPANG')||null
    }
  };
}

async function loadPhase28MainDashboard({db,now=new Date()}={}){
  if(!db)throw new Error('Main dashboard database is required');
  const generatedAt=new Date(now).toISOString();
  const loaderSession=pageLoaderProfilesModule.createLoaderSession({view:'main',workspace:'default',platform:'all'});
  const month=kstScheduleModule.kstDateKey(generatedAt).slice(0,7);
  const dayRange=calendarCenterModule.dayRange(calendarCenterModule.seoulDateKey(generatedAt));
  const querySpecs=[
    ['cafe24_orders',db.from('cafe24_orders').select('order_id,order_date,customer_id,payment_status,paid_amount,order_price,cancel_amount,refund_amount,raw_data').order('order_date',{ascending:false}).limit(200)],
    ['cafe24_order_items',db.from('cafe24_order_items').select('order_id,raw_data').limit(400)],
    ['sync_logs',db.from('sync_logs').select('id,platform,job_type,status,started_at,finished_at,rows_received,error_message,metadata').in('job_type',['FETCH_ALL','FILE_IMPORT','ORDERS_REALTIME','RG_INVENTORY','RG_REALTIME','LOCAL_IP_CHECK','COMMERCE_CONNECTION_TEST','COMMERCE_SYNC','CUSTOMER_SERVICE']).order('started_at',{ascending:false}).limit(30)],
    ['reports',db.from('reports').select('id,platform,report_type,period_end,title,status,summary_json,is_latest,created_at').eq('is_latest',true).or('report_type.eq.WEEKLY,report_type.ilike.PRODUCT_ANALYSIS_%').order('created_at',{ascending:false}).limit(12)],
    ['alerts',db.from('alerts').select('id,source_type,platform,severity,title,message,status,created_at').eq('status','OPEN').order('created_at',{ascending:false}).limit(20)],
    ['naver_commerce_orders',db.from('naver_commerce_orders').select('order_id,order_date,payment_date,status,paid_amount,shipment_id,invoice_no,delivery_company,updated_at').order('order_date',{ascending:false}).limit(200)],
    ['naver_commerce_order_items',db.from('naver_commerce_order_items').select('product_order_id,order_id,status,updated_at').limit(400)],
    ['coupang_orders',db.from('coupang_orders').select('shipment_box_id,order_id,ordered_at,paid_at,status,gross_amount,raw_data').order('ordered_at',{ascending:false}).limit(200)],
    ['coupang_rg_orders',db.from('coupang_rg_orders').select('order_id,status,paid_at,total_amount,item_count').order('paid_at',{ascending:false}).limit(200)],
    ['coupang_returns',db.from('coupang_returns').select('receipt_id,order_id,status,cancel_type,reason_text,requested_at,amount,raw_data').order('requested_at',{ascending:false}).limit(100)],
    ['coupang_rg_inventory',db.from('coupang_rg_inventory').select('vendor_item_id,external_sku_id,total_orderable_quantity,sales_last_30_days,average_daily_sales,days_of_stock,stock_status,snapshot_at').gt('total_orderable_quantity',0).gt('sales_last_30_days',0).order('days_of_stock',{ascending:true,nullsFirst:false}).limit(500)],
    ['business_targets',db.from('business_targets').select('id,target_month,platform,revenue_target,ad_budget,target_roas,notes,updated_at').eq('target_month',`${month}-01`)],
    ['customer_service_items',db.from('customer_service_items').select('id,source_key,platform,kind,completed').or('completed.eq.false,completed.is.null').order('occurred_at',{ascending:false}).limit(1000)],
    ['cafe24_oauth_tokens',db.from('cafe24_oauth_tokens').select('token_data').eq('mall_id',process.env.CAFE24_MALL_ID).maybeSingle()],
    ['hub_work_items',db.from('hub_work_items').select('id,item_type,title,body,status,priority,due_at,page_key,context_label,context_href,completed_at,created_at,updated_at').eq('context_href','/calendar').neq('status','ARCHIVED').gte('due_at',new Date(`${dayRange.start}T00:00:00+09:00`).toISOString()).lt('due_at',new Date(`${dayRange.endExclusive}T00:00:00+09:00`).toISOString()).order('due_at',{ascending:true}).limit(40)]
  ];
  const [settledQueries,monthlyRevenueResult]=await Promise.all([
    Promise.allSettled(querySpecs.map(([table,query])=>trackedQuery(loaderSession,table,query))),
    trackedMonthlyRevenue(loaderSession,db,month).catch(error=>({
      status:'PARTIAL',totals:{ALL:null,NAVER:null,CAFE24:null,COUPANG:null},counts:{},
      issues:[{platform:'ALL',dataset:'monthly_revenue',code:'MONTHLY_QUERY_FAILED',message:String(error?.message||error||'월 매출 조회 실패')}]
    }))
  ]);
  const settled=dataHealthModule.settleQueries(settledQueries,querySpecs.map(([table])=>({platform:table.startsWith('naver_')?'NAVER':table.startsWith('coupang_')?'COUPANG':table.startsWith('cafe24_')?'CAFE24':'SHARED',dataset:table})),()=>{});
  const [ordersResult,itemsResult,syncResult,reportsResult,alertsResult,naverOrdersResult,naverItemsResult,coupangOrdersResult,coupangRgOrdersResult,coupangReturnsResult,coupangInventoryResult,targetsResult,channelCsResult,cafe24TokenResult,calendarResult]=settled.results;
  const queryIssues=[...settled.issues,...(monthlyRevenueResult.issues||[])];
  return buildMainDashboardData({
    loaderSession,generatedAt,queryIssues,syncResult,alertsResult,ordersResult,itemsResult,
    coupangOrdersResult,coupangItemsResult:{data:[],error:null},coupangReturnsResult,coupangInventoryResult,coupangRgOrdersResult,
    naverCommerceOrdersResult:naverOrdersResult,naverCommerceItemsResult:naverItemsResult,businessTargetsResult:targetsResult,monthlyRevenueResult,
    customerServiceRows:channelCsResult.data||[],cafe24Token:cafe24TokenResult.data?.token_data||null,reportsResult,calendarEntries:calendarResult.data||[]
  });
}

module.exports={MAIN_REMOTE_QUERY_BUDGET,loadPhase28MainDashboard};
