import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import cafe24Sync from '../../../../lib/cafe24/sync.js';
import requestQueue from '../../../../lib/coupang/request-queue.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function currentCenter(db, refreshedAt) {
  const center=await unifiedOrdersModule.loadUnifiedOrders({db});
  center.summary.refreshedAt=refreshedAt || new Date().toISOString();
  return center;
}

export async function POST(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const db=supabaseModule.getSupabase();
    const executionMinute=new Date().toISOString().slice(0,16);
    const coupang=await requestQueue.queueRequest(db,'ORDER_REALTIME',{idempotencyKey:`orders-live:${executionMinute}`});
    let cafe24=null; let cafe24Error=null;
    try { cafe24=await cafe24Sync.syncOrdersRealtime(cafe24Config.getConfig(),{days:90}); }
    catch(error) { cafe24Error=error.message; }
    const refreshedAt=cafe24?.finishedAt || new Date().toISOString();
    const center=await currentCenter(db,refreshedAt);
    return apiSafety.json({ok:Boolean(cafe24)||Boolean(coupang?.queued),partial:Boolean(cafe24Error),cafe24,cafe24Error,coupang,center,refreshedAt},{status:202});
  } catch(error) {
    console.error('[orders live refresh]',{message:error.message});
    return apiSafety.json({ok:false,error:'실시간 주문 상태를 확인하지 못했습니다.'},{status:502});
  }
}

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const requestId=new URL(request.url).searchParams.get('requestId') || '';
    if(!UUID.test(requestId))return apiSafety.json({ok:false,error:'수집 요청번호를 확인하세요.'},{status:400});
    const db=supabaseModule.getSupabase();
    const result=await db.from('coupang_sync_requests').select('id,status,requested_at,started_at,finished_at,error_message').eq('id',requestId).single();
    if(result.error)throw result.error;
    if(['PENDING','RUNNING'].includes(result.data.status))return apiSafety.json({ok:true,pending:true,request:{...result.data,error_message:undefined}},{status:202});
    if(result.data.status==='FAILED')return apiSafety.json({ok:false,error:'쿠팡 판매자배송 최신 조회가 실패했습니다.',request:{...result.data,error_message:undefined}},{status:502});
    return apiSafety.json({ok:true,pending:false,request:{...result.data,error_message:undefined},center:await currentCenter(db,result.data.finished_at),refreshedAt:result.data.finished_at});
  } catch(error) {
    console.error('[orders live refresh status]',{message:error.message});
    return apiSafety.json({ok:false,error:'쿠팡 실시간 수집 상태를 확인하지 못했습니다.'},{status:502});
  }
}
