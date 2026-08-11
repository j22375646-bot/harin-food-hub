'use strict';

const supabaseModule = require('../cafe24/supabase.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function errorMessage(error) {
  return String(error?.message || error || '알 수 없는 오류').slice(0, 4000);
}

async function runJob({ jobName, triggerType = 'SYSTEM', maxAttempts = 3, work }) {
  const db = supabaseModule.getSupabase();
  const created = await db.from('automation_runs').insert({
    job_name: jobName,
    trigger_type: triggerType,
    status: 'RUNNING'
  }).select('id').single();
  if (created.error) throw created.error;

  const runId = created.data.id;
  let lastError;
  for (let attemptNo = 1; attemptNo <= maxAttempts; attemptNo += 1) {
    const attempt = await db.from('automation_attempts').insert({
      automation_run_id: runId,
      attempt_no: attemptNo,
      status: 'RUNNING'
    }).select('id').single();
    if (attempt.error) throw attempt.error;

    try {
      const result = await work({ runId, attemptNo });
      await db.from('automation_attempts').update({
        status: 'SUCCESS', finished_at: new Date().toISOString(), result_json: result || {}
      }).eq('id', attempt.data.id);
      await db.from('automation_runs').update({
        status: result?.status === 'PARTIAL' ? 'PARTIAL' : 'SUCCESS',
        finished_at: new Date().toISOString(), attempt_count: attemptNo, result_json: result || {}
      }).eq('id', runId);
      return { runId, attempts: attemptNo, ...result };
    } catch (error) {
      lastError = error;
      await db.from('automation_attempts').update({
        status: 'FAILED', finished_at: new Date().toISOString(), error_message: errorMessage(error)
      }).eq('id', attempt.data.id);
      if (attemptNo < maxAttempts) await wait(500 * (2 ** (attemptNo - 1)));
    }
  }

  await db.from('automation_runs').update({
    status: 'FAILED', finished_at: new Date().toISOString(), attempt_count: maxAttempts,
    error_message: errorMessage(lastError)
  }).eq('id', runId);
  throw Object.assign(lastError || new Error('자동화 실행 실패'), { automationRunId: runId });
}

module.exports = { runJob, errorMessage };
