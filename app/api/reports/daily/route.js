import authModule from '../../../../lib/dashboard-auth.js';
import scheduleModule from '../../../../lib/automation/report-scheduler.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await scheduleModule.generateDaily({ triggerType: 'MANUAL', deduplicate: false });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
