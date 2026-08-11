import authModule from '../../../../lib/dashboard-auth.js';
import qaModule from '../../../../lib/qa/validator.js';
import runnerModule from '../../../../lib/automation/job-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await runnerModule.runJob({ jobName: 'DATA_QA', triggerType: 'MANUAL', maxAttempts: 1, work: ({ runId }) => qaModule.runDataQualityChecks({ automationRunId: runId }) });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
