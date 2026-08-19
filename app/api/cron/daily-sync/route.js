import syncModule from '../../../../lib/automation/sync-all.js';
import evaluatorModule from '../../../../lib/actions/evaluator.js';
import runnerModule from '../../../../lib/automation/job-runner.js';
import experimentModule from '../../../../lib/experiments/service.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import scheduleKeys from '../../../../lib/automation/kst-schedule.js';
import naverSearchTermSync from '../../../../lib/naver/sync.js';
import naverBidPerformance from '../../../../lib/naver/bid-performance.js';
import executionGuard from '../../../../lib/infrastructure/execution-route-guard.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

function settled(name, value) {
  if (value.status !== 'fulfilled') return { name, ok:false, error:value.reason?.message || '실행 실패', run_id:value.reason?.automationRunId || null };
  const data = value.value;
  if (data?.skipped) return { name, ok:true, skipped:true, data };
  const ok = !['PARTIAL','FAILED'].includes(data?.status);
  return { name, ok, data, ...(ok ? {} : { error:data?.status === 'PARTIAL' ? '일부 연결 채널 수집 실패' : '실행 실패' }) };
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  const startedAt = now.toISOString();
  const runOptions = jobName => scheduleKeys.cronExecution(jobName, { now, hour: 5, minute: 30 });
  const routeSchedule=runOptions('DAILY_COLLECTION_ROUTE');
  const guarded=await executionGuard.runGuardedRoute({
    db:supabaseModule.getSupabase(),laneKey:'DAILY_COLLECTION',ownerKey:'VERCEL_CRON:VERCEL_FUNCTION',
    runKey:routeSchedule.idempotencyKey,scheduledFor:routeSchedule.scheduledFor,
    kstExecutionDate:routeSchedule.kstExecutionDate,staleAfterMs:45*60*1000
  },async()=>{
  // 연결된 채널만 수집합니다. 쿠팡·네이버 커머스는 서울 고정 IP 작업자 큐로 전달됩니다.
  const collectionResult = await Promise.allSettled([
    syncModule.syncAllPlatforms({ triggerType:'CRON', now, runOptions:runOptions('ALL_PLATFORM_SYNC') })
  ]);
  const collection = collectionResult[0].status === 'fulfilled' ? collectionResult[0].value : null;
  const naverAds = collection?.jobs?.find(item => item.name === 'NAVER_ADS');
  const searchTerms = naverAds?.ok && !naverAds?.skipped
    ? await Promise.allSettled([naverSearchTermSync.syncSearchTermsLogged(supabaseModule.getSupabase(), 30)])
    : [{ status:'fulfilled', value:{ skipped:true, status:'SETUP_REQUIRED', reason:'네이버 검색광고 연결 후 수집 가능' } }];
  const evaluation = await Promise.allSettled([
    runnerModule.runJob({ jobName: 'ACTION_EVALUATION', triggerType: 'CRON', maxAttempts: 1, ...runOptions('ACTION_EVALUATION'), work: () => evaluatorModule.evaluateActions({ minimumDays: 7 }) }),
    runnerModule.runJob({ jobName: 'AB_TEST_EVALUATION', triggerType: 'CRON', maxAttempts: 1, ...runOptions('AB_TEST_EVALUATION'), work: () => experimentModule.evaluateRunningTests({ automatic: true }) }),
    runnerModule.runJob({ jobName: 'NAVER_BID_EVALUATION', triggerType: 'CRON', maxAttempts: 1, ...runOptions('NAVER_BID_EVALUATION'), work: () => naverBidPerformance.evaluateDueChanges() })
  ]);
  const jobs = [
    settled('CONNECTED_PLATFORM_SYNC', collectionResult[0]),
    settled('NAVER_SEARCH_TERMS', searchTerms[0]),
    settled('ACTION_EVALUATION', evaluation[0]),
    settled('AB_TEST_EVALUATION', evaluation[1]),
    settled('NAVER_BID_EVALUATION', evaluation[2])
  ];
  const ok = jobs.every(job => job.ok);
  return {status:ok?200:207,body:{ok,started_at:startedAt,finished_at:new Date().toISOString(),jobs}};
  });
  return Response.json(guarded.body,{status:guarded.status});
}
