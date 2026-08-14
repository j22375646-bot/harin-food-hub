import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) {
    return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  }
  try {
    const now = new Date();
    const queued = await operationQueue.queueOperation(supabaseModule.getSupabase(), {
      operationType:'NAVER_COMMERCE_SYNC',
      targetType:'CHANNEL',
      targetId:'SMARTSTORE',
      payload:{ requestedAt:now.toISOString(), days:31 },
      idempotencyKey:`naver-commerce-manual:${now.toISOString().slice(0, 16)}`,
    });
    return Response.json({ ok:true, ...queued }, { status:202, headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ ok:false, code:error.code || 'NAVER_COMMERCE_SYNC_FAILED', error:error.message }, {
      status:error.status || 502,
      headers:{ 'Cache-Control':'no-store' },
    });
  }
}
