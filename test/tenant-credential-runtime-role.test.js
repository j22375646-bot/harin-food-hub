const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {setupCredentialAuth,sessionId,userId,credential}=require('./helpers/credential-auth-fixture.js');
const {createCredentialStore}=require('../lib/tenancy/credential-store.js');
const {createCredentialCipher}=require('../lib/tenancy/credential-envelope.js');
const {createCredentialSessionFence}=require('../lib/tenancy/credential-session-fence.js');
const tenantId='11111111-1111-4111-8111-111111111111';
const sql=name=>fs.readFile(path.join(__dirname,'../lib/tenancy/sql',name+'.sql'),'utf8');
async function setup(t){const db=new PGlite();t.after(()=>db.close());await setupCredentialAuth(db);for(const name of ['control-plane','credential-store','control-role'])await db.exec(await sql(name));await db.query("insert into moaon_control.tenants(id,display_name,status) values($1,'Synthetic','ACTIVE')",[tenantId]);await db.query("insert into moaon_control.memberships(tenant_id,user_id,role,status,version) values($1,$2,'OWNER','ACTIVE',1)",[tenantId,userId]);return db;}
async function restricted(db,fn){await db.exec('set role moaon_control_app');try{return await fn();}finally{await db.exec('reset role');}}
const input={tenantId,provider:'NAVER',expectedRevision:0,fields:{clientId:'synthetic',clientSecret:'synthetic-secret'}};
function store(db){return createCredentialStore({database:db,cipher:createCredentialCipher({activeKeyId:'v1',keys:{v1:Buffer.alloc(32,1).toString('base64')}}),sessionFence:createCredentialSessionFence(),verifySession:async()=>({id:sessionId,userId,expiresAt:'2099-01-01T00:00:00Z'})});}
test('restricted credential candidate enables owner revision updates without envelope read or auth writes',async t=>{
 const db=await setup(t),s=store(db);
 await restricted(db,()=>assert.rejects(s.save(credential,input),{code:'CREDENTIAL_STORAGE_UNAVAILABLE'}));
 const candidate=await sql('credential-runtime-role');
 await db.exec('grant select(envelope),update(tenant_id,provider) on moaon_control.provider_credentials to moaon_control_app; grant update(blocked) on moaon_auth.account_state to moaon_control_app');
 await db.exec(candidate);await db.exec(candidate);
 await restricted(db,async()=>{
  assert.equal((await s.save(credential,input)).revision,1);
  assert.equal((await s.save(credential,{...input,expectedRevision:1})).revision,2);
  for(const statement of ['select envelope from moaon_control.provider_credentials',"update moaon_control.provider_credentials set provider='CAFE24'",'delete from moaon_control.provider_credentials','truncate moaon_control.provider_credentials','update moaon_auth.account_state set blocked=false','update moaon_auth.account_state set user_id=user_id','update public.dashboard_users set user_id=user_id','update public.dashboard_sessions set id=id','select * from moaon_auth.login_tickets','alter table moaon_control.provider_credentials add column injected text'])await assert.rejects(db.query(statement),e=>e.code==='42501');
  assert.equal((await db.query('select revision from moaon_control.provider_credentials')).rows[0].revision,2);
  assert.equal((await db.query('select status from moaon_control.tenants')).rows[0].status,'ACTIVE');
 });
 for(const statement of ["update moaon_control.memberships set role='VIEWER'","update moaon_auth.account_state set blocked=true,operation_id='55555555-5555-4555-8555-555555555555'",'update dashboard_sessions set revoked_at=clock_timestamp()']){
  await db.exec(statement);await restricted(db,()=>assert.rejects(s.save(credential,{...input,expectedRevision:2}),{code:'CREDENTIAL_ACCESS_DENIED'}));
  await db.exec("update moaon_control.memberships set role='OWNER';update moaon_auth.account_state set blocked=false,operation_id=null;update dashboard_sessions set revoked_at=null");
 }
 await restricted(db,()=>assert.rejects(s.save(credential,{...input,tenantId:'33333333-3333-4333-8333-333333333333'}),{code:'CREDENTIAL_ACCESS_DENIED'}));
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{await assert.rejects(db.query('select revision from moaon_control.provider_credentials'));}finally{await db.exec('reset role');}}
});
test('candidate rejects unsafe role and missing RLS atomically',async t=>{
 const db=await setup(t),candidate=await sql('credential-runtime-role');
 for(const change of ['alter role moaon_control_app login','alter table public.dashboard_sessions disable row level security']){
  await db.exec(change);await assert.rejects(db.exec(candidate));await db.exec('rollback');
  assert.equal((await db.query("select has_column_privilege('moaon_control_app','moaon_auth.account_state','blocked','SELECT') as allowed")).rows[0].allowed,false);
  await db.exec('alter role moaon_control_app nologin;alter table public.dashboard_sessions enable row level security');
 }
 await db.exec(candidate);
});

test('candidate refuses PUBLIC policy bleed and rolls back earlier table grant normalization',async t=>{
 const db=await setup(t),candidate=await sql('credential-runtime-role');
 await db.exec('grant update(blocked) on moaon_auth.account_state to moaon_control_app;create policy unrelated_public on moaon_control.provider_credentials for all using(true) with check(true)');
 await assert.rejects(db.exec(candidate),/unexpected public privileges/);
 assert.equal((await db.query("select has_column_privilege('moaon_control_app','moaon_auth.account_state','blocked','UPDATE') as allowed")).rows[0].allowed,true);
 assert.equal((await db.query("select count(*)::int as n from pg_policy where polname='moaon_credential_runtime_select'")).rows[0].n,0);
 await db.exec('drop policy unrelated_public on moaon_control.provider_credentials;grant select(envelope) on moaon_control.provider_credentials to public');
 await assert.rejects(db.exec(candidate),/unexpected public privileges/);
 await db.exec('revoke select(envelope) on moaon_control.provider_credentials from public');
 await db.exec(candidate);
 await restricted(db,async()=>{
  // Existing membership broker mutation permissions survive this candidate.
  await db.query("update moaon_control.memberships set version=version+1 where tenant_id=$1",[tenantId]);
  assert.equal((await db.query('select version from moaon_control.memberships')).rows[0].version,2);
 });
});

test('candidate preserves another role policy and refuses schema creation privilege',async t=>{
 const db=await setup(t),candidate=await sql('credential-runtime-role');
 await db.exec('create policy moaon_credential_runtime_select on moaon_auth.account_state for select to service_role using(true)');
 await assert.rejects(db.exec(candidate),/belongs to another role/);
 assert.equal((await db.query("select polroles=array[(select oid from pg_roles where rolname='service_role')] as preserved from pg_policy where polname='moaon_credential_runtime_select'")).rows[0].preserved,true);
 await db.exec('drop policy moaon_credential_runtime_select on moaon_auth.account_state;grant create on schema moaon_auth to moaon_control_app');
 await assert.rejects(db.exec(candidate),/schema CREATE/);
 await db.exec('revoke create on schema moaon_auth from moaon_control_app');await db.exec(candidate);
});

test('candidate refuses elevated, inherited and owning provisioning roles',async t=>{
 const db=await setup(t),candidate=await sql('credential-runtime-role');
 await db.exec('create role synthetic_parent nologin');
 for(const change of ['alter role moaon_control_app superuser','alter role moaon_control_app bypassrls',
  'alter role moaon_control_app inherit','alter role moaon_control_app createrole','alter role moaon_control_app createdb',
  'alter role moaon_control_app replication','grant synthetic_parent to moaon_control_app',
  'alter schema moaon_auth owner to moaon_control_app','alter table public.dashboard_users owner to moaon_control_app']){
  await assert.rejects(db.transaction(async tx=>{await tx.exec(change);await tx.exec(candidate);}),/unsafe credential runtime role/);
 }
 await db.exec(candidate);
});
