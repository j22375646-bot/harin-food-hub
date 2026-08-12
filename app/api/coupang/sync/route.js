import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = supabaseModule.getSupabase();
    const existing = await db.from('coupang_sync_requests').select('id,request_type,status,requested_at').eq('request_type','FULL').in('status',['PENDING','RUNNING']).order('requested_at',{ascending:false}).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return Response.json({ ok:true, queued:true, existing:true, request:existing.data }, { status:202 });
    const queued = await db.from('coupang_sync_requests').insert({ request_type: 'FULL', status: 'PENDING' }).select('id,request_type,status,requested_at').single();
    if (queued.error) throw queued.error;
    return Response.json({ ok: true, queued: true, request: queued.data }, { status: 202 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message, run_id: error.automationRunId || null, sync: error.syncResult || null }, { status: error.status || 502 });
  }
}
