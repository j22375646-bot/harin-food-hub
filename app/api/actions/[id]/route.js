import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import updateModule from '../../../../lib/actions/update.js';

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
    const values = updateModule.buildActionUpdate(body);
    const { data, error } = await supabaseModule.getSupabase().from('actions')
      .update(values)
      .eq('id', id)
      .select('id,status,executed_at,priority,assignee,due_at,hold_reason')
      .single();
    if (error) throw error;
    return Response.json({ ok: true, action: data });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: error.statusCode || 500 });
  }
}
