import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fields = 'id,operation_type,target_type,target_id,status,result_json,error_message,collector,created_at,started_at,executed_at';

function publicRequest(row = {}) {
  return {
    id: row.id,
    status: row.status,
    collector: row.collector || null,
    createdAt: row.created_at || null,
    startedAt: row.started_at || null,
    executedAt: row.executed_at || null
  };
}

function responseFor(row, { latest = false } = {}) {
  if (!row) return apiSafety.json({ ok:true, status:'NOT_CHECKED', message:'아직 고정 IP 연결 상태를 확인하지 않았습니다.' });
  if (['PENDING','RUNNING'].includes(row.status)) {
    return apiSafety.json({ ok:true, pending:true, status:row.status, request:publicRequest(row) }, { status:latest ? 200 : 202 });
  }
  if (row.status === 'FAILED') {
    return apiSafety.json({ ok:false, status:'FAILED', error:row.error_message || '우체국 고정 IP 연결 확인에 실패했습니다.', request:publicRequest(row) }, { status:latest ? 200 : 502 });
  }
  if (row.status !== 'SUCCESS') return apiSafety.json({ ok:false, status:row.status, error:'확인할 수 없는 연결 상태입니다.' }, { status:409 });
  return apiSafety.json({ ok:true, status:'SUCCESS', ...operationQueue.open(row.result_json), request:publicRequest(row) });
}

export async function GET(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const db = supabaseModule.getSupabase();
    const requestId = new URL(request.url).searchParams.get('requestId');
    let query = db.from('coupang_operation_requests').select(fields);
    if (requestId) query = query.eq('id', requestId).eq('operation_type', 'EPOST_CONFIG_PROBE').single();
    else query = query.eq('operation_type', 'EPOST_CONFIG_PROBE').eq('target_type', 'CHANNEL').eq('target_id', 'EPOST').order('created_at', { ascending:false }).limit(1).maybeSingle();
    const result = await query;
    if (result.error) throw result.error;
    return responseFor(result.data, { latest:!requestId });
  } catch (error) {
    console.error('[epost status]', { message:error.message });
    return apiSafety.json({ ok:false, status:'FAILED', error:'우체국 연결 상태를 불러오지 못했습니다.' }, { status:500 });
  }
}

export async function POST(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const queued = await operationQueue.queueOperation(supabaseModule.getSupabase(), {
      operationType:'EPOST_CONFIG_PROBE',
      targetType:'CHANNEL',
      targetId:'EPOST',
      payload:{ probeVersion:1 },
      idempotencyKey:`epost-config:${Math.floor(Date.now() / 60000)}`
    });
    return apiSafety.json({ ok:true, pending:true, status:queued.request.status, request:queued.request }, { status:202 });
  } catch (error) {
    console.error('[epost probe queue]', { message:error.message });
    return apiSafety.json({ ok:false, status:'FAILED', error:'우체국 연결 확인 작업을 시작하지 못했습니다.' }, { status:error.status || 500 });
  }
}
