'use strict';

const operationalInventoryModule=require('../coupang/operational-inventory.js');
const unifiedOrdersModule=require('../orders/unified-orders.js');
const channelCapabilitiesModule=require('../platforms/channel-capabilities.js');
const operationSnapshotModule=require('./operation-snapshot.js');

function sourceAvailable(availability,key){
  return availability?.[key]!==false;
}

function isOpenCustomerService(row={}){
  return row.completed!==true&&String(row.completed||'').toLowerCase()!=='true';
}

function buildLiveNavigationOperationSnapshot(input={}){
  const availability=input.availability||{};
  const ordersKnown=sourceAvailable(availability,'orders');
  const customerServiceKnown=sourceAvailable(availability,'customerService');
  const inventoryKnown=sourceAvailable(availability,'inventory');
  const alertsKnown=sourceAvailable(availability,'alerts');
  const connectionsKnown=sourceAvailable(availability,'connections');
  const unifiedOrders=ordersKnown?unifiedOrdersModule.buildUnifiedOrders({
    cafe24Orders:input.cafe24Orders||[],
    cafe24OrderItems:input.cafe24OrderItems||[],
    coupangOrders:input.coupangOrders||[],
    coupangOrderItems:input.coupangOrderItems||[],
    coupangReturns:input.coupangReturns||[],
    coupangRgOrders:input.coupangRgOrders||[],
    coupangRgOrderItems:[],
    coupangOrderDetailTerminals:input.coupangOrderDetailTerminals||[],
    naverOrders:input.naverOrders||[],
    naverOrderItems:input.naverOrderItems||[],
    channelConnections:connectionsKnown?(input.channelConnections?.channels||[]):[],
    asOf:input.generatedAt
  }):{summary:{actionRequired:null}};
  const customerService=customerServiceKnown
    ?{summary:{active:(input.customerServiceRows||[]).filter(isOpenCustomerService).length}}
    :{summary:{active:null}};
  const unifiedInventory=inventoryKnown
    ?operationalInventoryModule.buildOperationalInventoryCenter(input.inventoryRows||[])
    :{summary:{action_required:null}};

  return operationSnapshotModule.buildNavigationOperationSnapshot({
    loadedView:'main',
    generatedAt:input.generatedAt||new Date().toISOString(),
    unifiedOrders,
    customerService,
    unifiedInventory,
    alerts:alertsKnown?(input.alerts||[]):null,
    channelConnections:connectionsKnown?input.channelConnections:{channels:[]}
  });
}

async function guarded(query,name){
  try{
    const result=await query;
    if(result?.error)throw result.error;
    return {available:true,data:result?.data||[],count:result?.count??null,name};
  }catch(error){
    return {available:false,data:null,count:null,name,error:String(error?.code||error?.message||'QUERY_FAILED')};
  }
}

async function loadLiveNavigationOperationSnapshot({db,now=new Date()}={}){
  if(!db)throw new Error('Supabase client is required');
  const mallId=String(process.env.CAFE24_MALL_ID||'').trim();
  const tokenQuery=mallId
    ?guarded(db.from('cafe24_oauth_tokens').select('token_data').eq('mall_id',mallId).maybeSingle(),'cafe24_oauth_tokens')
    :Promise.resolve({available:true,data:null,count:null,name:'cafe24_oauth_tokens'});
  const results=await Promise.all([
    guarded(db.from('cafe24_orders').select('order_id,order_date,payment_status,order_price,paid_amount,cancel_amount,raw_data').order('order_date',{ascending:false}).limit(10000),'cafe24_orders'),
    guarded(db.from('cafe24_order_items').select('order_id,external_item_id,product_name,option_name,quantity,unit_price,paid_amount,raw_data').limit(20000),'cafe24_order_items'),
    guarded(db.from('coupang_orders').select('shipment_box_id,order_id,ordered_at,paid_at,status,gross_amount,raw_data').order('ordered_at',{ascending:false}).limit(5000),'coupang_orders'),
    guarded(db.from('coupang_order_items').select('shipment_box_id,order_id,vendor_item_id,seller_product_id,product_name,quantity,unit_price,paid_amount,status,raw_data').limit(15000),'coupang_order_items'),
    guarded(db.from('coupang_returns').select('order_id,status,requested_at').order('requested_at',{ascending:false}).limit(1000),'coupang_returns'),
    guarded(db.from('coupang_rg_orders').select('order_id').order('paid_at',{ascending:false}).limit(5000),'coupang_rg_orders'),
    guarded(db.from('coupang_operation_requests').select('operation_type,target_type,target_id,status,error_message,created_at').eq('operation_type','ORDER_DETAIL').eq('target_type','ORDER').in('status',['SUCCESS','CANCELLED','FAILED']).order('created_at',{ascending:false}).limit(5000),'coupang_order_detail_terminals'),
    guarded(db.from('naver_commerce_orders').select('order_id,order_date,payment_date,status,paid_amount').order('order_date',{ascending:false}).limit(5000),'naver_commerce_orders'),
    guarded(db.from('naver_commerce_order_items').select('product_order_id,order_id,product_name,quantity,unit_price,paid_amount,status').limit(15000),'naver_commerce_order_items'),
    guarded(db.from('customer_service_items').select('id,completed').or('completed.eq.false,completed.is.null').limit(1000),'customer_service_items'),
    guarded(db.from('coupang_rg_inventory').select('vendor_item_id,external_sku_id,total_orderable_quantity,sales_last_30_days,average_daily_sales,days_of_stock,stock_status,snapshot_at').gt('total_orderable_quantity',0).gt('sales_last_30_days',0).order('days_of_stock',{ascending:true,nullsFirst:false}).limit(500),'coupang_rg_inventory'),
    guarded(db.from('alerts').select('id,status').eq('status','OPEN').limit(1000),'alerts'),
    guarded(db.from('sync_logs').select('platform,job_type,status,started_at,finished_at,metadata').in('job_type',['FETCH_ALL','ORDERS_REALTIME','RG_INVENTORY','COMMERCE_CONNECTION_TEST','COMMERCE_SYNC','CUSTOMER_SERVICE']).order('started_at',{ascending:false}).limit(30),'sync_logs'),
    tokenQuery,
    guarded(db.from('coupang_products').select('seller_product_id',{count:'exact',head:true}),'coupang_products_count')
  ]);
  const [cafe24Orders,cafe24OrderItems,coupangOrders,coupangOrderItems,coupangReturns,coupangRgOrders,coupangOrderDetailTerminals,naverOrders,naverOrderItems,customerServiceRows,inventoryRows,alerts,syncs,cafe24Token,coupangProductCount]=results;
  const orderSources=[cafe24Orders,cafe24OrderItems,coupangOrders,coupangOrderItems,coupangReturns,coupangRgOrders,coupangOrderDetailTerminals,naverOrders,naverOrderItems];
  const connectionsAvailable=syncs.available&&cafe24Token.available&&coupangProductCount.available;
  const channelConnections=connectionsAvailable
    ?await channelCapabilitiesModule.buildChannelCapabilities({
      syncs:syncs.data,
      cafe24Token:cafe24Token.data?.token_data||null,
      cafe24Counts:{orders:cafe24Orders.available?cafe24Orders.data.length:null},
      coupangCounts:{orders:coupangOrders.available?coupangOrders.data.length:null,products:Number(coupangProductCount.count||0)}
    })
    :{channels:[]};
  const availability={
    orders:orderSources.every(result=>result.available),
    customerService:customerServiceRows.available,
    inventory:inventoryRows.available,
    alerts:alerts.available,
    connections:connectionsAvailable
  };
  const snapshot=buildLiveNavigationOperationSnapshot({
    generatedAt:new Date(now).toISOString(),availability,channelConnections,
    cafe24Orders:cafe24Orders.data,cafe24OrderItems:cafe24OrderItems.data,
    coupangOrders:coupangOrders.data,coupangOrderItems:coupangOrderItems.data,coupangReturns:coupangReturns.data,
    coupangRgOrders:coupangRgOrders.data,coupangOrderDetailTerminals:coupangOrderDetailTerminals.data,
    naverOrders:naverOrders.data,naverOrderItems:naverOrderItems.data,
    customerServiceRows:customerServiceRows.data,inventoryRows:inventoryRows.data,alerts:alerts.data
  });
  return {
    snapshot,
    partial:Object.values(availability).some(value=>!value),
    unavailable:results.filter(result=>!result.available).map(result=>result.name)
  };
}

module.exports={buildLiveNavigationOperationSnapshot,loadLiveNavigationOperationSnapshot};
