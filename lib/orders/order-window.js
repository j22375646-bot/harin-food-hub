'use strict';

// Order screens, invoice actions and the hourly job all rebuild the unified
// order list. Reading every historical order (with raw_data) on each call was
// the main source of Supabase egress. The window keeps:
//   1. every order placed in the last DEFAULT_RECENT_DAYS days (or since an
//      explicit search/export start date), and
//   2. older orders that are not provably finished, so a delayed shipment
//      never disappears from the shipping screen.
// "Finished" is judged conservatively: only statuses that map to DELIVERED or
// CANCELLED in unified-orders.js exclude an older order. Unknown or missing
// statuses keep the order.

const DEFAULT_RECENT_DAYS=7;
const DAY_MS=24*60*60*1000;
const PAGE_SIZE=500;
const ID_CHUNK=150;

const COUPANG_FINISHED=Object.freeze(['FINAL_DELIVERY','DELIVERED','COMPLETE','CANCELLED','CANCELED','CANCELED_BY_NOPAYMENT']);
const NAVER_FINISHED=Object.freeze(['DELIVERED','PURCHASE_DECIDED','CANCELLED','CANCELED','CANCELED_BY_NOPAYMENT','CANCEL_COMPLETE','CANCEL_COMPLETED','RETURNED','EXCHANGED']);
// Cafe24 item codes: N40 delivered, N50 purchase confirmed, C40/C47/C48/C49
// cancellation completed, R40 return completed, E40 exchange completed.
const CAFE24_ITEM_FINISHED=Object.freeze(['N40','N50','C40','C47','C48','C49','R40','E40']);
const CAFE24_ITEM_STATUS='raw_data->>order_status';

const COLUMNS=Object.freeze({
  cafe24Orders:'order_id,order_date,payment_status,order_price,paid_amount,cancel_amount,raw_data',
  cafe24Items:'order_id,external_item_id,external_product_no,product_name,option_name,quantity,unit_price,paid_amount,raw_data',
  coupangOrders:'shipment_box_id,order_id,ordered_at,paid_at,status,gross_amount,raw_data',
  coupangItems:'shipment_box_id,order_id,vendor_item_id,seller_product_id,product_name,quantity,unit_price,paid_amount,status,raw_data',
  coupangReturns:'order_id,status,requested_at',
  rgOrders:'order_id,status,paid_at,total_amount,item_count',
  rgItems:'order_id,product_name,quantity,amount',
  naverOrders:'order_id,order_date,payment_date,status,paid_amount,receiver_name,receiver_phone,receiver_address,shipping_memo,shipment_id,invoice_no,delivery_company,raw_data',
  naverItems:'product_order_id,order_id,product_id,original_product_id,product_name,option_name,quantity,unit_price,paid_amount,status,raw_data',
  orderDetails:'operation_type,target_type,target_id,status,result_json,error_message,created_at'
});

function queryFailure(error){
  return {rows:[],unavailable:true,error:{code:String(error?.code||'QUERY_ERROR'),message:'채널 주문을 불러오지 못했습니다.'}};
}

async function pagedQuery(factory){
  try{
    const rows=[];
    for(let offset=0;;offset+=PAGE_SIZE){
      const result=await factory().range(offset,offset+PAGE_SIZE-1);
      if(result.error)throw result.error;
      rows.push(...(result.data||[]));
      if((result.data||[]).length<PAGE_SIZE)return {rows,unavailable:false};
    }
  }catch(error){return queryFailure(error);}
}

function chunks(values,size=ID_CHUNK){
  const result=[];
  for(let index=0;index<values.length;index+=size)result.push(values.slice(index,index+size));
  return result;
}

function uniqueText(values){
  return [...new Set(values.map(value=>value==null?'':String(value).trim()).filter(Boolean))];
}

async function pagedInQuery(ids,factory){
  const list=uniqueText(ids);
  if(!list.length)return {rows:[],unavailable:false};
  const parts=await Promise.all(chunks(list).map(chunk=>pagedQuery(()=>factory(chunk))));
  const failed=parts.find(part=>part.unavailable);
  if(failed)return failed;
  return {rows:parts.flatMap(part=>part.rows),unavailable:false};
}

function mergeRows(key,...results){
  const failed=results.find(result=>result.unavailable);
  if(failed)return failed;
  const seen=new Set();const rows=[];
  for(const row of results.flatMap(result=>result.rows)){
    const id=String(row[key]??'');
    if(seen.has(id))continue;
    seen.add(id);rows.push(row);
  }
  return {rows,unavailable:false};
}

function validStart(value){
  const text=String(value||'').trim();
  if(!text)return null;
  const parsed=new Date(/^\d{4}-\d{2}-\d{2}$/.test(text)?`${text}T00:00:00+09:00`:text);
  return Number.isFinite(parsed.getTime())?parsed.toISOString():null;
}

function windowStart({now=new Date(),since=null,days=DEFAULT_RECENT_DAYS}={}){
  const recent=new Date(now.getTime()-days*DAY_MS).toISOString();
  const requested=validStart(since);
  return requested&&requested<recent?requested:recent;
}

function recentFilter(dateColumn,start){return `${dateColumn}.gte.${start},${dateColumn}.is.null`;}
function openStatusFilter(statusColumn,finished){return `${statusColumn}.is.null,${statusColumn}.not.in.(${finished.join(',')})`;}

async function loadCafe24(db,start){
  const [recent,openItems]=await Promise.all([
    pagedQuery(()=>db.from('cafe24_orders').select(COLUMNS.cafe24Orders).or(recentFilter('order_date',start)).order('order_id',{ascending:true})),
    pagedQuery(()=>db.from('cafe24_order_items').select('order_id').or(openStatusFilter(CAFE24_ITEM_STATUS,CAFE24_ITEM_FINISHED)).order('external_item_id',{ascending:true}))
  ]);
  if(recent.unavailable||openItems.unavailable)return {orders:recent.unavailable?recent:openItems,items:recent.unavailable?recent:openItems};
  const known=new Set(recent.rows.map(row=>String(row.order_id)));
  const olderOpen=await pagedInQuery(openItems.rows.map(row=>row.order_id).filter(id=>!known.has(String(id))),chunk=>
    db.from('cafe24_orders').select(COLUMNS.cafe24Orders).in('order_id',chunk).order('order_id',{ascending:true}));
  const orders=mergeRows('order_id',recent,olderOpen);
  const items=orders.unavailable?orders:await pagedInQuery(orders.rows.map(row=>row.order_id),chunk=>
    db.from('cafe24_order_items').select(COLUMNS.cafe24Items).in('order_id',chunk).order('external_item_id',{ascending:true}));
  return {orders,items};
}

async function loadCoupang(db,start){
  const [orders,recentRg]=await Promise.all([
    pagedQuery(()=>db.from('coupang_orders').select(COLUMNS.coupangOrders)
      .or(`${recentFilter('ordered_at',start)},${openStatusFilter('status',COUPANG_FINISHED)}`)
      .order('shipment_box_id',{ascending:true})),
    pagedQuery(()=>db.from('coupang_rg_orders').select(COLUMNS.rgOrders).or(recentFilter('paid_at',start)).order('order_id',{ascending:true}))
  ]);
  const orderIds=orders.rows.map(row=>row.order_id);
  const boxIds=orders.rows.map(row=>row.shipment_box_id);
  const [items,returns,matchingRg,orderDetails]=await Promise.all([
    pagedInQuery(boxIds,chunk=>db.from('coupang_order_items').select(COLUMNS.coupangItems).in('shipment_box_id',chunk).order('external_item_key',{ascending:true})),
    pagedInQuery(orderIds,chunk=>db.from('coupang_returns').select(COLUMNS.coupangReturns).in('order_id',chunk).order('id',{ascending:true})),
    pagedInQuery(orderIds,chunk=>db.from('coupang_rg_orders').select(COLUMNS.rgOrders).in('order_id',chunk).order('order_id',{ascending:true})),
    pagedInQuery(boxIds,chunk=>db.from('coupang_operation_requests').select(COLUMNS.orderDetails)
      .eq('operation_type','ORDER_DETAIL').eq('target_type','ORDER').in('status',['SUCCESS','CANCELLED','FAILED'])
      .in('target_id',chunk).order('created_at',{ascending:false}))
  ]);
  const rgOrders=mergeRows('order_id',recentRg,matchingRg);
  const rgItems=rgOrders.unavailable?rgOrders:await pagedInQuery(rgOrders.rows.map(row=>row.order_id),chunk=>
    db.from('coupang_rg_order_items').select(COLUMNS.rgItems).in('order_id',chunk).order('id',{ascending:true}));
  // Callers read the newest ORDER_DETAIL evidence first across all chunks.
  if(!orderDetails.unavailable)orderDetails.rows.sort((left,right)=>String(right.created_at||'').localeCompare(String(left.created_at||'')));
  return {orders,items,returns,rgOrders,rgItems,orderDetails};
}

async function loadNaver(db,start){
  const [base,openItems]=await Promise.all([
    pagedQuery(()=>db.from('naver_commerce_orders').select(COLUMNS.naverOrders)
      .or(`${recentFilter('order_date',start)},${openStatusFilter('status',NAVER_FINISHED)}`)
      .order('order_id',{ascending:true})),
    pagedQuery(()=>db.from('naver_commerce_order_items').select('order_id').or(openStatusFilter('status',NAVER_FINISHED)).order('product_order_id',{ascending:true}))
  ]);
  if(base.unavailable||openItems.unavailable){const failed=base.unavailable?base:openItems;return {orders:failed,items:failed};}
  const known=new Set(base.rows.map(row=>String(row.order_id)));
  const olderOpen=await pagedInQuery(openItems.rows.map(row=>row.order_id).filter(id=>!known.has(String(id))),chunk=>
    db.from('naver_commerce_orders').select(COLUMNS.naverOrders).in('order_id',chunk).order('order_id',{ascending:true}));
  const orders=mergeRows('order_id',base,olderOpen);
  const items=orders.unavailable?orders:await pagedInQuery(orders.rows.map(row=>row.order_id),chunk=>
    db.from('naver_commerce_order_items').select(COLUMNS.naverItems).in('order_id',chunk).order('product_order_id',{ascending:true}));
  return {orders,items};
}

async function loadWindowedOrderRows({db,now=new Date(),since=null}={}){
  const start=windowStart({now,since});
  const [cafe24,coupang,naver]=await Promise.all([loadCafe24(db,start),loadCoupang(db,start),loadNaver(db,start)]);
  return {
    start,
    cafe24Orders:cafe24.orders, cafe24Items:cafe24.items,
    coupangOrders:coupang.orders, coupangItems:coupang.items, coupangReturns:coupang.returns,
    rgOrders:coupang.rgOrders, rgItems:coupang.rgItems, coupangOrderDetailTerminals:coupang.orderDetails,
    naverOrders:naver.orders, naverItems:naver.items
  };
}

module.exports={
  DEFAULT_RECENT_DAYS,COUPANG_FINISHED,NAVER_FINISHED,CAFE24_ITEM_FINISHED,
  loadWindowedOrderRows,pagedQuery,windowStart
};
