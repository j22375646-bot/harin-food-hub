import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';

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
    const queued = await db.from('coupang_sync_requests').insert({ request_type: 'RG_INVENTORY', status: 'PENDING' }).select('id,request_type,status,requested_at').single();
    if (queued.error) throw queued.error;
    return Response.json({ ok: true, queued: true, request: queued.data }, { status: 202 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message, sync: error.syncResult || null }, { status: error.status || 502 });
  }
}
