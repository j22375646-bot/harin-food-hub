'use strict';
// Explicit opt-in, disposable loopback cluster only. Never a production URL.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {Pool}=require('pg');
const {createCredentialStore}=require('../../lib/tenancy/credential-store.js');
const {createCredentialCipher}=require('../../lib/tenancy/credential-envelope.js');
const {createCredentialSessionFence}=require('../../lib/tenancy/credential-session-fence.js');
const url=new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL||'invalid:');
if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='55437'
 ||url.username!=='moaon_test_admin'||!url.password||url.pathname!=='/postgres'||url.search||url.hash)
 throw Error('An explicit isolated loopback test cluster URL is required.');
const name=`moaon_test_credential_${process.pid}_${randomBytes(4).toString('hex')}`;
// Allow a cold local backend to start on the external test disk; query and
// observed-lock deadlines below still bound the concurrency assertions.
const config={ssl:false,max:5,connectionTimeoutMillis:15000,statement_timeout:15000};
// External test disks can take minutes to copy/drop a disposable database.
// Only setup/cleanup receives this bound; race queries retain the 15s limit.
const supervisor=new Pool({...config,statement_timeout:300000,connectionString:url.toString()});let pool,created=false;const roles=[];
const u='20000000-0000-4000-8000-000000000001',tenantId='30000000-0000-4000-8000-000000000001';
const s='40000000-0000-4000-8000-000000000001',o='50000000-0000-4000-8000-000000000001';
const credential='synthetic.signature';
const input={tenantId,provider:'NAVER',expectedRevision:0,fields:{clientId:'synthetic',clientSecret:'synthetic-only'}};
const cipher=createCredentialCipher({activeKeyId:'test',keys:{test:Buffer.alloc(32,7).toString('base64')}});
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function storeFor(client,afterLock=async()=>{}){
 const base=createCredentialSessionFence();
 return createCredentialStore({cipher,verifySession:async()=>({id:s,userId:u,expiresAt:'2099-01-01T00:00:00Z'}),
  sessionFence:{async lock(tx,args){const held=await base.lock(tx,args);await afterLock();return held;}},
  database:{async transaction(work){await client.query('begin');try{const result=await work(client);await client.query('commit');return result;}catch(e){await client.query('rollback');throw e;}}}});
}
async function waitForLock(pid){
 const until=Date.now()+5000;
 while(Date.now()<until){if((await pool.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;
  await new Promise(resolve=>setTimeout(resolve,20));}
 assert.fail('Concurrent operation was not observed waiting for its row lock.');
}
async function fixture(work){
 const client=await pool.connect();let reusable=false;
 try{
  await client.query('set statement_timeout=300000');
  return await work(client);
 }finally{
  // Never return a connection with the relaxed setup deadline to race tests.
  try{await client.query('set statement_timeout=15000');reusable=true;}
  finally{client.release(!reusable);}
 }
}
test.before(async()=>{
 await supervisor.query(`create database "${name}"`);created=true;url.pathname=`/${name}`;
 pool=new Pool({...config,connectionString:url.toString()});
 for(const role of ['anon','authenticated','service_role'])if(!(await supervisor.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){await supervisor.query(`create role ${role}${role==='service_role'?' bypassrls':''}`);roles.push(role);}
 await fixture(async client=>{
  await client.query('create schema auth; create table auth.users(id uuid primary key)');
  for(const file of ['supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql','lib/tenancy/sql/auth-session-fence.sql','lib/tenancy/sql/control-plane.sql','lib/tenancy/sql/credential-store.sql'])await client.query(await fs.readFile(path.join(__dirname,'../..',file),'utf8'));
 });
});
test.after(async()=>{
 const errors=[];try{if(pool)await pool.end();}catch(e){errors.push(e);}
 let dropped=!created;if(created)try{await supervisor.query(`drop database "${name}"`);dropped=true;}catch(e){errors.push(e);}
 if(dropped)for(const role of roles.reverse())try{await supervisor.query(`drop role ${role}`);}catch(e){errors.push(e);}
 try{await supervisor.end();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Disposable test resources could not be cleaned up.');
});
test.beforeEach(async()=>fixture(async client=>{
 await client.query(`truncate moaon_control.tenants cascade; truncate auth.users cascade;
 insert into auth.users values('${u}');
 insert into dashboard_users(user_id,email,username,display_name,role) values('${u}','synthetic@example.test','synthetic','Synthetic','OWNER');
 insert into moaon_auth.account_state(user_id) values('${u}');
 insert into moaon_control.tenants(id,display_name,status) values('${tenantId}','Synthetic','ACTIVE');
 insert into moaon_control.memberships(tenant_id,user_id,role,status,version) values('${tenantId}','${u}','OWNER','ACTIVE',1)`);
 await client.query("insert into dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at) values($1,$2,$3,'synthetic','Synthetic','OWNER',clock_timestamp()+interval '1 hour')",[s,u,createHash('sha256').update(credential).digest('hex')]);
}));
for(const [label,mutation] of [
 ['password reset',`select public.moaon_begin_password_change('${u}','${o}')`],
 ['session revocation',`update dashboard_sessions set revoked_at=clock_timestamp() where id='${s}'`],
 ['profile deactivation',`update dashboard_users set active=false where user_id='${u}'`],
])for(const mutateFirst of [true,false])test(`${label} ${mutateFirst?'wins before credential lock and denies save':'waits for save then completes without deadlock'}`,async t=>{
 let a,b,pendingSave,pendingMutation;const held=deferred(),release=deferred();
 try{
  a=await pool.connect();b=await pool.connect();const pa=(await a.query('select pg_backend_pid() pid')).rows[0].pid,pb=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  assert.notEqual(pa,pb);
  if(mutateFirst){
   await a.query('begin');await a.query(mutation);
   pendingSave=storeFor(b).save(credential,input).then(result=>({result}),error=>({error}));
   await waitForLock(pb);await a.query('commit');
   assert.equal((await pendingSave).error?.code,'CREDENTIAL_ACCESS_DENIED');
  }else{
   pendingSave=storeFor(a,async()=>{held.resolve();await release.promise;}).save(credential,input).then(result=>({result}),error=>({error}));
   await Promise.race([held.promise,pendingSave.then(()=>assert.fail('Save completed before fence pause'))]);
   pendingMutation=b.query(mutation).then(result=>({result}),error=>({error}));
   await waitForLock(pb);release.resolve();
   assert.equal((await pendingSave).result?.revision,1);assert.equal((await pendingMutation).error,undefined);
  }
  assert.equal((await pool.query('select count(*)::int n from moaon_control.provider_credentials')).rows[0].n,mutateFirst?0:1);
  t.diagnostic(`Observed distinct backend lock wait: ${pa}, ${pb}`);
 }finally{
  release.resolve();if(a){await a.query('rollback');a.release();}
  if(pendingSave)await pendingSave;if(pendingMutation)await pendingMutation;if(b)b.release();
 }
});
test('session expiring while save waits for tenant lock is denied using DB wall clock',async t=>{
 let a,b,pending;
 try{
  a=await pool.connect();b=await pool.connect();
  await pool.query("update dashboard_sessions set expires_at=clock_timestamp()+interval '10 seconds'");
  await a.query('begin');await a.query('select id from moaon_control.tenants where id=$1 for update',[tenantId]);
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  pending=storeFor(b).save(credential,input).then(result=>({result}),error=>({error}));
  await waitForLock(pid);
  // Wait only after observing the actual lock, using database expiry and wall clock.
  await a.query('select pg_sleep(greatest(0,extract(epoch from expires_at-clock_timestamp())+0.1)::double precision) from dashboard_sessions where id=$1',[s]);
  await a.query('commit');
  assert.equal((await pending).error?.code,'CREDENTIAL_ACCESS_DENIED');
  assert.equal((await pool.query('select count(*)::int n from moaon_control.provider_credentials')).rows[0].n,0);
  t.diagnostic(`Observed tenant-lock wait on backend ${pid}, then expired session rejection`);
 }finally{if(a){await a.query('rollback');a.release();}if(pending)await pending;if(b)b.release();}
});
