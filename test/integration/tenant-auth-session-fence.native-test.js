'use strict';
// Explicit opt-in, disposable loopback PostgreSQL only; excluded from default glob.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const url = new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL || 'invalid:');
if (!['postgres:','postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
  || url.port !== '55437' || url.username !== 'moaon_test_admin' || !url.password
  || url.pathname !== '/postgres' || url.search || url.hash) {
  throw Error('An explicit isolated loopback test cluster URL is required.');
}
const name = `moaon_test_auth_${process.pid}_${randomBytes(4).toString('hex')}`;
const config = {ssl:false,max:4,connectionTimeoutMillis:2000,statement_timeout:5000};
const supervisor = new Pool({...config,connectionString:url.toString()});
let pool;
let created = false;
const roles=[];
const u='20000000-0000-4000-8000-000000000001';
const t='30000000-0000-4000-8000-000000000001';
const s='40000000-0000-4000-8000-000000000001';
const o='50000000-0000-4000-8000-000000000001';
const issue=`select public.moaon_issue_session('${u}','${t}','${s}',repeat('a',64),clock_timestamp()+interval '1 hour')`;
const reset=`select public.moaon_begin_password_change('${u}','${o}')`;

test.before(async () => {
  await supervisor.query(`create database "${name}"`); created=true;
  url.pathname=`/${name}`;
  pool=new Pool({...config,connectionString:url.toString()});
  for (const role of ['anon','authenticated','service_role']) {
    const found=await supervisor.query('select 1 from pg_roles where rolname=$1',[role]);
    if (!found.rowCount) {
      await supervisor.query(`create role ${role}${role==='service_role'?' bypassrls':''}`);
      roles.push(role);
    }
  }
  await pool.query('create schema auth; create table auth.users(id uuid primary key)');
  for (const file of ['supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql','lib/tenancy/sql/auth-session-fence.sql']) {
    await pool.query(await fs.readFile(path.join(__dirname,'../..',file),'utf8'));
  }
});
test.after(async () => {
  const errors=[];
  try { if (pool) await pool.end(); } catch(e) {errors.push(e);}
  let dropped=!created;
  if(created) {
    try {await supervisor.query(`drop database "${name}"`); dropped=true;} catch(e){errors.push(e);}
  }
  if(dropped) for(const role of roles.reverse()) {
    try {await supervisor.query(`drop role ${role}`);} catch(e){errors.push(e);}
  }
  try {await supervisor.end();} catch(e){errors.push(e);}
  if(errors.length) throw new AggregateError(errors,'Disposable test resources could not be cleaned up.');
});
test.beforeEach(async () => {
  await pool.query(`truncate auth.users cascade; insert into auth.users values('${u}');
    insert into dashboard_users(user_id,email,username,display_name,role)
    values('${u}','synthetic@example.test','synthetic','Synthetic','OWNER');
    select public.moaon_begin_login('${u}','${t}');`);
});

async function waitForLock(pid) {
  const until=Date.now()+2000;
  while(Date.now()<until) {
    const result=await pool.query('select wait_event_type from pg_stat_activity where pid=$1',[pid]);
    if(result.rows[0]?.wait_event_type==='Lock') return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('Second connection was not observed waiting for the account lock.');
}

for (const resetFirst of [true,false]) {
  test(resetFirst?'reset lock rejects an overlapping late login':'reset waits for in-flight issuance then revokes its new session', async context => {
    let a,b,pending;
    try {
      a=await pool.connect(); b=await pool.connect();
      const pa=(await a.query('select pg_backend_pid() as pid')).rows[0].pid;
      const pb=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
      assert.notEqual(pa,pb);
      await a.query('begin');
      await a.query(resetFirst?reset:issue);
      pending=b.query(resetFirst?issue:reset).then(result=>({result}),error=>({error}));
      await waitForLock(pb);
      context.diagnostic(`Observed lock wait: first PID ${pa}, waiting PID ${pb}`);
      await a.query('commit');
      const outcome=await pending;
      if(resetFirst) assert.equal(outcome.error?.message,'AUTH_TRANSITION_REJECTED');
      else assert.equal(outcome.error,undefined);
      assert.equal((await pool.query('select count(*)::int as n from dashboard_sessions where revoked_at is null')).rows[0].n,0);
    } finally {
      if(a) {await a.query('rollback');a.release();}
      if(pending) await pending;
      if(b) b.release();
    }
  });
}
