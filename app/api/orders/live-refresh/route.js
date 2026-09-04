import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import cafe24Sync from '../../../../lib/cafe24/sync.js';
import requestQueue from '../../../../lib/coupang/request-queue.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
import reliabilityCenter from '../../../../lib/operations/reliability-center.js';
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

function publicWorker(readiness) {
  return {
    ready:Boolean(readiness?.ready),
    code:readiness?.code||'FIXED_IP_WORKER_OFFLINE',
    lastSeenAt:readiness?.lastSeenAt||null,
    silenceMinutes:readiness?.silenceMinutes??null
  };
}

function failedReadiness() {
  return {ready:false,code:'FIXED_IP_WORKER_OFFLINE',lastSeenAt:null,silenceMinutes:null};
}

async function settledValue(task) {
  try{return {value:await task(),error:null};}
  catch(error){return {value:null,error:error?.message||'작업 실패'};}
}

export async function POST(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const db=supabaseModule.getSupabase();
    const now=new Date();
    const [readinessResult,cafe24Result]=await Promise.all([
      settledValue(()=>reliabilityCenter.loadLiveRefreshWorkerReadiness(db,{now})),
      settledValue(()=>cafe24Sync.syncOrdersRealtime(cafe24Config.getConfig(),{days:31}))
    ]);
    const readiness=readinessResult.value||failedReadiness();
    const executionMinute=now.toISOString().slice(0,16);
    let coupangResult={value:null,error:null};
    let naverResult={value:null,error:null};
    if(readiness.ready){
      [coupangResult,naverResult]=await Promise.all([
        settledValue(()=>requestQueue.queueRequest(db,'ORDER_REALTIME',{
          idempotencyKey:`orders-live:${executionMinute}`,
          now,
          staleAfterMs:reliabilityCenter.SILENCE_MINUTES*60*1000
        })),
        settledValue(()=>operationQueue.queueOperation(db,{
          operationType:'NAVER_COMMERCE_SYNC',targetType:'CHANNEL',targetId:'SMARTSTORE',
          payload:{requestedAt:now.toISOString(),days:31},
          idempotencyKey:`orders-live:naver:${executionMinute}`,
          now
        }))
      ]);
    }
    const cafe24=cafe24Result.value;
    const coupang=coupangResult.value;
    const naver=naverResult.value;
    const cafe24Error=cafe24Result.error;
    const failures=[];
    const unavailablePlatforms=[];
    if(cafe24Error)failures.push('Cafe24 주문 최신 조회 실패');
    if(!readiness.ready){
      failures.push('고정 IP 주문 서버 연결 확인 필요 · 네이버·쿠팡 이전 정상값 유지');
      unavailablePlatforms.push('NAVER','COUPANG');
    } else {
      if(coupangResult.error)failures.push('쿠팡 판매자배송 수집 요청 실패');
      if(naverResult.error)failures.push('네이버 주문 수집 요청 실패');
    }
    const refreshedAt=cafe24?.finishedAt || new Date().toISOString();
    const center=await currentCenter(db,refreshedAt);
    const requests={coupang:coupang?.request||null,naver:naver?.request||null};
    const ok=Boolean(cafe24)||Boolean(requests.coupang)||Boolean(requests.naver);
    const pending=Boolean(requests.coupang||requests.naver);
    const status=!ok?503:pending?202:failures.length?207:200;
    return apiSafety.json({
      ok,partial:failures.length>0,pending,failures,unavailablePlatforms,
      cafe24,cafe24Error:cafe24Error?'Cafe24 주문 최신 조회 실패':null,
      coupang,naver,requests,worker:publicWorker(readiness),center,refreshedAt
    },{status});
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
    const [readinessResult,coupangResult,naverResult]=await Promise.all([
      settledValue(()=>reliabilityCenter.loadLiveRefreshWorkerReadiness(db,{now:new Date()})),
      coupangRequestId?db.from('coupang_sync_requests').select('id,status,requested_at,started_at,finished_at,error_message').eq('id',coupangRequestId).single():Promise.resolve({data:null,error:null}),
      naverRequestId?db.from('coupang_operation_requests').select('id,status,created_at,started_at,executed_at,error_message').eq('id',naverRequestId).single():Promise.resolve({data:null,error:null})
    ]);
    const readiness=readinessResult.value||failedReadiness();
    if(coupangResult.error)throw coupangResult.error;
    if(naverResult.error)throw naverResult.error;
    const requests={coupang:publicRequest(coupangResult.data),naver:publicRequest(naverResult.data)};
    const rows=[coupangResult.data,naverResult.data].filter(Boolean);
    const failures=[];
    const waiting=rows.some(row=>['PENDING','RUNNING'].includes(row.status));
    if(waiting&&readiness.ready)return apiSafety.json({ok:true,pending:true,partial:false,failures,requests,worker:publicWorker(readiness)},{status:202});
    if(waiting&&!readiness.ready)failures.push('고정 IP 주문 서버 연결 확인 필요 · 네이버·쿠팡 이전 정상값 유지');
    if(!waiting&&coupangResult.data&&coupangResult.data.status!=='SUCCESS')failures.push('쿠팡 판매자배송 최신 조회 실패');
    if(!waiting&&naverResult.data&&naverResult.data.status!=='SUCCESS')failures.push('네이버 주문 최신 조회 실패');
    const refreshedAt=[coupangResult.data?.finished_at,naverResult.data?.executed_at].filter(Boolean).sort().at(-1)||new Date().toISOString();
    return apiSafety.json({
      ok:true,pending:false,partial:failures.length>0,failures,requests,
      worker:publicWorker(readiness),unavailablePlatforms:waiting&&!readiness.ready?['NAVER','COUPANG']:[],
      center:await currentCenter(db,refreshedAt),refreshedAt
    },{status:failures.length?207:200});
  } catch(error) {
    console.error('[orders live refresh status]',{message:error.message});
    return apiSafety.json({ok:false,error:'주문·배송 실시간 수집 상태를 확인하지 못했습니다.'},{status:502});
  }
}
