import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
import unifiedOrders from '../../../../lib/orders/unified-orders.js';
import trackingQueue from '../../../../lib/shipping/tracking-queue.js';
import fulfillmentStatus from '../../../../lib/shipping/fulfillment-status.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const OPERATIONS=[fulfillmentStatus.ISSUE_OPERATION,fulfillmentStatus.CAFE24_TRANSFER,fulfillmentStatus.COUPANG_TRANSFER,trackingQueue.OPERATION];
const text=value=>value==null?'':String(value).trim();

function platformFromHubOrderId(value){
  if(/^HR-C24-/.test(value))return 'CAFE24';
  if(/^HR-CP-/.test(value))return 'COUPANG';
  if(/^HR-NV-/.test(value))return 'NAVER';
  return '';
}

function issueInvoice(row){
  if(row.operation_type!==fulfillmentStatus.ISSUE_OPERATION||row.status!=='SUCCESS')return '';
  try{return text(operationQueue.open(row.result_json)?.epostLive?.trackingNo);}catch{return '';}
}

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const db=supabaseModule.getSupabase();
    const [operationsResult,activeOperationsResult,coupangResult]=await Promise.all([
      trackingQueue.loadOrderOperationRows(db,{includeOrderDetails:false}),
      db.from('coupang_operation_requests')
        .select('id,operation_type,target_type,target_id,status,payload,result_json,error_message,created_at,started_at,executed_at,next_attempt_at')
        .in('operation_type',OPERATIONS).in('status',['PENDING','RUNNING','EXECUTING']).order('created_at',{ascending:false}).limit(500),
      db.from('coupang_orders').select('shipment_box_id,order_id').order('ordered_at',{ascending:false}).limit(5000)
    ]);
    if(operationsResult.error)throw operationsResult.error;
    if(activeOperationsResult.error)throw activeOperationsResult.error;
    const operationRows=[...(activeOperationsResult.data||[]),...(operationsResult.data||[])]
      .filter((row,index,rows)=>rows.findIndex(candidate=>candidate.id===row.id)===index)
      .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
    const shipmentToHub=new Map((coupangResult.data||[]).map(row=>[text(row.shipment_box_id),unifiedOrders.hubOrderId('COUPANG',text(row.order_id))]));
    const trackingStates=trackingQueue.trackingStatesFromRows(operationRows);
    const orderById=new Map();
    for(const row of operationRows){
      let hubOrderId='';
      if([fulfillmentStatus.ISSUE_OPERATION,fulfillmentStatus.CAFE24_TRANSFER].includes(row.operation_type))hubOrderId=text(row.target_id);
      else if(row.operation_type===fulfillmentStatus.COUPANG_TRANSFER)hubOrderId=shipmentToHub.get(text(row.target_id))||'';
      if(hubOrderId){
        const prior=orderById.get(hubOrderId)||{hubOrderId,platform:platformFromHubOrderId(hubOrderId),shipmentId:'',issuedInvoiceNumber:''};
        orderById.set(hubOrderId,{...prior,shipmentId:row.operation_type===fulfillmentStatus.COUPANG_TRANSFER?text(row.target_id):prior.shipmentId,issuedInvoiceNumber:issueInvoice(row)||prior.issuedInvoiceNumber});
      }
    }
    for(const [hubOrderId,state] of Object.entries(trackingStates)){
      if(!orderById.has(hubOrderId))orderById.set(hubOrderId,{hubOrderId,platform:platformFromHubOrderId(hubOrderId),shipmentId:'',invoiceNumber:state.trackingNo||''});
    }
    const result=fulfillmentStatus.buildFulfillmentStatuses({orders:[...orderById.values()],operationRows,trackingStates});
    return apiSafety.json({ok:true,...result,partial:Boolean(coupangResult.error)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('[shipping fulfillment status]',{message:error.message});
    return apiSafety.json({ok:false,error:'우체국 출고 작업 상태를 불러오지 못했습니다.'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
