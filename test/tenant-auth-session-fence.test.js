'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const user = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const ticket = '30000000-0000-4000-8000-000000000001';
const session = '40000000-0000-4000-8000-000000000001';
const operation = '50000000-0000-4000-8000-000000000001';
const second = '50000000-0000-4000-8000-000000000002';
let db;

test.before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);`);
  await db.exec(await fs.readFile(path.join(__dirname, '../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql'), 'utf8'));
  await db.exec(await fs.readFile(path.join(__dirname, '../lib/tenancy/sql/auth-session-fence.sql'), 'utf8'));
});
test.after(async () => { if (db) await db.close(); });
test.beforeEach(async () => {
  await db.exec('drop trigger if exists force_change_failure on moaon_auth.password_changes; drop function if exists moaon_auth.force_change_failure();');
  await db.exec(`reset role; truncate auth.users cascade;
    insert into auth.users values ('${user}'), ('${other}');
    insert into public.dashboard_users(user_id,email,username,display_name,role)
    values ('${user}','one@example.test','one','One','OWNER'),
           ('${other}','two@example.test','two','Two','VIEWER');`);
});

async function begin(who = user, id = ticket) {
  return db.query('select public.moaon_begin_login($1,$2)', [who, id]);
}
async function issue(id = ticket, who = user) {
  return db.query(`select public.moaon_issue_session($1,$2,$3,$4,clock_timestamp()+interval '12 hours')`,
    [who, id, session, 'a'.repeat(64)]);
}
async function windowFor(who = user, id = ticket) {
  return db.query('select public.moaon_get_session_window($1,$2) as data', [who,id]);
}
async function reset(who = user, id = operation) {
  return db.query('select public.moaon_begin_password_change($1,$2)', [who,id]);
}
async function complete(who = user, id = operation) {
  return db.query('select public.moaon_complete_password_change($1,$2)', [who,id]);
}
async function rejected(run) {
  await assert.rejects(run, error => error.message.includes('AUTH_TRANSITION_REJECTED'));
}

test('one-use ticket issues a session using current server profile', async () => {
  await begin();
  await db.query("update dashboard_users set role='VIEWER' where user_id=$1", [user]);
  await issue();
  const { rows } = await db.query('select user_id,role,revoked_at from dashboard_sessions');
  assert.deepEqual(rows, [{user_id:user, role:'VIEWER', revoked_at:null}]);
  await rejected(() => issue());
});

test('valid ticket receives one canonical DB-derived twelve-hour window without mutation', async () => {
  await begin();
  const before=(await db.query("select date_trunc('milliseconds',clock_timestamp()) as now")).rows[0].now.getTime();
  const result=await windowFor();
  const after=(await db.query("select date_trunc('milliseconds',clock_timestamp()) as now")).rows[0].now.getTime();
  assert.match(result.rows[0].data.issuedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Date.parse(result.rows[0].data.expiresAt)-Date.parse(result.rows[0].data.issuedAt),12*60*60*1000);
  assert.ok(Date.parse(result.rows[0].data.issuedAt)>=before);
  assert.ok(Date.parse(result.rows[0].data.issuedAt)<=after);
  assert.deepEqual((await db.query('select consumed from moaon_auth.login_tickets')).rows,[{consumed:false}]);
  assert.equal((await db.query('select count(*)::int as count from dashboard_sessions')).rows[0].count,0);
});

test('profile eligibility delay cannot return a window for a ticket expired before the response', async () => {
  await begin();
  await db.exec(`
    create role moaon_clock_test;
    create function public.moaon_test_profile_delay() returns boolean language plpgsql volatile as $$
    begin perform pg_sleep(1.5); return true; end $$;
    create policy moaon_test_state_read on moaon_auth.account_state for all to moaon_clock_test using (true) with check (true);
    create policy moaon_test_ticket_read on moaon_auth.login_tickets for all to moaon_clock_test using (true) with check (true);
    create policy moaon_test_profile_delay on public.dashboard_users for all to moaon_clock_test
      using (public.moaon_test_profile_delay()) with check (true);
    grant usage on schema moaon_auth to moaon_clock_test;
    grant select,update on moaon_auth.account_state,moaon_auth.login_tickets,public.dashboard_users to moaon_clock_test;
    grant execute on function public.moaon_get_session_window(uuid,uuid),public.moaon_test_profile_delay() to moaon_clock_test;
  `);
  await db.exec('set role moaon_clock_test');
  try {
    assert.equal((await db.query('select count(*)::int as count from moaon_auth.account_state')).rows[0].count,1);
    assert.equal((await db.query('select count(*)::int as count from moaon_auth.login_tickets')).rows[0].count,1);
    const delayStarted=Date.now();
    assert.equal((await db.query('select count(*)::int as count from public.dashboard_users')).rows[0].count,2);
    assert.ok(Date.now()-delayStarted>=2500);
    await db.exec('reset role');
    await db.query("update moaon_auth.login_tickets set expires_at=clock_timestamp()+interval '500 milliseconds'");
    await db.exec('set role moaon_clock_test');
    await rejected(()=>windowFor());
  } finally {
    await db.exec(`reset role;
      drop policy moaon_test_state_read on moaon_auth.account_state;
      drop policy moaon_test_ticket_read on moaon_auth.login_tickets;
      drop policy moaon_test_profile_delay on public.dashboard_users;
      drop function public.moaon_test_profile_delay();
      drop owned by moaon_clock_test;
      drop role moaon_clock_test;`);
  }
});

test('session window rejects wrong, expired, consumed, old-generation, blocked, and inactive eligibility', async () => {
  await rejected(()=>db.query('select public.moaon_get_session_window($1,$2)',[null,ticket]));
  await rejected(()=>db.query('select public.moaon_get_session_window($1,$2)',[user,null]));
  await rejected(()=>windowFor());
  await begin(); await rejected(()=>windowFor(other));
  await db.query("update moaon_auth.login_tickets set expires_at=clock_timestamp()-interval '1 second'");
  await rejected(()=>windowFor());

  await db.exec('truncate moaon_auth.login_tickets;'); await begin(); await issue(); await rejected(()=>windowFor());
  await begin(user,second); await db.query('update moaon_auth.account_state set generation=generation+1 where user_id=$1',[user]);
  await rejected(()=>windowFor(user,second));

  await db.exec('truncate moaon_auth.login_tickets;'); await db.query('update moaon_auth.account_state set generation=0,blocked=false,operation_id=null where user_id=$1',[user]);
  await begin(); await db.query('update moaon_auth.account_state set blocked=true,operation_id=$1 where user_id=$2',[operation,user]);
  await rejected(()=>windowFor());
  await db.query('update moaon_auth.account_state set blocked=false,operation_id=null where user_id=$1',[user]);
  await db.query('update dashboard_users set active=false where user_id=$1',[user]);
  await rejected(()=>windowFor());
});

test('session expiry beyond the DB twelve-hour ceiling remains rejected', async () => {
  await begin();
  await rejected(()=>db.query(`select public.moaon_issue_session($1,$2,$3,$4,clock_timestamp()+interval '12 hours 1 second')`,
    [user,ticket,session,'a'.repeat(64)]));
});

test('password change revokes existing sessions but not another account', async () => {
  await begin(); await issue();
  await db.query(`insert into dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at)
    values ($1,$2,$3,'two','Two','VIEWER',clock_timestamp()+interval '1 hour')`, [second,other,'b'.repeat(64)]);
  await reset();
  const { rows } = await db.query('select user_id,revoked_at is not null as revoked from dashboard_sessions order by user_id');
  assert.deepEqual(rows, [{user_id:user,revoked:true},{user_id:other,revoked:false}]);
});

test('late old-password login stays rejected after reset completion', async () => {
  await begin(); await reset(); await complete();
  await rejected(() => issue());
  assert.equal((await db.query('select count(*)::int as n from dashboard_sessions')).rows[0].n, 0);
  await begin(user, second); await issue(second);
});

test('pending or uncertain provider write keeps login locked', async () => {
  await begin(); await reset();
  await rejected(() => begin(user, second));
  await rejected(() => issue());
  await rejected(() => complete(user,second));
  assert.equal((await db.query('select blocked from moaon_auth.account_state')).rows[0].blocked, true);
});

test('same pending reset is idempotent and competing reset is rejected', async () => {
  await reset(); await reset();
  assert.equal((await db.query('select generation from moaon_auth.account_state')).rows[0].generation, 1);
  await rejected(() => reset(user, second));
  await complete(); await complete();
  await rejected(() => reset());
});

test('an old completed operation cannot unlock a later reset', async () => {
  await reset(); await complete(); await reset(user, second);
  await rejected(() => complete());
  await rejected(() => begin());
  await complete(user, second); await begin();
});

test('ticket bound to another user is rejected without consuming it', async () => {
  await begin(); await rejected(() => issue(ticket, other)); await issue();
});

test('expired login ticket is rejected', async () => {
  await begin();
  await db.query("update moaon_auth.login_tickets set expires_at=clock_timestamp()-interval '1 second'");
  await rejected(() => issue());
});

test('inactive account cannot begin, issue, or complete password change', async () => {
  await begin();
  await db.query('update dashboard_users set active=false where user_id=$1', [user]);
  await rejected(() => issue()); await rejected(() => begin(user,second)); await rejected(() => reset());
  await db.query('update dashboard_users set active=true where user_id=$1', [user]);
  await reset();
  await db.query('update dashboard_users set active=false where user_id=$1', [user]);
  await rejected(() => complete());
});

test('failed session insertion rolls back ticket consumption', async () => {
  await begin();
  await db.query(`insert into dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at)
    values ($1,$2,$3,'one','One','OWNER',clock_timestamp()+interval '1 hour')`, [session,user,'b'.repeat(64)]);
  await assert.rejects(() => issue(), /duplicate key/);
  await db.query('delete from dashboard_sessions where id=$1', [session]);
  await issue();
});

test('password-change record failure rolls back revocation and generation together', async () => {
  await begin(); await issue();
  await db.exec(`create function moaon_auth.force_change_failure() returns trigger language plpgsql as $$
    begin raise exception 'synthetic failure'; end $$;
    create trigger force_change_failure before insert on moaon_auth.password_changes
    for each row execute function moaon_auth.force_change_failure();`);
  await assert.rejects(() => reset(), /synthetic failure/);
  assert.deepEqual((await db.query('select generation,blocked from moaon_auth.account_state')).rows,[{generation:0,blocked:false}]);
  assert.equal((await db.query('select revoked_at from dashboard_sessions')).rows[0].revoked_at,null);
});

test('unknown account and malformed token hash cannot create sessions', async () => {
  await rejected(() => begin(second));
  await begin();
  for (const hash of ['', 'raw-cookie', 'A'.repeat(64), null]) {
    await rejected(() => db.query(`select public.moaon_issue_session($1,$2,$3,$4,clock_timestamp()+interval '1 hour')`, [user,ticket,session,hash]));
  }
});

for (const role of ['anon','authenticated']) {
  test(`${role} cannot call functions or read account state`, async () => {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(() => begin(), /permission denied/);
      await assert.rejects(() => windowFor(), /permission denied/);
      await assert.rejects(() => reset(), /permission denied/);
      await assert.rejects(() => complete(), /permission denied/);
      await assert.rejects(() => issue(), /permission denied/);
      await assert.rejects(() => db.query('select * from moaon_auth.account_state'), /permission denied/);
    } finally { await db.exec('reset role'); }
  });
}

test('service_role can execute the complete isolated flow', async () => {
  await db.exec('set role service_role');
  try { await begin(); await windowFor(); await issue(); await reset(); await complete(); }
  finally { await db.exec('reset role'); }
});
