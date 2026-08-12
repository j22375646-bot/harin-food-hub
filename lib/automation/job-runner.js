'use strict';

const { randomUUID } = require('node:crypto');
const supabaseModule = require('../cafe24/supabase.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function errorMessage(error) {
  return String(error?.message || error || '알 수 없는 오류').slice(0, 4000);
}

async function claimRun(db, { jobName, triggerType, idempotencyKey, scheduledFor, kstExecutionDate, staleAfterMs, leaseToken }) {
  const claimed = await db.rpc('claim_automation_run', {
    p_job_name: jobName,
    p_trigger_type: triggerType,
    p_idempotency_key: idempotencyKey || null,
    p_scheduled_for: scheduledFor || null,
    p_kst_execution_date: kstExecutionDate || null,
    p_stale_before: new Date(Date.now() - staleAfterMs).toISOString(),
    p_lease_token: leaseToken
  }).single();
  if (claimed.error) throw claimed.error;
  return claimed.data;
}

async function updateOwnedRun(db, runId, leaseToken, values) {
  const updated = await db.from('automation_runs').update(values)
    .eq('id', runId).eq('lease_token', leaseToken).select('id').maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error('Automation run lease was lost to a recovery worker.');
}

async function runJob({
  jobName, triggerType = 'SYSTEM', maxAttempts = 3, work,
  idempotencyKey = null, scheduledFor = null, kstExecutionDate = null,
  staleAfterMs = 10 * 60 * 1000, db = supabaseModule.getSupabase()
}) {
  const leaseToken = randomUUID();
  const claim = await claimRun(db, {
    jobName, triggerType, idempotencyKey, scheduledFor, kstExecutionDate,
    staleAfterMs, leaseToken
  });
  const runId = claim.run_id;

  if (claim.claim_state === 'REUSED') return {
    runId, attempts: claim.attempt_count, ...(claim.result_json || {}),
    status: claim.run_status, deduplicated: true, idempotencyKey
  };
  if (claim.claim_state === 'RUNNING') return {
    runId, attempts: claim.attempt_count, status: 'RUNNING',
    deduplicated: true, alreadyRunning: true, idempotencyKey
  };

  const firstAttempt = Number(claim.attempt_count || 0) + 1;
  let lastError;
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const attemptNo = firstAttempt + offset;
    await updateOwnedRun(db, runId, leaseToken, {
      attempt_count: attemptNo,
      heartbeat_at: new Date().toISOString()
    });
    const attempt = await db.from('automation_attempts').insert({
      automation_run_id: runId,
      attempt_no: attemptNo,
      status: 'RUNNING'
    }).select('id').single();
    if (attempt.error) throw attempt.error;

    try {
      const result = await work({
        runId,
        attemptNo,
        heartbeat: () => updateOwnedRun(db, runId, leaseToken, { heartbeat_at: new Date().toISOString() })
      });
      const attemptUpdate = await db.from('automation_attempts').update({
        status: 'SUCCESS', finished_at: new Date().toISOString(), result_json: result || {}
      }).eq('id', attempt.data.id);
      if (attemptUpdate.error) throw attemptUpdate.error;
      await updateOwnedRun(db, runId, leaseToken, {
        status: result?.status === 'PARTIAL' ? 'PARTIAL' : 'SUCCESS',
        finished_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        attempt_count: attemptNo,
        result_json: result || {}
      });
      return { runId, attempts: attemptNo, ...result, idempotencyKey };
    } catch (error) {
      lastError = error;
      const attemptUpdate = await db.from('automation_attempts').update({
        status: 'FAILED', finished_at: new Date().toISOString(), error_message: errorMessage(error)
      }).eq('id', attempt.data.id);
      if (attemptUpdate.error) throw attemptUpdate.error;
      if (offset + 1 < maxAttempts) await wait(500 * (2 ** offset));
    }
  }

  const lastAttempt = firstAttempt + maxAttempts - 1;
  await updateOwnedRun(db, runId, leaseToken, {
    status: 'FAILED',
    finished_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    attempt_count: lastAttempt,
    error_message: errorMessage(lastError)
  });
  throw Object.assign(lastError || new Error('자동화 실행 실패'), { automationRunId: runId });
}

module.exports = { runJob, claimRun, updateOwnedRun, errorMessage };
