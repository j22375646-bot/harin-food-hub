'use strict';

const projects=require('./projects.js');

const DAY_MS=24*60*60*1000;
const PERIOD_DAYS=new Set([7,30,90]);
const INFLOW_LABELS=Object.freeze({
  SA:'검색광고(SA)',NAVER_SHOPPING:'네이버 쇼핑',SHOPPING:'네이버 쇼핑',
  GROUP_PURCHASE:'공동구매',BAND:'밴드',OUTSIDE_NAVER:'네이버 쇼핑 외'
});

class MarketNaverCommerceOrderError extends Error{
  constructor(message,status=400,code='MARKET_NAVER_COMMERCE_ORDER_INVALID'){
    super(message);this.name='MarketNaverCommerceOrderError';this.status=status;this.code=code;
  }
}

const cleanText=(value,max=160)=>String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
function numberOrNull(value){
  if(value==null||value==='')return null;
  const parsed=Number(String(value).replace(/,/gu,''));
  return Number.isFinite(parsed)?parsed:null;
}
function firstNumber(...values){for(const value of values){const parsed=numberOrNull(value);if(parsed!=null)return parsed;}return null;}
function firstText(...values){for(const value of values){const parsed=cleanText(value,240);if(parsed)return parsed;}return '';}
function validPeriod(value){const days=Number(value||30);return PERIOD_DAYS.has(days)?days:30;}

function normalizeProductOrderEconomics(item={},order={}){
  const raw=item.raw_data||{};
  const productAmount=firstNumber(raw.remainProductAmount,raw.totalProductAmount,raw.initialProductAmount);
  const paidAmount=firstNumber(item.paid_amount,raw.remainPaymentAmount,raw.totalPaymentAmount,raw.initialPaymentAmount);
  const productDiscount=firstNumber(raw.remainProductDiscountAmount,raw.productDiscountAmount,raw.initialProductDiscountAmount);
  const sellerDiscount=firstNumber(raw.remainSellerBurdenDiscountAmount,raw.sellerBurdenDiscountAmount,raw.initialSellerBurdenDiscountAmount);
  const otherDiscount=productDiscount!=null&&sellerDiscount!=null?Math.max(0,productDiscount-sellerDiscount):null;
  const commissionParts=[firstNumber(raw.paymentCommission),firstNumber(raw.saleCommission),firstNumber(raw.channelCommission)];
  const knownCommission=commissionParts.filter(value=>value!=null);
  const feeAmount=knownCommission.length?knownCommission.reduce((sum,value)=>sum+value,0):null;
  const inflowPath=firstText(raw.inflowPath);
  const inflowPathAdd=firstText(raw.inflowPathAdd);
  const orderDate=firstText(order.payment_date,order.order_date,raw.paymentDate,raw.orderDate);
  return {
    order_ref:cleanText(item.order_id,80),product_order_ref:cleanText(item.product_order_id,80),
    product_id:cleanText(item.product_id||raw.productId,80),original_product_id:cleanText(item.original_product_id||raw.originalProductId,80),
    order_date:orderDate||null,quantity:Math.max(0,firstNumber(item.quantity,raw.remainQuantity,raw.quantity)||0),
    product_amount:productAmount,product_discount_amount:productDiscount,seller_discount_amount:sellerDiscount,
    other_discount_amount:otherDiscount,paid_amount:paidAmount,payment_commission:commissionParts[0],
    sale_commission:commissionParts[1],channel_commission:commissionParts[2],fee_amount:feeAmount,
    expected_settlement_amount:firstNumber(raw.expectedSettlementAmount),
    inflow_path:inflowPath||null,inflow_path_add:inflowPathAdd||null,
    collected_at:firstText(item.collected_at,item.updated_at,order.collected_at)||null
  };
}

function sumKnown(rows,key){
  const values=rows.map(row=>numberOrNull(row[key])).filter(value=>value!=null);
  return {value:values.length?values.reduce((sum,value)=>sum+value,0):null,coverage:values.length,total:rows.length};
}
function inflowLabel(value){const text=cleanText(value,120);return INFLOW_LABELS[text.toUpperCase()]||text||'유입경로 확인 필요';}
function latestDate(values){
  const dates=values.map(value=>Date.parse(value||'')).filter(Number.isFinite);
  return dates.length?new Date(Math.max(...dates)).toISOString():null;
}

function buildOrderInsight({project,product,links=[],items=[],orders=[],sync=null,now=new Date(),periodDays=30}={}){
  const days=validPeriod(periodDays),nowDate=now instanceof Date?now:new Date(now),startMs=nowDate.getTime()-days*DAY_MS;
  const commerceLinks=links.filter(link=>String(link.platform||'NAVER').toUpperCase()==='NAVER'&&String(link.raw_data?.source_type||'').toUpperCase()==='NAVER_COMMERCE_PRODUCT');
  const productIds=new Set(commerceLinks.map(link=>cleanText(link.external_product_id,80)).filter(Boolean));
  const originalIds=new Set(commerceLinks.flatMap(link=>[
    cleanText(link.raw_data?.originProductNo,80),cleanText(link.raw_data?.origin_product_no,80)
  ]).filter(Boolean));
  const orderMap=new Map(orders.map(order=>[cleanText(order.order_id,80),order]));
  const matched=items.filter(item=>productIds.has(cleanText(item.product_id||item.raw_data?.productId,80))||originalIds.has(cleanText(item.original_product_id||item.raw_data?.originalProductId,80)))
    .map(item=>normalizeProductOrderEconomics(item,orderMap.get(cleanText(item.order_id,80))||{}))
    .filter(row=>{const at=Date.parse(row.order_date||'');return Number.isFinite(at)&&at>=startMs&&at<=nowDate.getTime();});
  const totals=Object.fromEntries(['product_amount','product_discount_amount','seller_discount_amount','other_discount_amount','paid_amount','fee_amount','expected_settlement_amount'].map(key=>[key,sumKnown(matched,key)]));
  const grouped=new Map();
  for(const row of matched){
    const label=inflowLabel(row.inflow_path),detail=cleanText(row.inflow_path_add,120),key=`${label}:${detail}`;
    if(!grouped.has(key))grouped.set(key,{label,detail:detail||null,rows:[],orders:new Set()});
    const group=grouped.get(key);group.rows.push(row);if(row.order_ref)group.orders.add(row.order_ref);
  }
  const inflows=[...grouped.values()].map(group=>({
    label:group.label,detail:group.detail,order_count:group.orders.size,item_count:group.rows.length,
    units:group.rows.reduce((sum,row)=>sum+row.quantity,0),paid_amount:sumKnown(group.rows,'paid_amount'),
    expected_settlement_amount:sumKnown(group.rows,'expected_settlement_amount')
  })).sort((a,b)=>(b.paid_amount.value??-1)-(a.paid_amount.value??-1));
  const dailyMap=new Map();
  for(const row of matched){
    const date=String(row.order_date||'').slice(0,10);if(!date)continue;
    if(!dailyMap.has(date))dailyMap.set(date,{date,rows:[],orders:new Set()});
    const day=dailyMap.get(date);day.rows.push(row);if(row.order_ref)day.orders.add(row.order_ref);
  }
  const daily=[...dailyMap.values()].map(day=>({date:day.date,order_count:day.orders.size,item_count:day.rows.length,paid_amount:sumKnown(day.rows,'paid_amount'),expected_settlement_amount:sumKnown(day.rows,'expected_settlement_amount')})).sort((a,b)=>a.date.localeCompare(b.date));
  const orderCount=new Set(matched.map(row=>row.order_ref).filter(Boolean)).size;
  const coverage={
    inflow:{known:matched.filter(row=>row.inflow_path).length,total:matched.length},
    discount:{known:totals.product_discount_amount.coverage,total:matched.length},
    commission:{known:totals.fee_amount.coverage,total:matched.length},
    settlement:{known:totals.expected_settlement_amount.coverage,total:matched.length}
  };
  const requiredCoverage=[coverage.inflow,coverage.commission,coverage.settlement];
  const dataStatus=!commerceLinks.length?'MAPPING_REQUIRED':!matched.length?'NO_DATA':requiredCoverage.every(item=>item.known===item.total)?'READY':'PARTIAL';
  return {
    phase:'18-4',read_only:true,contains_pii:false,period_days:days,
    period_start:new Date(startMs).toISOString(),period_end:nowDate.toISOString(),data_status:dataStatus,
    product:{id:project?.master_product_id||product?.id||null,name:product?.name||project?.product_snapshot?.name||'선택 상품'},
    mapping:{linked_products:commerceLinks.length,external_product_ids:[...productIds],source:'NAVER_COMMERCE_PRODUCT'},
    summary:{order_count:orderCount,item_count:matched.length,units:matched.reduce((sum,row)=>sum+row.quantity,0),inflow_count:inflows.filter(item=>item.label!=='유입경로 확인 필요').length},
    totals,coverage,inflows,daily,
    freshness:{latest_collected_at:latestDate(matched.map(row=>row.collected_at)),sync_status:sync?.status||null,last_sync_at:sync?.finished_at||null,sync_counts:sync?.metadata?.counts||null},
    notices:[
      '네이버 상품주문 상세 API가 제공한 값만 사용하며 주문번호·구매자·연락처는 화면으로 보내지 않습니다.',
      '네이버·기타 할인은 상품 할인액에서 판매자 부담 할인액을 뺀 계산값이며, 원본 값이 빠지면 확인 필요로 남깁니다.',
      '정산 예정 금액은 주문 시점 예상치이며 실제 정산완료 금액과 다를 수 있습니다.'
    ]
  };
}

async function rowsByChunks({db,table,select,column,values,chunkSize=100}){
  const unique=[...new Set(values.map(value=>cleanText(value,80)).filter(Boolean))],rows=[];
  for(let index=0;index<unique.length;index+=chunkSize){
    const result=await db.from(table).select(select).in(column,unique.slice(index,index+chunkSize)).limit(5000);
    if(result.error)throw result.error;rows.push(...(result.data||[]));
  }
  return rows;
}

async function loadWorkbench({db,projectId,periodDays=30,now=new Date()}){
  const {project,product}=await projects.loadProject({db,projectId});
  const [linksResult,syncResult]=await Promise.all([
    db.from('channel_products').select('platform,external_product_id,external_product_name,raw_data,updated_at').eq('platform','NAVER').eq('master_product_id',project.master_product_id).eq('is_active',true).limit(100),
    db.from('sync_logs').select('status,finished_at,metadata').eq('platform','NAVER').eq('job_type','COMMERCE_SYNC').order('created_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(linksResult.error)throw linksResult.error;if(syncResult.error)throw syncResult.error;
  const links=(linksResult.data||[]).filter(link=>String(link.raw_data?.source_type||'').toUpperCase()==='NAVER_COMMERCE_PRODUCT');
  if(!links.length)return buildOrderInsight({project,product,links,items:[],orders:[],sync:syncResult.data,now,periodDays});
  const productIds=links.map(link=>link.external_product_id),originalIds=links.flatMap(link=>[link.raw_data?.originProductNo,link.raw_data?.origin_product_no]).filter(Boolean);
  const [byProduct,byOriginal]=await Promise.all([
    rowsByChunks({db,table:'naver_commerce_order_items',select:'product_order_id,order_id,product_id,original_product_id,quantity,paid_amount,raw_data,collected_at,updated_at',column:'product_id',values:productIds}),
    originalIds.length?rowsByChunks({db,table:'naver_commerce_order_items',select:'product_order_id,order_id,product_id,original_product_id,quantity,paid_amount,raw_data,collected_at,updated_at',column:'original_product_id',values:originalIds}):Promise.resolve([])
  ]);
  const items=[...new Map([...byProduct,...byOriginal].map(item=>[item.product_order_id,item])).values()];
  const orders=await rowsByChunks({db,table:'naver_commerce_orders',select:'order_id,order_date,payment_date,collected_at',column:'order_id',values:items.map(item=>item.order_id)});
  return buildOrderInsight({project,product,links,items,orders,sync:syncResult.data,now,periodDays});
}

module.exports={MarketNaverCommerceOrderError,PERIOD_DAYS,cleanText,numberOrNull,validPeriod,normalizeProductOrderEconomics,sumKnown,buildOrderInsight,loadWorkbench};
