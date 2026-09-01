'use strict';

const configModule = require('../cafe24/config.js');
const cafe24SyncModule = require('../cafe24/sync.js');
const naverSyncModule = require('../naver/sync.js');
const coupangQueueModule = require('../coupang/request-queue.js');
const operationQueue = require('../coupang/operation-queue.js');
const supabaseModule = require('../cafe24/supabase.js');
const tokenStore = require('../cafe24/token-store.js');
const { runJob } = require('./job-runner.js');
const { runDataQualityChecks } = require('../qa/validator.js');
const readiness = require('./sync-readiness.js');

async function syncCafe24(triggerType, runOptions = {}) {
  return runJob({ jobName: 'CAFE24_SYNC', triggerType, ...runOptions, work: () => cafe24SyncModule.syncAll(configModule.getConfig()) });
}

async function syncNaver(triggerType, runOptions = {}) {
  return runJob({ jobName: 'NAVER_SYNC', triggerType, ...runOptions, work: async () => {
    const counts = await naverSyncModule.syncAll();
    const keywords = await naverSyncModule.syncKeywordPerformanceWindows(supabaseModule.getSupabase());
    return { counts, keywords };
  } });
}

async function syncCoupang(triggerType, runOptions = {}) {
  const db = runOptions.db || supabaseModule.getSupabase();
  return runJob({ jobName: 'COUPANG_SYNC', triggerType, ...runOptions, db, work: () => coupangQueueModule.queueRequest(db, 'FULL', runOptions) });
}

async function syncNaverCommerce(triggerType, runOptions = {}) {
  const now = runOptions.now || new Date();
  const db = runOptions.db || supabaseModule.getSupabase();
  return operationQueue.queueOperation(db, {
    operationType:'NAVER_COMMERCE_SYNC',
    targetType:'CHANNEL',
    targetId:'SMARTSTORE',
    payload:{ requestedAt:now.toISOString(), days:31, triggerType },
    idempotencyKey:runOptions.idempotencyKey || `naver-commerce-all:${now.toISOString().slice(0, 16)}`,
  });
}

function settled(name, value) {
  if (value.status === 'fulfilled') {
    if (value.value?.skipped) return value.value;
    const data = value.value;
    const queued = Boolean(data?.queued || data?.status === 'RUNNING' || data?.request?.status === 'PENDING' || data?.request?.status === 'RUNNING');
    return { name, ok:true, status:queued?'RUNNING':data?.status || 'SUCCESS', data };
  }
  return { name, ok:false, status:'FAILED', error:value.reason?.message || '동기화 실패', run_id:value.reason?.automationRunId || null };
}

async function recentEvidence(db, table, orderColumn, configure) {
  try {
    const query = configure(db.from(table).select('id,status'));
    const result = await query.order(orderColumn, { ascending:false }).limit(1).maybeSingle();
    return !result.error && Boolean(result.data);
  } catch { return false; }
}

async function loadReadiness({ db = supabaseModule.getSupabase(), env = process.env, cafe24Token, evidence } = {}) {
  let token = cafe24Token;
  if (token === undefined) token = await tokenStore.readToken().catch(() => null);
  if (evidence) return readiness.buildCoreSyncPlan({ env, cafe24Token:token, evidence });
  const [naverCommerceWorkerReady, coupangWorkerReady] = await Promise.all([
    recentEvidence(db, 'coupang_operation_requests', 'created_at', query => query.eq('operation_type','NAVER_COMMERCE_SYNC').in('status',['PENDING','RUNNING','SUCCESS'])),
    recentEvidence(db, 'coupang_sync_requests', 'requested_at', query => query.in('status',['PENDING','RUNNING','SUCCESS']))
  ]);
  return readiness.buildCoreSyncPlan({ env, cafe24Token:token, evidence:{ naverCommerceWorkerReady, coupangWorkerReady } });
}

function minuteKey(now = new Date()) { return now.toISOString().slice(0, 16); }

async function syncConnectedPlatforms({ triggerType = 'SYSTEM', db = supabaseModule.getSupabase(), env = process.env, cafe24Token, evidence, now = new Date(), runOptions = {}, syncFunctions = {} } = {}) {
  const plan = await loadReadiness({ db, env, cafe24Token, evidence });
  const key = minuteKey(now);
  const functions = {
    CAFE24:() => syncCafe24(triggerType,{ db, idempotencyKey:`cafe24-sync:${triggerType}:${key}` }),
    NAVER_ADS:() => syncNaver(triggerType,{ db, idempotencyKey:`naver-ads-sync:${triggerType}:${key}` }),
    NAVER_COMMERCE:() => syncNaverCommerce(triggerType,{ db, now, idempotencyKey:`naver-commerce-all:${triggerType}:${key}` }),
    COUPANG:() => syncCoupang(triggerType,{ db, idempotencyKey:`coupang-sync:${triggerType}:${key}` }),
    ...syncFunctions
  };
  const results = await Promise.allSettled(plan.map(entry => entry.runnable ? functions[entry.name]() : Promise.resolve(readiness.skippedJob(entry))));
  const jobs = results.map((value,index) => settled(plan[index].name,value));
  const attempted = jobs.filter(job => !job.skipped);
  const failed = attempted.filter(job => !job.ok);
  return {
    status:failed.length?'PARTIAL':'SUCCESS', jobs, plan,
    attempted_count:attempted.length, skipped_count:jobs.length-attempted.length,
    channel_updates:readiness.channelUpdates(jobs,now.toISOString()),
    run_options:runOptions
  };
}

async function syncAllPlatforms({ triggerType = 'SYSTEM', db = supabaseModule.getSupabase(), env = process.env, cafe24Token, evidence, now = new Date(), runOptions = {}, syncFunctions } = {}) {
  const outerOptions = { idempotencyKey:`all-platform-sync:${triggerType}:${minuteKey(now)}`, ...runOptions };
  return runJob({ jobName:'ALL_PLATFORM_SYNC', triggerType, maxAttempts:1, db, ...outerOptions, work:async ({ runId }) => {
    const collection = await syncConnectedPlatforms({ triggerType, db, env, cafe24Token, evidence, now, syncFunctions });
    const qa = await runDataQualityChecks({ automationRunId: runId });
    return { ...collection, qa };
  } });
}

module.exports = { syncAllPlatforms, syncConnectedPlatforms, loadReadiness, syncCafe24, syncNaver, syncNaverCommerce, syncCoupang, settled };
