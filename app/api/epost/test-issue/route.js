import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Client from '../../../../lib/cafe24/client.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HUB_ORDER = /^HR-(?:C24|CP)-[A-F0-9]{8}$/;
const fields = 'id,operation_type,target_type,target_id,status,result_json,error_message,collector,created_at,started_at,executed_at';
const text = value => value == null ? '' : String(value).trim();

function publicRequest(row = {}) {
  return {
    id:row.id, status:row.status, collector:row.collector || null,
    createdAt:row.created_at || null, startedAt:row.started_at || null,
    executedAt:row.executed_at || null
  };
}

function publicResult(row, { reused = false } = {}) {
  if (!row) return apiSafety.json({ ok:false, error:'우체국 테스트 접수 작업을 찾지 못했습니다.' }, { status:404 });
  if (['PENDING','RUNNING'].includes(row.status)) {
    return apiSafety.json({ ok:true, pending:true, request:publicRequest(row) }, { status:202 });
  }
  if (row.status === 'FAILED') {
    return apiSafety.json({ ok:false, error:row.error_message || '우체국 테스트 접수에 실패했습니다.', request:publicRequest(row) }, { status:409 });
  }
  if (row.status !== 'SUCCESS') return apiSafety.json({ ok:false, error:'확인할 수 없는 테스트 접수 상태입니다.' }, { status:409 });
  const opened = operationQueue.open(row.result_json);
  return apiSafety.json({ ok:true, pending:false, reused, testOnly:true, result:opened.epostTest || {}, request:publicRequest(row) });
}

function receiverFromCafe24(payload = {}) {
  const receiver = Array.isArray(payload.receivers) ? payload.receivers[0] : payload.receiver || payload.receivers || {};
  return {
    name:text(receiver.name),
    contact:text(receiver.virtual_phone_no || receiver.cellphone || receiver.phone),
    postCode:text(receiver.zipcode || receiver.post_code),
    address:text(receiver.address_full || receiver.address1),
    addressDetail:text(receiver.address2),
    message:text(receiver.shipping_message)
  };
}

async function priorSuccess(db, hubOrderId) {
  const result = await db.from('coupang_operation_requests').select(fields)
    .eq('operation_type','EPOST_TEST_ISSUE').eq('target_type','HUB_ORDER').eq('target_id',hubOrderId)
    .eq('status','SUCCESS').order('created_at',{ ascending:false }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function GET(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const requestId = text(new URL(request.url).searchParams.get('requestId'));
    if (!UUID.test(requestId)) return apiSafety.json({ ok:false, error:'테스트 접수 작업번호를 확인하세요.' }, { status:400 });
    const result = await supabaseModule.getSupabase().from('coupang_operation_requests').select(fields)
      .eq('id',requestId).eq('operation_type','EPOST_TEST_ISSUE').eq('target_type','HUB_ORDER').single();
    if (result.error?.code === 'PGRST116') return publicResult(null);
    if (result.error) throw result.error;
    return publicResult(result.data);
  } catch (error) {
    console.error('[epost test poll]', { message:error.message });
    return apiSafety.json({ ok:false, error:'우체국 테스트 접수 상태를 확인하지 못했습니다.' }, { status:500 });
  }
}

export async function POST(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const body = await apiSafety.readJson(request, { maxBytes:16 * 1024 });
    if (body.confirm !== true || body.testOnly !== true) {
      return apiSafety.json({ ok:false, error:'테스트 전용 접수임을 명시적으로 확인해야 합니다.' }, { status:400 });
    }
    const hubOrderId = text(body.hubOrderId).toUpperCase();
    if (!HUB_ORDER.test(hubOrderId)) return apiSafety.json({ ok:false, error:'Cafe24 또는 쿠팡 허브 주문번호를 확인하세요.' }, { status:400 });
    const db = supabaseModule.getSupabase();
    const prior = await priorSuccess(db, hubOrderId);
    if (prior) return publicResult(prior, { reused:true });

    const center = await unifiedOrdersModule.loadUnifiedOrders({ db });
    const order = center.orders.find(item => item.hubOrderId === hubOrderId);
    if (!order) return apiSafety.json({ ok:false, error:'최신 주문 목록에서 주문을 찾지 못했습니다.' }, { status:404 });
    if (!order.shippingEligible || !['PAID','PREPARING','READY_TO_SHIP'].includes(order.stage) || order.invoiceNumber) {
      return apiSafety.json({ ok:false, error:order.invoiceNumber ? '이미 송장이 등록된 주문입니다.' : order.shippingBlockedReason || '현재 테스트 접수할 수 없는 주문입니다.' }, { status:409 });
    }

    let receiver = {};
    if (order.platform === 'CAFE24') {
      const delivery = await cafe24Client.adminGet(cafe24Config.getConfig(), `/orders/${encodeURIComponent(order.externalOrderId)}/receivers`);
      receiver = receiverFromCafe24(delivery.payload || {});
    }
    const payload = {
      testOnly:true,
      order:{
        hubOrderId:order.hubOrderId, platform:order.platform,
        externalOrderId:order.externalOrderId, shipmentId:order.shipmentId || '',
        goodsName:(order.items || []).map(item => text(item.name)).filter(Boolean).join(' 외 '),
        quantity:(order.items || []).reduce((sum,item) => sum + Number(item.quantity || 0),0) || 1,
        weight:2, volume:60, receiver
      }
    };
    const queued = await operationQueue.queueOperation(db, {
      operationType:'EPOST_TEST_ISSUE', targetType:'HUB_ORDER', targetId:hubOrderId, payload,
      idempotencyKey:`epost-test:${hubOrderId}:${Math.floor(Date.now() / 60000)}`
    });
    return apiSafety.json({ ok:true, pending:true, testOnly:true, request:queued.request }, { status:202 });
  } catch (error) {
    console.error('[epost test issue]', { code:error.code || 'ERROR', message:error.message });
    return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:'우체국 테스트 접수를 시작하지 못했습니다.' }, { status:error.status || 500 });
  }
}
