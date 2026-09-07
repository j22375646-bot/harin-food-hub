'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {USER, OPERATOR, OTHER, OPERATION, RESOLUTION, CANDIDATE, root, install, seed, inspect, resolve, preservedState} = require('./helpers/recovery-resolution-fixture');
let db;
test.before(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key, encrypted_password text default \'synthetic-password-hash\')');
  await install(db);
});

test('all authoritative decisions fail closed, and REVIEW_REQUIRED can close from evidence alone', async () => {
  await db.query(`delete from moaon_auth.account_state where user_id=$1`, [USER]);
  assert.equal((await inspect(db)).decision, 'CHECK_REQUIRED');
  await assert.rejects(resolve(db, {expectedVersion: (await inspect(db)).version}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  await db.query('insert into moaon_auth.account_state(user_id) values($1)', [USER]);
  await db.query('update public.dashboard_users set active=false where user_id=$1', [USER]);
  assert.equal((await inspect(db)).decision, 'CHECK_REQUIRED');
  await db.query('update public.dashboard_users set active=true where user_id=$1', [USER]);
  await db.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]);
  assert.equal((await inspect(db)).decision, 'KEEP_BLOCKED');
  await db.query('update moaon_auth.account_state set blocked=false,operation_id=null where user_id=$1', [USER]);
  const pending = await inspect(db);
  assert.equal(pending.decision, 'KEEP_BLOCKED');
  await assert.rejects(resolve(db, {expectedVersion: pending.version}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  await db.query(`update moaon_auth.password_changes set status='COMPLETED',completed_at=clock_timestamp() where user_id=$1`, [USER]);
  await db.query(`select public.moaon_require_recovery_review($1,$2,'FENCE_COMPLETE')`, [USER, OPERATION]);
  const completed = await inspect(db);
  assert.equal(completed.decision, 'CONFIRM_COMPLETED');
  assert.equal(completed.status, 'REVIEW_REQUIRED');
  const before = await preservedState(db);
  assert.equal((await resolve(db, {expectedVersion: completed.version, action: 'CONFIRM_COMPLETED'})).status, 'COMPLETED');
  assert.equal((await inspect(db)).decision, 'ALREADY_CLOSED');
  assert.deepEqual(await preservedState(db), before);
});

test('REVIEW_REQUIRED with no begun change closes as REJECTED and preserves its stage', async () => {
  await db.query(`select public.moaon_require_recovery_review($1,$2,'FENCE_BEGIN')`, [USER, OPERATION]);
  const review = await inspect(db);
  assert.equal(review.decision, 'CLOSE_NOT_STARTED');
  await resolve(db, {expectedVersion: review.version});
  assert.deepEqual((await db.query('select status,stage from moaon_auth.recovery_reviews')).rows,
    [{status: 'REJECTED', stage: 'FENCE_BEGIN'}]);
});

test('terminal status wins over inactive evidence; blocked state wins over a completed change', async () => {
  await db.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]);
  await db.query(`update moaon_auth.password_changes set status='COMPLETED',completed_at=clock_timestamp() where user_id=$1`, [USER]);
  const blocked = await inspect(db);
  assert.equal(blocked.decision, 'KEEP_BLOCKED');
  await assert.rejects(resolve(db, {expectedVersion: blocked.version, action: 'CONFIRM_COMPLETED'}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  await db.query('update moaon_auth.account_state set blocked=false,operation_id=null where user_id=$1', [USER]);
  const ready = await inspect(db);
  assert.equal(ready.status, 'PENDING');
  await resolve(db, {expectedVersion: ready.version, action: 'CONFIRM_COMPLETED'});
  await db.query('update public.dashboard_users set active=false where user_id=$1', [USER]);
  assert.equal((await inspect(db)).decision, 'ALREADY_CLOSED');
});

test('missing target profile fails closed even with orphaned journal and account evidence', async () => {
  // Synthetic damaged-database case: ordinary FK-enforced deletes remove the journal.
  await db.query("set session_replication_role='replica'");
  try {await db.query('delete from public.dashboard_users where user_id=$1', [USER]);}
  finally {await db.query("set session_replication_role='origin'");}
  const review = await inspect(db);
  assert.equal(review.decision, 'CHECK_REQUIRED');
  await assert.rejects(resolve(db, {expectedVersion: review.version}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
});

test('version binds matching password-change existence, status and microsecond timestamps', async () => {
  const initial = await inspect(db);
  await db.query(`insert into moaon_auth.password_changes(user_id,id,status,started_at)
    values($1,$2,'PENDING','2026-09-08T01:02:03.123456Z')`, [USER, OPERATION]);
  assert.notEqual((await inspect(db)).version, initial.version);
  for (const sql of [
    `update moaon_auth.password_changes set started_at=started_at+interval '1 microsecond'`,
    `update moaon_auth.password_changes set status='COMPLETED',completed_at='2026-09-08T01:02:04.123456Z'`,
    `update moaon_auth.password_changes set completed_at=completed_at+interval '1 microsecond'`,
  ]) {
    const prior = await inspect(db);
    await db.query(sql);
    assert.notEqual((await inspect(db)).version, prior.version);
    await assert.rejects(resolve(db, {expectedVersion: prior.version, action: 'CONFIRM_COMPLETED'}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  }
  const ready = await inspect(db);
  await db.query("set timezone='America/New_York'");
  try {assert.equal((await inspect(db)).version, ready.version);} finally {await db.query("set timezone='UTC'");}
});

test('unauthorized, ordinary OWNER and inactive operators cannot inspect, resolve or replay', async () => {
  const version = (await inspect(db)).version;
  for (const operatorId of [USER, OTHER, null, '20000000-0000-4000-8000-000000000099']) {
    await assert.rejects(inspect(db, {operatorId}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
    await assert.rejects(resolve(db, {operatorId, expectedVersion: version}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  }
  await resolve(db, {expectedVersion: version});
  await db.query('update public.dashboard_users set active=false where user_id=$1', [OPERATOR]);
  await assert.rejects(inspect(db), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  await assert.rejects(resolve(db, {expectedVersion: version}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  await db.query('update public.dashboard_users set active=true where user_id=$1', [OPERATOR]);
  await db.query('delete from moaon_auth.recovery_operators');
  await assert.rejects(resolve(db, {expectedVersion: version}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
});

test('private snapshot inspection also requires fresh authorized operator identity', async () => {
  await db.query('set role service_role');
  try {
    await assert.rejects(db.query('select moaon_auth.locked_recovery_review_snapshot($1,$2,$3)',
      [USER, USER, OPERATION]), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  } finally {await db.query('reset role');}
});

test('exact resolution replay is stable; conflicts in every identity or action fail without extra audit', async () => {
  const expectedVersion = (await inspect(db)).version;
  const first = await resolve(db, {expectedVersion});
  const audit = (await db.query('select to_jsonb(r) as data from moaon_auth.recovery_resolutions r')).rows;
  assert.deepEqual(await resolve(db, {expectedVersion}), first);
  await db.query('insert into moaon_auth.recovery_operators values($1)', [OTHER]);
  for (const changes of [
    {operatorId: OTHER}, {userId: OTHER}, {operationId: '50000000-0000-4000-8000-000000000002'},
    {action: 'CONFIRM_COMPLETED'}, {expectedVersion: '0'.repeat(64)},
    {resolutionId: '60000000-0000-4000-8000-000000000002'},
  ]) await assert.rejects(resolve(db, {expectedVersion, ...changes}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  assert.deepEqual((await db.query('select to_jsonb(r) as data from moaon_auth.recovery_resolutions r')).rows, audit);
});

test('target mismatch, absent operations and invalid request fields cannot mutate journal or audit', async () => {
  const expectedVersion = (await inspect(db)).version;
  for (const changes of [{userId: OTHER}, {userId: null}, {operationId: null},
    {operationId: '50000000-0000-4000-8000-000000000099'}]) {
    await assert.rejects(inspect(db, changes), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
    await assert.rejects(resolve(db, {expectedVersion, ...changes}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  }
  for (const changes of [{resolutionId: null}, {expectedVersion: null}, {expectedVersion: 'A'.repeat(64)},
    {expectedVersion: '1'.repeat(63)}, {action: null}, {action: 'FORCE_UNLOCK'}, {action: 'CONFIRM_COMPLETED'}]) {
    await assert.rejects(resolve(db, {expectedVersion, ...changes}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  }
  assert.equal((await inspect(db)).version, expectedVersion);
  assert.equal((await db.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 0);
});

test('snapshot is timezone independent, microsecond precise and changes with every authoritative evidence class', async () => {
  await db.query(`update moaon_auth.recovery_reviews set created_at='2026-09-08T01:02:03.123456Z', updated_at='2026-09-08T01:02:03.123456Z'`);
  const initial = await inspect(db);
  await db.query(`set timezone='Pacific/Honolulu'`);
  assert.equal((await inspect(db)).version, initial.version);
  await db.query(`set timezone='Asia/Seoul'`);
  assert.equal((await inspect(db)).version, initial.version);
  await db.query(`set timezone='UTC'`);
  for (const sql of [
    `update moaon_auth.recovery_reviews set created_at=created_at+interval '1 microsecond'`,
    `update moaon_auth.recovery_reviews set updated_at=updated_at+interval '1 microsecond'`,
    `update moaon_auth.recovery_reviews set status='REVIEW_REQUIRED',stage='FENCE_BEGIN'`,
    `update moaon_auth.recovery_reviews set stage='PASSWORD_UPDATE'`,
    `update moaon_auth.account_state set generation=generation+1 where user_id='${USER}'`,
    `update moaon_auth.account_state set blocked=true,operation_id='${OPERATION}' where user_id='${USER}'`,
    `update moaon_auth.account_state set operation_id='50000000-0000-4000-8000-000000000099' where user_id='${USER}'`,
    `update public.dashboard_users set active=false where user_id='${USER}'`,
  ]) {
    const prior = await inspect(db);
    await db.query(sql);
    assert.notEqual((await inspect(db)).version, prior.version);
    await assert.rejects(resolve(db, {expectedVersion: prior.version}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  }
});

test('audit insert failure rolls back journal closure atomically', async () => {
  const before = await inspect(db);
  await db.exec(`create function public.fail_synthetic_resolution_audit() returns trigger language plpgsql as $$
    begin raise exception 'SYNTHETIC_AUDIT_FAILURE'; end $$;
    create trigger fail_synthetic_resolution_audit before insert on moaon_auth.recovery_resolutions
    for each row execute function public.fail_synthetic_resolution_audit();`);
  try {
    await assert.rejects(resolve(db, {expectedVersion: before.version}), /SYNTHETIC_AUDIT_FAILURE/);
    assert.deepEqual(await inspect(db), before);
    assert.equal((await db.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 0);
  } finally {await db.exec('drop trigger fail_synthetic_resolution_audit on moaon_auth.recovery_resolutions; drop function public.fail_synthetic_resolution_audit()');}
});

test('repeat installation retains data and grants only restricted invoker access without operator seeding', async () => {
  const version = (await inspect(db)).version;
  await resolve(db, {expectedVersion: version});
  await db.query('delete from moaon_auth.recovery_operators');
  const audit = (await db.query('select to_jsonb(r) as data from moaon_auth.recovery_resolutions r')).rows;
  await db.exec(await fs.readFile(path.join(root, CANDIDATE), 'utf8'));
  assert.deepEqual((await db.query('select to_jsonb(r) as data from moaon_auth.recovery_resolutions r')).rows, audit);
  assert.equal((await db.query('select count(*)::int as n from moaon_auth.recovery_operators')).rows[0].n, 0);
  for (const table of ['recovery_operators','recovery_resolutions']) {
    assert.equal((await db.query(`select relrowsecurity as enabled from pg_class where oid=$1::regclass`, [`moaon_auth.${table}`])).rows[0].enabled, true);
    for (const privilege of ['UPDATE','DELETE','TRUNCATE']) {
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['service_role',`moaon_auth.${table}`,privilege])).rows[0].allowed, false);
    }
  }
  assert.equal((await db.query(`select has_table_privilege('service_role','moaon_auth.recovery_operators','INSERT') as allowed`)).rows[0].allowed, false);
  const signatures = ['public.moaon_inspect_recovery_review(uuid,uuid,uuid)', 'public.moaon_resolve_recovery_review(uuid,uuid,uuid,uuid,text,text)'];
  for (const signature of signatures) {
    const info = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0];
    assert.equal(info.prosecdef, false);
    assert.deepEqual(info.proconfig, ['search_path=""']);
    for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', [role,signature,'EXECUTE'])).rows[0].allowed, false);
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['service_role',signature,'EXECUTE'])).rows[0].allowed, true);
  }
  for (const role of ['anon','authenticated']) {
    await db.query(`set role ${role}`);
    try {await assert.rejects(inspect(db), /permission denied/);} finally {await db.query('reset role');}
  }
  await db.query('delete from public.dashboard_users where user_id=$1', [USER]);
  assert.deepEqual((await db.query('select to_jsonb(r) as data from moaon_auth.recovery_resolutions r')).rows, audit);
});
test.after(async () => {if (db) await db.close();});
test.beforeEach(async () => {await db.exec('truncate auth.users cascade; truncate moaon_auth.recovery_resolutions'); await seed(db);});

test('operator can close an unstarted pending journal without changing any authentication state', async () => {
  await db.query(`insert into public.dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at)
    values('40000000-0000-4000-8000-000000000001',$1,repeat('a',64),'owner','Synthetic owner','OWNER',clock_timestamp()+interval '1 hour')`, [USER]);
  await db.query(`insert into moaon_auth.login_tickets(id,user_id,generation,expires_at)
    values('30000000-0000-4000-8000-000000000001',$1,0,clock_timestamp()+interval '5 minutes')`, [USER]);
  const before = await preservedState(db);
  await db.query('set role service_role');
  try {
    const review = await inspect(db);
    assert.deepEqual(Object.keys(review).sort(), ['decision','operationId','stage','status','userId','version']);
    assert.equal(review.decision, 'CLOSE_NOT_STARTED');
    assert.match(review.version, /^[0-9a-f]{64}$/);
    assert.deepEqual(await resolve(db, {expectedVersion: review.version}),
      {userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED'});
    assert.equal((await inspect(db)).decision, 'ALREADY_CLOSED');
  } finally {await db.query('reset role');}
  assert.deepEqual(await preservedState(db), before);
  assert.equal((await db.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 1);
});
