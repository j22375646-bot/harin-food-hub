import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Client from '../../../../lib/cafe24/client.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const text=value=>value==null?'':String(value).trim();

async function runCafe24(action, order, input) {
  const config=cafe24Config.getConfig();
  if(action==='PREPARE') {
    return cafe24Client.adminRequest(config,'PUT',`/orders/${encodeURIComponent(order.externalOrderId)}`,{process_status:'prepareproduct'});
  }
  if(action==='UPLOAD_INVOICE') {
    return cafe24Client.adminRequest(config,'POST',`/orders/${encodeURIComponent(order.externalOrderId)}/shipments`,{
      tracking_no:input.invoiceNumber,
      shipping_company_code:input.deliveryCompanyCode,
      status:'shipping'
    });
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
  return operationQueue.queueOperation(db,{
    operationType,targetType:'ORDER',targetId:order.shipmentId,payload,
    idempotencyKey:`shipping:${operationType}:${order.shipmentId}:${input.invoiceNumber||'prepare'}`
  });
}

export async function POST(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const body=await request.json();
    if(body.confirm!==true)return apiSafety.json({ok:false,error:'실제 주문 변경 확인이 필요합니다.'},{status:400});
    const action=text(body.action).toUpperCase();
    if(!['PREPARE','UPLOAD_INVOICE'].includes(action))return apiSafety.json({ok:false,error:'지원하지 않는 배송 작업입니다.'},{status:400});
    const requested=Array.isArray(body.orders)?body.orders.slice(0,100):[];
    if(!requested.length)return apiSafety.json({ok:false,error:'처리할 주문을 선택하세요.'},{status:400});
    const db=supabaseModule.getSupabase();
    const center=await unifiedOrdersModule.loadUnifiedOrders({db});
    const byId=new Map(center.orders.map(order=>[order.hubOrderId,order]));
    const results=[];
    for(let input of requested) {
      const hubOrderId=text(input.hubOrderId);
      const order=byId.get(hubOrderId);
      try {
        if(!order)throw Object.assign(new Error('최신 주문 목록에서 찾지 못했습니다.'),{status:404});
        if(!order.shippingEligible)throw Object.assign(new Error(order.shippingBlockedReason||'이 주문은 출고할 수 없습니다.'),{status:409});
        if(action==='UPLOAD_INVOICE') {
          const invoiceNumber=text(input.invoiceNumber);
          const deliveryCompanyCode=text(input.deliveryCompanyCode);
          if(!/^[A-Za-z0-9-]{6,40}$/.test(invoiceNumber))throw Object.assign(new Error('송장번호는 영문·숫자·하이픈 6~40자로 입력하세요.'),{status:400});
          if(!/^[A-Za-z0-9_-]{2,20}$/.test(deliveryCompanyCode))throw Object.assign(new Error('배송사 코드를 확인하세요.'),{status:400});
          if(deliveryCompanyCode==='EPOST'&&!/^\d{13}$/.test(invoiceNumber))throw Object.assign(new Error('우체국 송장번호는 숫자 13자리로 입력하세요.'),{status:400});
          input={...input,invoiceNumber,deliveryCompanyCode};
        }
        if(order.platform==='CAFE24')await runCafe24(action,order,input);
        else if(order.platform==='COUPANG')await runCoupang(db,action,order,input);
        else throw Object.assign(new Error('네이버 커머스 API 연결 후 사용할 수 있습니다.'),{status:409});
        results.push({hubOrderId,platform:order.platform,ok:true,status:order.platform==='COUPANG'?'QUEUED':'SUCCESS'});
      } catch(error) {
        results.push({hubOrderId,platform:order?.platform||'UNKNOWN',ok:false,error:error.message});
      }
    }
    const succeeded=results.filter(item=>item.ok).length;
    return apiSafety.json({ok:succeeded>0,succeeded,failed:results.length-succeeded,results},{status:succeeded?202:409});
  } catch(error) {
    console.error('[shipping actions]',{message:error.message});
    return apiSafety.json({ok:false,error:'배송 작업을 시작하지 못했습니다.'},{status:500});
  }
}
