import syncModule from '../../../../lib/automation/sync-all.js';
import evaluatorModule from '../../../../lib/actions/evaluator.js';
import runnerModule from '../../../../lib/automation/job-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

function settled(name, value) {
  return value.status === 'fulfilled' ? { name, ok: true, data: value.value } : { name, ok: false, error: value.reason?.message || '실행 실패', run_id: value.reason?.automationRunId || null };
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const startedAt = new Date().toISOString();
  // Coupang requires the allow-listed home public IP, so its automatic sync is
  // handled by the hidden Windows task at 08:10 KST. Vercel only collects the
  // platforms that are safe to call from its dynamic outbound network.
  const sync = await Promise.allSettled([
    syncModule.syncCafe24('CRON'),
    syncModule.syncNaver('CRON')
  ]);
  const evaluation = await Promise.allSettled([runnerModule.runJob({ jobName: 'ACTION_EVALUATION', triggerType: 'CRON', maxAttempts: 1, work: () => evaluatorModule.evaluateActions({ minimumDays: 7 }) })]);
  const jobs = [
    settled('CAFE24_SYNC', sync[0]),
    settled('NAVER_SYNC', sync[1]),
    settled('ACTION_EVALUATION', evaluation[0])
  ];
  const ok = jobs.every(job => job.ok);
  return Response.json({ ok, started_at: startedAt, finished_at: new Date().toISOString(), jobs }, { status: ok ? 200 : 207 });
}
