import authModule from '../../../../lib/dashboard-auth.js';
import syncModule from '../../../../lib/automation/sync-all.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await syncModule.syncAllPlatforms({ triggerType: 'MANUAL' });
    return Response.json({ ok: result.status !== 'FAILED', ...result }, { status: result.status === 'PARTIAL' ? 207 : 200 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message, run_id: error.automationRunId || null }, { status: 502 });
  }
}
