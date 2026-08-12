import syncModule from '../../../../lib/automation/sync-all.js';
import evaluatorModule from '../../../../lib/actions/evaluator.js';
import runnerModule from '../../../../lib/automation/job-runner.js';
import experimentModule from '../../../../lib/experiments/service.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import queueModule from '../../../../lib/coupang/request-queue.js';

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
  // Coupang API calls are queued here and executed by the Seoul fixed-IP worker.
  // This keeps all platform collection aligned at 05:30 KST without using a home PC.
  const sync = await Promise.allSettled([
    syncModule.syncCafe24('CRON'),
    syncModule.syncNaver('CRON'),
    queueModule.queueRequest(supabaseModule.getSupabase(), 'FULL')
  ]);
  const evaluation = await Promise.allSettled([
    runnerModule.runJob({ jobName: 'ACTION_EVALUATION', triggerType: 'CRON', maxAttempts: 1, work: () => evaluatorModule.evaluateActions({ minimumDays: 7 }) }),
    runnerModule.runJob({ jobName: 'AB_TEST_EVALUATION', triggerType: 'CRON', maxAttempts: 1, work: () => experimentModule.evaluateRunningTests({ automatic: true }) })
  ]);
  const jobs = [
    settled('CAFE24_SYNC', sync[0]),
    settled('NAVER_SYNC', sync[1]),
    settled('COUPANG_SYNC_QUEUED', sync[2]),
    settled('ACTION_EVALUATION', evaluation[0]),
    settled('AB_TEST_EVALUATION', evaluation[1])
  ];
  const ok = jobs.every(job => job.ok);
  return Response.json({ ok, started_at: startedAt, finished_at: new Date().toISOString(), jobs }, { status: ok ? 200 : 207 });
}
