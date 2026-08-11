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
  const sync = await Promise.allSettled([syncModule.syncAllPlatforms({ triggerType: 'CRON' })]);
  const evaluation = await Promise.allSettled([runnerModule.runJob({ jobName: 'ACTION_EVALUATION', triggerType: 'CRON', maxAttempts: 1, work: () => evaluatorModule.evaluateActions({ minimumDays: 7 }) })]);
  const jobs = [settled('ALL_PLATFORM_SYNC', sync[0]), settled('ACTION_EVALUATION', evaluation[0])];
  const ok = jobs.every(job => job.ok);
  return Response.json({ ok, started_at: startedAt, finished_at: new Date().toISOString(), jobs }, { status: ok ? 200 : 207 });
}
