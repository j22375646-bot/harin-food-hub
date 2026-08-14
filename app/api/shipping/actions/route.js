import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Client from '../../../../lib/cafe24/client.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';
import channelTransfer from '../../../../lib/shipping/channel-transfer.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const text=value=>value==null?'':String(value).trim();

function cafe24Error(error) {
  const detail=text(error?.payload?.error?.message||error?.payload?.message||error?.payload?.error?.more_info);
  return detail||error.message||'Cafe24 송장 전송에 실패했습니다.';
}

function cafe24Shipments(payload) {
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.shipments))return payload.shipments;
  if(Array.isArray(payload?.shipping))return payload.shipping;
  return [];
}

async function runCafe24(db, action, order, input) {
  const config=cafe24Config.getConfig();
  if(action==='PREPARE') {
    await cafe24Client.adminRequest(config,'PUT',`/orders/${encodeURIComponent(order.externalOrderId)}`,{process_status:'prepareproduct'});
    return {status:'SUCCESS'};
  }
  if(action==='UPLOAD_INVOICE') {
    const audit=await channelTransfer.beginCafe24Transfer(db,{
      hubOrderId:order.hubOrderId,externalOrderId:order.externalOrderId,
      invoiceNumber:input.invoiceNumber,deliveryCompanyCode:input.deliveryCompanyCode
    });
    if(audit.completed)return {status:'SUCCESS',requestId:audit.request.id,reused:true};
    if(audit.pending)return {status:'RUNNING',requestId:audit.request.id,reused:true};
    try {
      if(audit.retried) {
        const existing=await cafe24Client.adminGet(config,`/orders/${encodeURIComponent(order.externalOrderId)}/shipments`);
        const alreadyTransferred=cafe24Shipments(existing.payload).some(shipment=>text(shipment.tracking_no)===input.invoiceNumber);
        if(alreadyTransferred) {
          await channelTransfer.finishCafe24Transfer(db,audit.request.id,'SUCCESS',{
            platform:'CAFE24',verifiedExisting:true,invoiceNumber:input.invoiceNumber
          });
          return {status:'SUCCESS',requestId:audit.request.id,reused:true,retried:true};
        }
      }
      const response=await cafe24Client.adminRequest(config,'POST',`/orders/${encodeURIComponent(order.externalOrderId)}/shipments`,{
        tracking_no:input.invoiceNumber,
        shipping_company_code:input.deliveryCompanyCode,
        status:'shipping'
      });
      await channelTransfer.finishCafe24Transfer(db,audit.request.id,'SUCCESS',{
        platform:'CAFE24',status:response.status,invoiceNumber:input.invoiceNumber
      });
      return {status:'SUCCESS',requestId:audit.request.id,retried:Boolean(audit.retried)};
    } catch(error) {
      const message=cafe24Error(error);
      await channelTransfer.finishCafe24Transfer(db,audit.request.id,'FAILED',{platform:'CAFE24'},message);
      throw Object.assign(new Error(message),{status:error.status||502});
    }
  }
  throw Object.assign(new Error('지원하지 않는 Cafe24 배송 작업입니다.'),{status:400});
}

async function runCoupang(db, action, order, input) {
  const operationType=action==='PREPARE'?'ACKNOWLEDGE':'UPLOAD_INVOICE';
  const payload={
    confirm:true,
    action:operationType,
    shipmentBoxId:order.shipmentId,
    orderId:order.externalOrderId,
    invoiceNumber:input.invoiceNumber,
    deliveryCompanyCode:input.deliveryCompanyCode,
    vendorItemIds:(order.items||[]).map(item=>item.vendorItemId).filter(Boolean)
  };
  const queued=await operationQueue.queueOperation(db,{
    operationType,targetType:'ORDER',targetId:order.shipmentId,payload,
    idempotencyKey:`shipping:${operationType}:${order.shipmentId}:${input.invoiceNumber||'prepare'}`
  });
  return {
    status:queued.completed?'SUCCESS':'QUEUED',requestId:queued.request?.id,
    reused:Boolean(queued.existing),retried:Boolean(queued.retried)
  };
}

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const db=supabaseModule.getSupabase();
    const [center,history]=await Promise.all([
      unifiedOrdersModule.loadUnifiedOrders({db}),
      db.from('coupang_operation_requests')
        .select('id,operation_type,target_type,target_id,status,payload,error_message,created_at,executed_at')
        .in('operation_type',['UPLOAD_INVOICE',channelTransfer.CAFE24_OPERATION])
        .order('created_at',{ascending:false}).limit(300)
    ]);
    if(history.error)throw history.error;
    const coupangByShipment=new Map(center.orders.filter(order=>order.platform==='COUPANG').map(order=>[text(order.shipmentId),order.hubOrderId]));
    const latest={};
    for(const row of history.data||[]) {
      const hubOrderId=row.operation_type===channelTransfer.CAFE24_OPERATION?row.target_id:coupangByShipment.get(text(row.target_id));
      if(!hubOrderId||latest[hubOrderId])continue;
      let invoiceNumber='';
      try{invoiceNumber=channelTransfer.postalTracking(operationQueue.open(row.payload)?.invoiceNumber);}catch{}
      latest[hubOrderId]={hubOrderId,platform:row.operation_type===channelTransfer.CAFE24_OPERATION?'CAFE24':'COUPANG',invoiceNumber,...channelTransfer.publicStatus(row)};
    }
    return apiSafety.json({ok:true,results:Object.values(latest)},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('[shipping action history]',{message:error.message});
    return apiSafety.json({ok:false,error:'송장 전송 기록을 불러오지 못했습니다.'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}

export async function POST(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const body=await apiSafety.readJson(request,{maxBytes:64*1024});
    if(body.confirm!==true)return apiSafety.json({ok:false,error:'실제 주문 변경 확인이 필요합니다.'},{status:400});
    const action=text(body.action).toUpperCase();
    if(!['PREPARE','UPLOAD_INVOICE'].includes(action))return apiSafety.json({ok:false,error:'지원하지 않는 배송 작업입니다.'},{status:400});
    const seen=new Set();
    const requested=(Array.isArray(body.orders)?body.orders:[]).filter(item=>{
      const id=text(item?.hubOrderId);
      if(!id||seen.has(id))return false;
      seen.add(id);return true;
    }).slice(0,100);
    if(!requested.length)return apiSafety.json({ok:false,error:'처리할 주문을 선택하세요.'},{status:400});
    const db=supabaseModule.getSupabase();
    const center=await unifiedOrdersModule.loadUnifiedOrders({db});
    const byId=new Map(center.orders.map(order=>[order.hubOrderId,order]));
    let successfulTransfers=new Map();
    if(action==='UPLOAD_INVOICE'){
      const history=await db.from('coupang_operation_requests')
        .select('id,operation_type,target_id,status,payload,created_at')
        .in('operation_type',['UPLOAD_INVOICE',channelTransfer.CAFE24_OPERATION]).eq('status','SUCCESS')
        .order('created_at',{ascending:false}).limit(1000);
      if(history.error)throw history.error;
      successfulTransfers=channelTransfer.successfulTransferIndex(history.data||[]);
    }
    const results=[];
    for(let input of requested) {
      const hubOrderId=text(input.hubOrderId);
      const order=byId.get(hubOrderId);
      try {
        if(!order)throw Object.assign(new Error('최신 주문 목록에서 찾지 못했습니다.'),{status:404});
        if(!order.shippingEligible)throw Object.assign(new Error(order.shippingBlockedReason||'이 주문은 출고할 수 없습니다.'),{status:409});
        if(action==='UPLOAD_INVOICE') {
          const invoiceNumber=channelTransfer.postalTracking(input.invoiceNumber);
          const deliveryCompanyCode=channelTransfer.courierCode(order.platform,input.deliveryCompanyCode);
          input={...input,invoiceNumber,deliveryCompanyCode};
          const prior=successfulTransfers.get(channelTransfer.successfulTransferKey(order.platform,order));
          if(prior?.invoiceNumber&&prior.invoiceNumber!==invoiceNumber){
            throw Object.assign(new Error(`이미 다른 송장번호(${prior.invoiceNumber}) 전송이 완료된 주문입니다. 기존 번호를 확인하세요.`),{status:409,code:'SHIPPING_INVOICE_CONFLICT'});
          }
          if(prior?.invoiceNumber===invoiceNumber){
            results.push({hubOrderId,platform:order.platform,ok:true,status:'SUCCESS',requestId:prior.requestId,reused:true,retried:false});
            continue;
          }
        }
        let outcome;
        if(order.platform==='CAFE24')outcome=await runCafe24(db,action,order,input);
        else if(order.platform==='COUPANG')outcome=await runCoupang(db,action,order,input);
        else throw Object.assign(new Error('네이버 주문 조회는 연결됐지만 발주·발송 전송은 안전 잠금 중입니다.'),{status:409});
        results.push({hubOrderId,platform:order.platform,ok:true,status:outcome.status,requestId:outcome.requestId||null,reused:Boolean(outcome.reused),retried:Boolean(outcome.retried)});
      } catch(error) {
        results.push({hubOrderId,platform:order?.platform||'UNKNOWN',ok:false,error:error.message});
      }
    }
    const succeeded=results.filter(item=>item.ok).length;
    const queued=results.some(item=>item.ok&&['QUEUED','RUNNING'].includes(item.status));
    return apiSafety.json({ok:succeeded>0,succeeded,failed:results.length-succeeded,results},{status:succeeded?(queued?202:200):409,headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('[shipping actions]',{message:error.message});
    return apiSafety.json({ok:false,error:'배송 작업을 시작하지 못했습니다.'},{status:500});
  }
}
