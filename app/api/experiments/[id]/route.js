import authModule from '../../../../lib/dashboard-auth.js';
import service from '../../../../lib/experiments/service.js';
import runnerModule from '../../../../lib/automation/job-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request) {
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
  return authModule.verifySession(cookie);
}

export async function POST(request, { params }) {
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    if (body.action === 'EVALUATE') {
      const result = await runnerModule.runJob({ jobName: 'AB_TEST_EVALUATION', triggerType: 'MANUAL', maxAttempts: 1, work: () => service.evaluateTest(id) });
      return Response.json({ ok: true, ...result });
    }
    if (body.action === 'UPDATE_METRICS') return Response.json({ ok: true, result: await service.updateVariantMetrics(id, body.variants) });
    if (body.action === 'UPDATE_STATUS') return Response.json({ ok: true, test: await service.updateTestStatus(id, body.status) });
    return Response.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 });
  } catch (error) { return Response.json({ ok: false, error: error.message }, { status: 500 }); }
}
