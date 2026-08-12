'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const schedule = require('../lib/automation/kst-schedule.js');
const runner = require('../lib/automation/job-runner.js');

function query(result, calls, table) {
  const chain = {
    update(value) { calls.push([table, 'update', value]); return chain; },
    insert(value) { calls.push([table, 'insert', value]); return chain; },
    eq(...args) { calls.push([table, 'eq', ...args]); return chain; },
    select(...args) { calls.push([table, 'select', ...args]); return chain; },
    single: async () => result,
    maybeSingle: async () => result,
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return chain;
}

test('cronExecution creates a KST date key and the nominal UTC schedule', () => {
  const slot = schedule.cronExecution('CAFE24_SYNC', {
    now: new Date('2026-08-12T20:30:00.000Z'), hour: 5, minute: 30
  });
  assert.deepEqual(slot, {
    idempotencyKey: 'CAFE24_SYNC:KST:2026-08-13',
    kstExecutionDate: '2026-08-13',
    scheduledFor: '2026-08-12T20:30:00.000Z'
  });
});

test('runJob returns a completed idempotent run without executing work again', async () => {
  let worked = false;
  const db = {
    rpc: () => ({ single: async () => ({ data: {
      run_id: 'run-1', claim_state: 'REUSED', run_status: 'SUCCESS',
      attempt_count: 1, result_json: { rows: 12 }
    }, error: null }) })
  };
  const result = await runner.runJob({
    db, jobName: 'CAFE24_SYNC', triggerType: 'CRON',
    idempotencyKey: 'CAFE24_SYNC:KST:2026-08-13',
    work: async () => { worked = true; }
  });
  assert.equal(worked, false);
  assert.equal(result.deduplicated, true);
  assert.equal(result.rows, 12);
  assert.equal(result.runId, 'run-1');
});

test('a recovered run continues with the next attempt number', async () => {
  const calls = [];
  const db = {
    rpc: () => ({ single: async () => ({ data: {
      run_id: 'run-2', claim_state: 'CLAIMED', run_status: 'RUNNING',
      attempt_count: 3, result_json: {}
    }, error: null }) }),
    from(table) {
      if (table === 'automation_runs') return query({ data: { id: 'run-2' }, error: null }, calls, table);
      const inserts = calls.filter(([name, action]) => name === 'automation_attempts' && action === 'insert').length;
      return query(inserts === 0 ? { data: { id: 'attempt-4' }, error: null } : { data: null, error: null }, calls, table);
    }
  };
  const result = await runner.runJob({
    db, jobName: 'NAVER_SYNC', triggerType: 'CRON', maxAttempts: 1,
    idempotencyKey: 'NAVER_SYNC:KST:2026-08-13', work: async () => ({ rows: 7 })
  });
  const attemptInsert = calls.find(([table, action]) => table === 'automation_attempts' && action === 'insert');
  assert.equal(attemptInsert[2].attempt_no, 4);
  assert.equal(result.attempts, 4);
  assert.equal(result.rows, 7);
});

test('automation schema keeps idempotent claims server-only', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260813090000_add_automation_idempotency.sql'), 'utf8');
  assert.match(sql, /unique index if not exists automation_runs_job_idempotency_idx/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke all on function public\.claim_automation_run[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.claim_automation_run[\s\S]*to service_role/i);
});
