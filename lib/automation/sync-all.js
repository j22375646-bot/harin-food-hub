'use strict';

const configModule = require('../cafe24/config.js');
const cafe24SyncModule = require('../cafe24/sync.js');
const naverSyncModule = require('../naver/sync.js');
const coupangSyncModule = require('../coupang/sync.js');
const supabaseModule = require('../cafe24/supabase.js');
const { runJob } = require('./job-runner.js');
const { runDataQualityChecks } = require('../qa/validator.js');

async function syncCafe24(triggerType) {
  return runJob({ jobName: 'CAFE24_SYNC', triggerType, work: () => cafe24SyncModule.syncAll(configModule.getConfig()) });
}

async function syncNaver(triggerType) {
  return runJob({ jobName: 'NAVER_SYNC', triggerType, work: async () => {
    const counts = await naverSyncModule.syncAll();
    const keywords = await naverSyncModule.syncKeywordStats(supabaseModule.getSupabase(), 7);
    return { counts, keywords };
  } });
}

async function syncCoupang(triggerType) {
  return runJob({ jobName: 'COUPANG_SYNC', triggerType, work: () => coupangSyncModule.syncAll() });
}

function settled(name, value) {
  return value.status === 'fulfilled' ? { name, ok: true, data: value.value } : { name, ok: false, error: value.reason?.message || '동기화 실패', run_id: value.reason?.automationRunId || null };
}

async function syncAllPlatforms({ triggerType = 'SYSTEM' } = {}) {
  return runJob({ jobName: 'ALL_PLATFORM_SYNC', triggerType, maxAttempts: 1, work: async ({ runId }) => {
    const [cafe24, naver, coupang] = await Promise.allSettled([syncCafe24(triggerType), syncNaver(triggerType), syncCoupang(triggerType)]);
    const jobs = [settled('CAFE24', cafe24), settled('NAVER', naver), settled('COUPANG', coupang)];
    const qa = await runDataQualityChecks({ automationRunId: runId });
    const failed = jobs.filter(job => !job.ok);
    return { status: failed.length ? 'PARTIAL' : 'SUCCESS', jobs, qa };
  } });
}

module.exports = { syncAllPlatforms, syncCafe24, syncNaver, syncCoupang };
