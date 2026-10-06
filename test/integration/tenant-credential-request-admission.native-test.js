'use strict';
// Explicit opt-in to a disposable loopback cluster. Never a production URL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes, createHash} = require('node:crypto');
const {Pool} = require('pg');
const {createPostgresControlDatabase} = require('../../lib/tenancy/postgres-control-database.js');
const {createCredentialStore} = require('../../lib/tenancy/credential-store.js');
const {createCredentialCipher} = require('../../lib/tenancy/credential-envelope.js');
const {createCredentialSessionFence} = require('../../lib/tenancy/credential-session-fence.js');
const {createTenantControlStore} = require('../../lib/tenancy/control-store.js');

const url = new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL || 'invalid:');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
  || url.port !== '55437' || url.username !== 'moaon_test_admin' || !url.password
  || url.pathname !== '/postgres' || url.search || url.hash) {
  throw Error('An explicit isolated loopback test cluster URL is required.');
}
const databaseName = `moaon_test_credential_admission_${process.pid}_${randomBytes(4).toString('hex')}`;
const supervisor = new Pool({connectionString: url.toString(), ssl: false, max: 2,
  connectionTimeoutMillis: 15000, statement_timeout: 300000});
const createdRoles = [];
let admin, database, second, created = false;
const userId = '20000000-0000-4000-8000-000000000001';
const tenantId = '30000000-0000-4000-8000-000000000001';
const otherTenant = '30000000-0000-4000-8000-000000000002';
const sessionId = '40000000-0000-4000-8000-000000000001';
const credential = 'synthetic.signature';
const input = {tenantId, provider: 'NAVER', expectedRevision: 0,
  fields: {clientId: 'synthetic', clientSecret: 'synthetic-secret-only'}};
const cipher = createCredentialCipher({activeKeyId: 'test', keys: {test: Buffer.alloc(32, 7).toString('base64')}});
function storeFor(transport = database) {
  return createCredentialStore({database: transport, cipher, sessionFence: createCredentialSessionFence(),
    verifySession: async () => ({id: sessionId, userId, expiresAt: '2099-01-01T00:00:00Z'})});
}
test.before(async () => {
  // Do not adopt or alter a role owned by another test/application.
  assert.equal((await supervisor.query("select 1 from pg_roles where rolname='moaon_control_app'")).rowCount, 0);
  await supervisor.query(`create database "${databaseName}"`); created = true;
  url.pathname = `/${databaseName}`;
  admin = new Pool({connectionString: url.toString(), ssl: false, max: 3,
    connectionTimeoutMillis: 15000, statement_timeout: 300000});
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!(await supervisor.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) {
      await supervisor.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
      createdRoles.push(role);
    }
  }
  await admin.query('create schema auth; create table auth.users(id uuid primary key)');
  for (const file of ['supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql',
    'lib/tenancy/sql/auth-session-fence.sql', 'lib/tenancy/sql/control-plane.sql',
    'lib/tenancy/sql/credential-store.sql', 'lib/tenancy/sql/control-role.sql']) {
    await admin.query(await fs.readFile(path.join(__dirname, '../..', file), 'utf8'));
    if (file.endsWith('/control-role.sql')) createdRoles.push('moaon_control_app');
  }
  const roleSql = await fs.readFile(path.join(__dirname, '../../lib/tenancy/sql/credential-runtime-role.sql'), 'utf8');
  await admin.query(roleSql);
  await admin.query(roleSql);
  await admin.query(`insert into auth.users values ('${userId}');
    insert into dashboard_users(user_id,email,username,display_name,role)
      values('${userId}','synthetic@example.test','synthetic','Synthetic','OWNER');
    insert into moaon_auth.account_state(user_id) values('${userId}');
    insert into moaon_control.tenants(id,display_name,status)
      values('${tenantId}','Synthetic','ACTIVE'),('${otherTenant}','Other','ACTIVE');
    insert into moaon_control.memberships(tenant_id,user_id,role,status,version)
      values('${tenantId}','${userId}','OWNER','ACTIVE',1)`);
  await admin.query(`insert into dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at)
    values($1,$2,$3,'synthetic','Synthetic','OWNER',clock_timestamp()+interval '1 hour')`,
    [sessionId, userId, createHash('sha256').update(credential).digest('hex')]);
  await admin.query(await fs.readFile(path.join(__dirname, '../../lib/tenancy/sql/credential-request-admission.sql'), 'utf8'));
  const password = randomBytes(24).toString('hex');
  await admin.query(`alter role moaon_control_app login password '${password}'`);
  second = new Pool({host:'127.0.0.1',port:55437,database:databaseName,user:'moaon_control_app',password,ssl:false,max:1,connectionTimeoutMillis:15000,statement_timeout:15000});
  database = createPostgresControlDatabase({connection: {host: '127.0.0.1', port: 55437,
    database: databaseName, user: 'moaon_control_app', password, ssl: false}, localTestOnly: true,
    connectionTimeoutMillis: 15000, statementTimeoutMillis: 15000, lockTimeoutMillis: 5000,
    idleInTransactionSessionTimeoutMillis: 15000, diagnostic() {}});
});
test.after(async () => {
  const failures = [];
  for (const close of [() => database?.close(), () => second?.end(), () => admin?.end()]) {
    try { await close(); } catch (error) { failures.push(error); }
  }
  let dropped = !created;
  if (created) try { await supervisor.query(`drop database "${databaseName}"`); dropped = true; }
  catch (error) { failures.push(error); }
  if (dropped) for (const role of createdRoles.reverse()) {
    try { await supervisor.query(`drop role ${role}`); } catch (error) { failures.push(error); }
  }
  try { await supervisor.end(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, 'Disposable role test cleanup failed.');
});


const {createCredentialRequestAdmission}=require('../../lib/tenancy/credential-request-admission.js');
const {createCredentialSaveRequest}=require('../../lib/tenancy/credential-request.js');
const hash=n=>createHash('sha256').update(String(n)).digest('hex');
const network=(db,key)=>db.query('select public.moaon_consume_credential_network($1) allowed',[hash(key)]).then(r=>r.rows[0].allowed);
const user=(db,key)=>db.query('select public.moaon_consume_credential_user($1) allowed',[hash(key)]).then(r=>r.rows[0].allowed);
const reset=()=>admin.query('truncate moaon_control.credential_request_limits');
test('two restricted connections aggregate exact IP30 USER10 GLOBAL120 caps',async()=>{
 assert.equal((await second.query('select current_user')).rows[0].current_user,'moaon_control_app');
 await reset();
 let values=await Promise.all(Array.from({length:40},(_,i)=>network(i%2?database:second,'same-ip')));
 assert.equal(values.filter(Boolean).length,30);
 assert.deepEqual((await admin.query("select scope,used from moaon_control.credential_request_limits order by scope")).rows,[{scope:'GLOBAL',used:40},{scope:'IP',used:30}]);
 values=await Promise.all(Array.from({length:16},(_,i)=>user(i%2?database:second,'same-user')));assert.equal(values.filter(Boolean).length,10);
 await reset();values=await Promise.all(Array.from({length:140},(_,i)=>network(i%2?database:second,'ip-'+i)));assert.equal(values.filter(Boolean).length,120);
 assert.equal((await admin.query("select used from moaon_control.credential_request_limits where scope='GLOBAL'")).rows[0].used,120);
});
test('DB wall clock resets expired windows but never future windows; counters saturate',async()=>{
 await reset();for(let i=0;i<10;i++)assert.equal(await user(database,'window'),true);
 await admin.query("update moaon_control.credential_request_limits set started_at=clock_timestamp()+interval '1 hour'");assert.equal(await user(second,'window'),false);
 await admin.query("update moaon_control.credential_request_limits set started_at=clock_timestamp()-interval '301 seconds'");assert.equal(await user(second,'window'),true);
 assert.equal((await admin.query('select used from moaon_control.credential_request_limits')).rows[0].used,1);
 await reset();await network(database,'window');await admin.query("update moaon_control.credential_request_limits set used=case scope when 'GLOBAL' then 120 else 30 end,started_at=clock_timestamp()+interval '1 hour'");assert.equal(await network(second,'window'),false);
 await admin.query("update moaon_control.credential_request_limits set started_at=clock_timestamp()-interval '301 seconds'");assert.equal(await network(second,'window'),true);
 assert.deepEqual((await admin.query('select used from moaon_control.credential_request_limits')).rows.map(r=>r.used),[1,1]);
});
test('restricted runtime cannot delete truncate create or delegate; public roles cannot call either function',async()=>{
 for(const sql of ['delete from moaon_control.credential_request_limits','truncate moaon_control.credential_request_limits','create table moaon_control.forbidden(id int)','create table public.forbidden(id int)',"set role service_role"]){await assert.rejects(second.query(sql),{code:'42501'});}
 for(const role of ['anon','authenticated','service_role']){const c=await admin.connect();try{await c.query('begin');await c.query('set local role '+role);await assert.rejects(c.query('select public.moaon_consume_credential_network($1)',[hash('x')]),{code:'42501'});}finally{await c.query('rollback');c.release();}const d=await admin.connect();try{await d.query('begin');await d.query('set local role '+role);await assert.rejects(d.query('select public.moaon_consume_credential_user($1)',[hash('x')]),{code:'42501'});}finally{await d.query('rollback');d.release();}}
 const functions=(await admin.query("select prosecdef,proconfig from pg_proc where proname in ('moaon_consume_credential_network','moaon_consume_credential_user')")).rows;assert.equal(functions.length,2);for(const f of functions){assert.equal(f.prosecdef,false);assert.deepEqual(f.proconfig,['search_path=""']);}
 const role=(await admin.query("select rolbypassrls,rolsuper from pg_roles where rolname='moaon_control_app'")).rows[0];assert.deepEqual(role,{rolbypassrls:false,rolsuper:false});
 await assert.rejects(database.query("select public.moaon_consume_credential_network('bad')"),{code:'CONTROL_DATABASE_UNAVAILABLE'});
});
test('real Request -> shared admission -> session-fenced encrypted store; failed save consumes quota',async()=>{
 await reset();const origin='https://hub.example';
 const make=db=>{const admission=createCredentialRequestAdmission({rpcClient:{rpc:async(name,args)=>({data:(await db.query('select public.'+name+'($1) allowed',[Object.values(args)[0]])).rows[0].allowed,error:null})},hmacKey:'synthetic'.repeat(8),trustedClientIp:'127.0.0.1',verifySession:async value=>{assert.equal(value,credential);return {userId,expiresAt:'2099-01-01T00:00:00Z'};}});return createCredentialSaveRequest({origin,admit:(req,value,options)=>admission(value,options),save:storeFor().save});};
 const handlers=[make(database),make(second)];
 const req=revision=>new Request(origin+'/api/moaon/credentials',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session='+credential},body:JSON.stringify({...input,expectedRevision:revision})});
 assert.equal((await handlers[0](req(0))).status,200);assert.equal((await handlers[1](req(0))).status,409);
 for(let i=2;i<10;i++)assert.equal((await handlers[i%2](req(i-1))).status,200);
 assert.equal((await handlers[1](req(9))).status,429);
 assert.equal((await database.query('select revision from moaon_control.provider_credentials')).rows[0].revision,9);
 const envelope=(await admin.query('select envelope from moaon_control.provider_credentials')).rows[0].envelope;assert.equal(JSON.stringify(envelope).includes(input.fields.clientSecret),false);
 assert.deepEqual((await admin.query('select scope,used from moaon_control.credential_request_limits order by scope')).rows,[{scope:'GLOBAL',used:11},{scope:'IP',used:11},{scope:'USER',used:10}]);
});
test('USER admission uses wall clock after waiting for the locked quota row',async()=>{
 await reset();await user(database,'locked');const blocker=await admin.connect();let pending;
 try{
  await blocker.query('begin');await blocker.query("update moaon_control.credential_request_limits set used=10,started_at=clock_timestamp()-interval '299 seconds' where scope='USER'");
  pending=user(second,'locked');let observed=false;const deadline=Date.now()+5000;
  while(Date.now()<deadline){if((await admin.query("select 1 from pg_stat_activity where datname=$1 and usename='moaon_control_app' and wait_event_type='Lock'",[databaseName])).rowCount){observed=true;break;}await new Promise(r=>setTimeout(r,20));}
  assert.equal(observed,true);await new Promise(r=>setTimeout(r,1100));await blocker.query('commit');assert.equal(await pending,true);
 }finally{await blocker.query('rollback');blocker.release();if(pending)await pending;}
});

test('server runtime Request composes restricted DB quotas, read-only identity and encrypted fenced store',async()=>{
 const {createCredentialSaveRuntime}=require('../../lib/tenancy/credential-save-runtime.js');
 const old=[process.env.VERCEL,process.env.VERCEL_ENV];process.env.VERCEL='1';process.env.VERCEL_ENV='production';
 const origin='https://hub.example';let validations=0;
 const identityClient={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{user_id:userId,email:'synthetic@example.test',active:true},error:null};}};},auth:{admin:{async getUserById(){return {data:{user:{id:userId,email:'synthetic@example.test',is_anonymous:false}},error:null};}}}};
 const runtime=createCredentialSaveRuntime({env:{MOAON_CREDENTIAL_SAVE_ENABLED:'1',MOAON_CREDENTIAL_SAVE_ORIGIN:origin,MOAON_CREDENTIAL_SAVE_INGRESS:'vercel-direct',MOAON_CREDENTIAL_KEYRING:JSON.stringify({test:Buffer.alloc(32,7).toString('base64')}),MOAON_CREDENTIAL_ACTIVE_KEY_ID:'test',MOAON_CREDENTIAL_ADMISSION_HMAC_KEY:'synthetic'.repeat(8)},createControlDatabase:()=>({transaction:database.transaction,close:async()=>{}}),createIdentityClient:()=>identityClient,validateSession:async(value,options)=>{assert.equal(value,credential);assert.equal(options.touch,false);assert.ok(options.signal);assert.ok(Number.isFinite(options.deadline));validations++;return {id:sessionId,userId,expiresAt:'2099-01-01T00:00:00Z'};}});
 try{
  await reset();const before=(await admin.query('select revision from moaon_control.provider_credentials where tenant_id=$1 and provider=$2',[tenantId,'NAVER'])).rows[0]?.revision||0;
  const req=revision=>new Request(origin+'/api/moaon/credentials',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session='+credential,'x-vercel-forwarded-for':'127.0.0.1','x-forwarded-for':'127.0.0.1'},body:JSON.stringify({...input,expectedRevision:revision})});
  const metadata=()=>new Request(origin+'/api/moaon/credentials?tenantId='+tenantId+'&provider=NAVER',{headers:{origin,cookie:'harin_dashboard_session='+credential,'x-vercel-forwarded-for':'127.0.0.1','x-forwarded-for':'127.0.0.1'}});
  assert.deepEqual(await (await runtime.handle(metadata())).json(),{ok:true,tenantId,provider:'NAVER',revision:before,status:before===0?'NOT_SAVED':'SAVED_UNVERIFIED'});
  const response=await runtime.handle(req(before));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,tenantId,provider:'NAVER',revision:before+1,status:'SAVED_UNVERIFIED'});assert.equal(validations,12);
  assert.deepEqual(await (await runtime.handle(metadata())).json(),{ok:true,tenantId,provider:'NAVER',revision:before+1,status:'SAVED_UNVERIFIED'});
  assert.equal((await runtime.handle(req(before))).status,409);
  const row=(await admin.query('select envelope from moaon_control.provider_credentials where tenant_id=$1 and provider=$2',[tenantId,'NAVER'])).rows[0];assert.doesNotMatch(JSON.stringify(row),/synthetic-secret-only/);assert.deepEqual(cipher.open({tenantId,provider:'NAVER',revision:before+1},row.envelope),input.fields);
  assert.deepEqual((await admin.query('select scope,used from moaon_control.credential_request_limits order by scope')).rows,[{scope:'GLOBAL',used:4},{scope:'IP',used:4},{scope:'USER',used:4}]);
 }finally{await runtime.close();for(const [i,key] of ['VERCEL','VERCEL_ENV'].entries())if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];}
});
