'use strict';

const {buildUnifiedSettlementCenter}=require('../settlement/unified-center.js');
const {readLedgerPages}=require('../settlement/query.js');
const {seoulDateKey}=require('../analytics/financial-date.js');
const {normalizeBizmoneyRawSnapshots}=require('../naver/bizmoney.js');
const {calculateCoupangCostCalibration,withEffectiveChannelSettings}=require('../analytics/cost-calibration.js');

// Read-only settlement composition. Calculations remain in the web hub's
// unified center; no main-dashboard reports, inventory, AI or monthly history.
async function loadWorkspaceSettlement({db,now=new Date(),days=30}={}){
 if(!Number.isInteger(days)||![7,30,90].includes(days))throw RangeError('Unsupported settlement period');
 if(!db)throw TypeError('Settlement database required');
 const generatedAt=new Date(now).toISOString();
 const endDate=seoulDateKey(generatedAt);
 const startMs=Date.parse(`${endDate}T00:00:00+09:00`)-(days-1)*86400000;
 const start=seoulDateKey(new Date(startMs));
 const since=(column)=>query=>query.gte(column,start);
 const fallbackSince=(column)=>query=>query.or(`${column}.gte.${start},${column}.is.null`);
 const rows={};
 async function paged(name,columns,key,configure=query=>query){
  const result=await readLedgerPages(()=>{
   const query=configure(db.from(name).select(columns,{count:'exact'})).order(typeof key==='string'?key:'date');
   if(typeof key==='string')return query;
   query.order('shop_no');
   return {range:async(a,b)=>{const response=await query.range(a,b);return {...response,data:Array.isArray(response.data)?response.data.map(row=>({...row,_settlementKey:key(row)})):response.data};}};
  },typeof key==='string'?key:'_settlementKey');
  rows[name]=result;return result;
 }
 async function single(name,query){
  try{rows[name]=await query;}catch(error){rows[name]={data:null,error};}
 }
 await Promise.all([
  // Payment dates can live only in raw_data, so filtering by order_date would
  // lose old orders paid inside the selected period. Preserve the web rule.
  paged('cafe24_orders','order_id,order_date,payment_status,paid_amount,order_price,cancel_amount,refund_amount,raw_data','order_id'),
  paged('cafe24_sales_daily','date,shop_no,payment_amount,refund_amount,sales_count,source_status,updated_at',row=>row.date&&row.shop_no!=null?`${row.date}:${row.shop_no}`:null,since('date')),
  single('cafe24_oauth_tokens',db.from('cafe24_oauth_tokens').select('token_data').eq('mall_id',process.env.CAFE24_MALL_ID).maybeSingle()),
  paged('naver_commerce_orders','order_id,order_date,payment_date','order_id',fallbackSince('payment_date')),
  paged('naver_commerce_settlements','settlement_key,settle_basis_start_date,settle_basis_end_date,settle_expect_date,settle_complete_date,settle_amount,pay_settle_amount,commission_settle_amount,benefit_settle_amount,deduction_restore_settle_amount,pay_holdback_amount,difference_settle_amount,updated_at','settlement_key',fallbackSince('settle_basis_end_date')),
  paged('naver_stats_daily','id,date,entity_type,cost','id',query=>query.gte('date',start).eq('entity_type','CAMPAIGN')),
  paged('naver_bizmoney_daily','date,charged_purchased,charged_free,used_purchased,used_free,closing_balance,current_balance,updated_at','date',since('date')),
  paged('coupang_settlements','settlement_key,order_id,vendor_item_id,recognition_date,settlement_date,sale_type,sale_amount,service_fee,service_fee_vat,settlement_amount,quantity,delivery_family,ingestion_source,source_record_id,period_start,period_end,reconciliation_status,provenance','settlement_key',fallbackSince('recognition_date')),
  paged('coupang_cost_transactions','transaction_key,source_type,transaction_type,event_date,recognition_date,order_id,reference_id,vendor_item_id,sku_id,product_name,option_name,quantity,gross_sales,seller_discount,cost_amount,cost_vat,credit_amount,delivery_family,ingestion_source,source_record_id,period_start,period_end,reconciliation_status,provenance','transaction_key',query=>query.or(`event_date.gte.${start},recognition_date.gte.${start},event_date.is.null`)),
  paged('coupang_ad_settlement_daily','id,date,row_type,delivery_type,campaign_id,chargeable_ad_spend,vat,billed_amount','id',since('date')),
  paged('coupang_settlement_summaries','summary_key,recognition_month,settlement_type,settlement_date,status,total_sale,service_fee,settlement_target_amount,settlement_amount,last_amount,pending_released_amount,final_amount,delivery_family,ingestion_source,source_record_id,period_start,period_end,reconciliation_status,provenance','summary_key',fallbackSince('period_end')),
  paged('coupang_rg_orders','order_id,status,paid_at,total_amount,item_count','order_id',query=>query.gte('paid_at',`${start}T00:00:00+09:00`)),
  paged('coupang_rg_order_items','external_item_key,order_id,vendor_item_id,product_name,quantity,amount','external_item_key'),
  paged('channel_cost_settings','platform,commission_rate,payment_fee_rate,default_shipping_cost','platform'),
  ...['CAFE24','NAVER','COUPANG'].map(platform=>single(`sync_${platform}`,db.from('sync_logs').select('platform,job_type,status,started_at,finished_at,metadata').eq('platform',platform).eq('job_type','FETCH_ALL').order('started_at',{ascending:false}).limit(1)))
 ]);
 const values=name=>Array.isArray(rows[name]?.data)&&!rows[name]?.error?rows[name].data:[];
 const failed=(...names)=>names.some(name=>rows[name]?.error||!rows[name]);
 let bizmoney=values('naver_bizmoney_daily');
 // The web hub falls back to the latest successful raw billing snapshots.
 // The snapshot is evidence, not a whole-period ledger. Missing days remain
 // advertising_complete=false in the shared calculation.
 if(!bizmoney.length){
  await single('naver_bizmoney_raw',db.from('raw_api_responses').select('endpoint,http_status,response_json,requested_at,created_at,error_message').eq('platform','NAVER').like('endpoint','/billing/bizmoney%').order('created_at',{ascending:false}).limit(40));
  bizmoney=normalizeBizmoneyRawSnapshots(values('naver_bizmoney_raw'));
 }
 const coupangUnavailable=failed('coupang_settlements','coupang_settlement_summaries','coupang_cost_transactions','coupang_ad_settlement_daily');
 const settings=values('channel_cost_settings');
 const calibration=calculateCoupangCostCalibration({settlements:values('coupang_settlements'),costTransactions:values('coupang_cost_transactions'),currentSetting:settings.find(item=>item.platform==='COUPANG')||{}});
 const center=buildUnifiedSettlementCenter({
  now:new Date(generatedAt),periodDays:days,
  cafe24Orders:values('cafe24_orders'),cafe24SalesDaily:values('cafe24_sales_daily'),
  cafe24Token:rows.cafe24_oauth_tokens?.error?null:rows.cafe24_oauth_tokens?.data?.token_data||null,
  naverOrders:values('naver_commerce_orders'),naverSettlements:values('naver_commerce_settlements'),
  naverAdStats:values('naver_stats_daily'),naverBizmoneyDaily:bizmoney,
  coupangSettlements:values('coupang_settlements'),coupangCostTransactions:values('coupang_cost_transactions'),
  coupangAdSettlements:values('coupang_ad_settlement_daily'),coupangSettlementSummaries:values('coupang_settlement_summaries'),
  coupangRgOrders:values('coupang_rg_orders'),coupangRgOrderItems:values('coupang_rg_order_items'),
  channelCostSettings:withEffectiveChannelSettings(settings,calibration),syncs:['CAFE24','NAVER','COUPANG'].flatMap(platform=>values(`sync_${platform}`)),
  unavailable:{CAFE24:failed('cafe24_orders','cafe24_sales_daily','channel_cost_settings'),NAVER:failed('naver_commerce_settlements'),COUPANG:coupangUnavailable,COUPANG_RG:coupangUnavailable||failed('coupang_rg_orders','coupang_rg_order_items')}
 });
 return {generatedAt,settlementPeriods:{[days]:center}};
}
module.exports={loadWorkspaceSettlement};
