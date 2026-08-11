import syncModule from '../../../../lib/automation/sync-all.js';
import authModule from '../../../../lib/dashboard-auth.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request) {
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
  if (!authModule.verifySession(cookie)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try { return Response.json({ ok: true, ...(await syncModule.syncCafe24('MANUAL')) }); }
  catch (error) { return Response.json({ ok: false, error: error.message, ...(error.syncResult || {}) }, { status: 502 }); }
}
