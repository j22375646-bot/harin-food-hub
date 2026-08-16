import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Client from '../../../../lib/cafe24/client.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';
import shippingLabelModule from '../../../../lib/orders/shipping-label.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HUB_ORDER = /^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/;
const fields = 'id,operation_type,target_type,target_id,status,result_json,error_message,collector,created_at,started_at,executed_at';
const text = value => value == null ? '' : String(value).trim();

function publicRequest(row = {}) {
  return { id:row.id, hubOrderId:row.target_id, status:row.status, collector:row.collector || null, createdAt:row.created_at || null, startedAt:row.started_at || null, executedAt:row.executed_at || null };
}

function publicResult(row) {
  if (!row) return apiSafety.json({ ok:false, error:'우체국 송장 발급 작업을 찾지 못했습니다.' }, { status:404 });
  if (['PENDING','RUNNING'].includes(row.status)) return apiSafety.json({ ok:true, pending:true, request:publicRequest(row) }, { status:202 });
  if (row.status === 'FAILED') return apiSafety.json({ ok:false, error:row.error_message || '우체국 송장 자동발급에 실패했습니다.', request:publicRequest(row) }, { status:409 });
  if (row.status !== 'SUCCESS') return apiSafety.json({ ok:false, error:'확인할 수 없는 송장 발급 상태입니다.' }, { status:409 });
  const opened = operationQueue.open(row.result_json);
  const result = opened.epostLive || {};
  return apiSafety.json({ ok:true, pending:false, result:{ trackingNo:text(result.trackingNo), reused:Boolean(result.reused), requestNo:text(result.requestNo), reservationNo:text(result.reservationNo) }, request:publicRequest(row) });
}

function receiverFromCafe24(payload = {}) {
  const receiver = Array.isArray(payload.receivers) ? payload.receivers[0] : payload.receiver || payload.receivers || {};
  return { name:text(receiver.name), contact:text(receiver.virtual_phone_no || receiver.cellphone || receiver.phone), postCode:text(receiver.zipcode || receiver.post_code), address:text(receiver.address_full || receiver.address1), addressDetail:text(receiver.address2), message:text(receiver.shipping_message) };
}

export async function GET(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const requestId = text(new URL(request.url).searchParams.get('requestId'));
    if (!UUID.test(requestId)) return apiSafety.json({ ok:false, error:'송장 발급 작업번호를 확인하세요.' }, { status:400 });
    const result = await supabaseModule.getSupabase().from('coupang_operation_requests').select(fields)
      .eq('id',requestId).eq('operation_type','EPOST_LIVE_ISSUE').eq('target_type','HUB_ORDER').maybeSingle();
    if (result.error) throw result.error;
    return publicResult(result.data);
  } catch (error) {
    console.error('[epost live issue poll]', { message:error.message });
    return apiSafety.json({ ok:false, error:'우체국 송장 발급 상태를 확인하지 못했습니다.' }, { status:500 });
  }
}

export async function POST(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const body = await apiSafety.readJson(request, { maxBytes:32 * 1024 });
    if (body.confirm !== true) return apiSafety.json({ ok:false, error:'실제 우체국 송장 발급 확인이 필요합니다.' }, { status:400 });
    const seen = new Set();
    const orderIds = (Array.isArray(body.orderIds) ? body.orderIds : []).map(value=>text(value).toUpperCase()).filter(value=>HUB_ORDER.test(value)&&!seen.has(value)&&seen.add(value)).slice(0,50);
    if (!orderIds.length) return apiSafety.json({ ok:false, error:'송장을 발급할 주문을 선택하세요.' }, { status:400 });
    const db = supabaseModule.getSupabase();
    const center = await unifiedOrdersModule.loadUnifiedOrders({ db });
    const byId = new Map(center.orders.map(order=>[order.hubOrderId,order]));
    const results = [];
    for (const hubOrderId of orderIds) {
      const order = byId.get(hubOrderId);
      try {
        if (!order) throw Object.assign(new Error('최신 주문 목록에서 찾지 못했습니다.'), { status:404 });
        if (!order.shippingEligible || !['PAID','PREPARING','READY_TO_SHIP'].includes(order.stage) || order.invoiceNumber) {
          throw Object.assign(new Error(order.invoiceNumber ? '이미 송장이 등록된 주문입니다.' : order.shippingBlockedReason || '현재 송장을 발급할 수 없는 주문입니다.'), { status:409 });
        }
        let receiver = order.receiver || {};
        if (order.platform === 'CAFE24') {
          const delivery = await cafe24Client.adminGet(cafe24Config.getConfig(), `/orders/${encodeURIComponent(order.externalOrderId)}/receivers`);
          receiver = receiverFromCafe24(delivery.payload || {});
        }
        const label=shippingLabelModule.shippingLabelForOrder(order);
        const payload = { live:true, order:{
          hubOrderId:order.hubOrderId, platform:order.platform, externalOrderId:order.externalOrderId,
          shipmentId:order.shipmentId || '', goodsName:label.goodsName,
          quantity:label.quantity,
          weight:2, volume:60, receiver
        } };
        const queued = await operationQueue.queueOperation(db, {
          operationType:'EPOST_LIVE_ISSUE', targetType:'HUB_ORDER', targetId:hubOrderId, payload,
          idempotencyKey:`epost-live:${hubOrderId}`
        });
        results.push({ hubOrderId, ok:true, pending:!queued.completed, request:queued.request });
      } catch (error) {
        results.push({ hubOrderId, ok:false, error:error.message });
      }
    }
    const succeeded = results.filter(item=>item.ok).length;
    return apiSafety.json({ ok:succeeded>0, succeeded, failed:results.length-succeeded, results }, { status:succeeded?202:409, headers:{'Cache-Control':'no-store'} });
  } catch (error) {
    console.error('[epost live issue]', { code:error.code || 'ERROR', message:error.message });
    return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:'우체국 송장 자동발급을 시작하지 못했습니다.' }, { status:error.status || 500 });
  }
}
