import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import cafe24Sync from '../../../../lib/cafe24/sync.js';
import requestQueue from '../../../../lib/coupang/request-queue.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
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

function publicRequest(row) {
  if(!row)return null;
  const {error_message:ignoredError,...safe}=row;
  void ignoredError;
  return safe;
}

export async function POST(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const db=supabaseModule.getSupabase();
    const executionMinute=new Date().toISOString().slice(0,16);
    const coupang=await requestQueue.queueRequest(db,'ORDER_REALTIME',{idempotencyKey:`orders-live:${executionMinute}`});
    let naver=null; let naverError=null;
    try {
      naver=await operationQueue.queueOperation(db,{
        operationType:'NAVER_COMMERCE_SYNC',targetType:'CHANNEL',targetId:'SMARTSTORE',
        payload:{requestedAt:new Date().toISOString(),days:31},
        idempotencyKey:`orders-live:naver:${executionMinute}`
      });
    } catch(error) { naverError=error.message; }
    let cafe24=null; let cafe24Error=null;
    try { cafe24=await cafe24Sync.syncOrdersRealtime(cafe24Config.getConfig(),{days:31}); }
    catch(error) { cafe24Error=error.message; }
    const refreshedAt=cafe24?.finishedAt || new Date().toISOString();
    const center=await currentCenter(db,refreshedAt);
    return apiSafety.json({
      ok:Boolean(cafe24)||Boolean(coupang?.request)||Boolean(naver?.request),
      partial:Boolean(cafe24Error||naverError),cafe24,cafe24Error,coupang,naver,naverError,
      requests:{coupang:coupang?.request||null,naver:naver?.request||null},center,refreshedAt
    },{status:202});
  } catch(error) {
    console.error('[orders live refresh]',{message:error.message});
    return apiSafety.json({ok:false,error:'실시간 주문 상태를 확인하지 못했습니다.'},{status:502});
  }
}

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const searchParams=new URL(request.url).searchParams;
    const coupangRequestId=searchParams.get('coupangRequestId')||searchParams.get('requestId')||'';
    const naverRequestId=searchParams.get('naverRequestId')||'';
    if(!coupangRequestId&&!naverRequestId)return apiSafety.json({ok:false,error:'수집 요청번호를 확인하세요.'},{status:400});
    if((coupangRequestId&&!UUID.test(coupangRequestId))||(naverRequestId&&!UUID.test(naverRequestId)))return apiSafety.json({ok:false,error:'수집 요청번호를 확인하세요.'},{status:400});
    const db=supabaseModule.getSupabase();
    const [coupangResult,naverResult]=await Promise.all([
      coupangRequestId?db.from('coupang_sync_requests').select('id,status,requested_at,started_at,finished_at,error_message').eq('id',coupangRequestId).single():Promise.resolve({data:null,error:null}),
      naverRequestId?db.from('coupang_operation_requests').select('id,status,created_at,started_at,executed_at,error_message').eq('id',naverRequestId).single():Promise.resolve({data:null,error:null})
    ]);
    if(coupangResult.error)throw coupangResult.error;
    if(naverResult.error)throw naverResult.error;
    const requests={coupang:publicRequest(coupangResult.data),naver:publicRequest(naverResult.data)};
    const rows=[coupangResult.data,naverResult.data].filter(Boolean);
    if(rows.some(row=>['PENDING','RUNNING'].includes(row.status)))return apiSafety.json({ok:true,pending:true,requests},{status:202});
    const failures=[];
    if(coupangResult.data&&coupangResult.data.status!=='SUCCESS')failures.push('쿠팡 판매자배송 최신 조회 실패');
    if(naverResult.data&&naverResult.data.status!=='SUCCESS')failures.push('네이버 주문 최신 조회 실패');
    const refreshedAt=[coupangResult.data?.finished_at,naverResult.data?.executed_at].filter(Boolean).sort().at(-1)||new Date().toISOString();
    return apiSafety.json({
      ok:true,pending:false,partial:failures.length>0,failures,requests,
      center:await currentCenter(db,refreshedAt),refreshedAt
    });
  } catch(error) {
    console.error('[orders live refresh status]',{message:error.message});
    return apiSafety.json({ok:false,error:'주문·배송 실시간 수집 상태를 확인하지 못했습니다.'},{status:502});
  }
}
