import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sessionCookie(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function PATCH(request, { params }) {
  if (!authModule.verifySession(sessionCookie(request))) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const allowed = new Set(['PLANNED', 'ON_HOLD', 'EXECUTED', 'CANCELLED', 'REVIEWED']);
    if (!allowed.has(body.status)) return Response.json({ ok: false, error: '허용되지 않은 상태입니다.' }, { status: 400 });
    const values = { status: body.status, updated_at: new Date().toISOString() };
    if (body.priority && ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(body.priority)) values.priority = body.priority;
    if (typeof body.assignee === 'string') values.assignee = body.assignee.slice(0, 100) || null;
    if (/^20\d{2}-\d{2}-\d{2}$/.test(String(body.due_at || ''))) values.due_at = body.due_at;
    if (body.status === 'ON_HOLD') values.hold_reason = String(body.hold_reason || '수동 보류').slice(0, 500);
    if (body.status !== 'ON_HOLD') values.hold_reason = null;
    if (body.status === 'EXECUTED') values.executed_at = new Date().toISOString();
    const { data, error } = await supabaseModule.getSupabase().from('actions').update(values).eq('id', id).select('id,status,executed_at,priority,assignee,due_at,hold_reason').single();
    if (error) throw error;
    return Response.json({ ok: true, action: data });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
