const test=require('node:test'),assert=require('node:assert/strict');
const {checkCredentialPolicies}=require('../lib/tenancy/credential-policy-check.js');
const codes=['RUNTIME_ROLE','RLS_SESSION','PROVIDER_CREDENTIALS_POLICIES','ACCOUNT_STATE_POLICIES','DASHBOARD_USERS_POLICIES','DASHBOARD_SESSIONS_POLICIES'];
const rows=()=>codes.map(code=>({code,present:true,valid:true}));
test('policy diagnostic requires opt-in and safely closes on all transport outcomes',async()=>{
 let opened=0,closed=0;
 const factory=()=>{opened++;return {query:async()=>({rows:rows()}),close:async()=>{closed++;}};};
 for(const flag of [undefined,'','0','true'])assert.equal((await checkCredentialPolicies({env:{MOAON_CONTROL_DB_DIAGNOSTIC:flag},createControlDatabase:factory})).status,'BLOCKED');
 assert.equal(opened,0);
 const env=Object.freeze({MOAON_CONTROL_DB_DIAGNOSTIC:'1'});
 const result=await checkCredentialPolicies({env,createControlDatabase:factory});
 assert.equal(result.status,'CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS');assert.equal(closed,1);
 assert.ok(result.operationalChecks.every(x=>x.status==='UNVERIFIED'));
 for(const mode of ['query','shape','close']){
  const result=await checkCredentialPolicies({env,createControlDatabase:()=>({query:async()=>{if(mode==='query')throw Error('private-error');return {rows:mode==='shape'?[{code:'private-row'}]:rows()};},close:async()=>{closed++;if(mode==='close')throw Error('private-close');}})});
  assert.equal(result.status,'BLOCKED');assert.doesNotMatch(JSON.stringify(result),/private/);
 }assert.equal(closed,4);
});
test('real candidate policies reject changed checks, public/extra policies and role bypass',async t=>{
 const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs/promises'),path=require('node:path');
 const db=new PGlite();t.after(()=>db.close());
 const invoke=()=>checkCredentialPolicies({env:{MOAON_CONTROL_DB_DIAGNOSTIC:'1'},createControlDatabase:()=>({query:sql=>db.query(sql),close:async()=>{}})});
 assert.equal((await invoke()).checks.find(x=>x.code==='RUNTIME_ROLE').status,'MISSING');
 await require('./helpers/credential-auth-fixture.js').setupCredentialAuth(db);
 for(const file of ['control-plane.sql','credential-store.sql','control-role.sql','credential-runtime-role.sql'])await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql',file),'utf8'));
 await db.exec('set search_path=pg_catalog');
 const run=async()=>{await db.exec('set session authorization moaon_control_app');try{return await invoke();}finally{await db.exec('set session authorization postgres');}};
 const status=(result,code)=>result.checks.find(x=>x.code===code)?.status;
 assert.equal((await run()).status,'CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS');
 const drifts=[
  ['alter policy moaon_credential_runtime_lock on public.dashboard_users with check(true)','DASHBOARD_USERS_POLICIES','alter policy moaon_credential_runtime_lock on public.dashboard_users with check(false)'],
  ['alter policy moaon_credential_runtime_select on moaon_control.provider_credentials using(false)','PROVIDER_CREDENTIALS_POLICIES','alter policy moaon_credential_runtime_select on moaon_control.provider_credentials using(true)'],
  ['alter policy moaon_credential_runtime_select on moaon_auth.account_state to public','ACCOUNT_STATE_POLICIES','alter policy moaon_credential_runtime_select on moaon_auth.account_state to moaon_control_app'],
  ['alter policy moaon_credential_runtime_select on moaon_auth.account_state to anon','ACCOUNT_STATE_POLICIES','alter policy moaon_credential_runtime_select on moaon_auth.account_state to moaon_control_app'],
  ['alter policy moaon_credential_runtime_select on moaon_auth.account_state to moaon_control_app,anon','ACCOUNT_STATE_POLICIES','alter policy moaon_credential_runtime_select on moaon_auth.account_state to moaon_control_app'],
  ['drop policy moaon_credential_runtime_lock on moaon_auth.account_state;create policy moaon_credential_runtime_lock on moaon_auth.account_state as restrictive for update to moaon_control_app using(true) with check(false)','ACCOUNT_STATE_POLICIES','drop policy moaon_credential_runtime_lock on moaon_auth.account_state;create policy moaon_credential_runtime_lock on moaon_auth.account_state for update to moaon_control_app using(true) with check(false)'],
  ['drop policy moaon_credential_runtime_select on public.dashboard_sessions;create policy moaon_credential_runtime_select on public.dashboard_sessions for all to moaon_control_app using(true)','DASHBOARD_SESSIONS_POLICIES','drop policy moaon_credential_runtime_select on public.dashboard_sessions;create policy moaon_credential_runtime_select on public.dashboard_sessions for select to moaon_control_app using(true)'],
  ['create policy extra on public.dashboard_sessions for update to public using(true) with check(true)','DASHBOARD_SESSIONS_POLICIES','drop policy extra on public.dashboard_sessions'],
  ['create policy extra on public.dashboard_sessions as restrictive for select to moaon_control_app using(false)','DASHBOARD_SESSIONS_POLICIES','drop policy extra on public.dashboard_sessions'],
  ['drop policy moaon_credential_runtime_insert on moaon_control.provider_credentials','PROVIDER_CREDENTIALS_POLICIES','create policy moaon_credential_runtime_insert on moaon_control.provider_credentials for insert to moaon_control_app with check(true)'],
  ['alter table moaon_auth.account_state disable row level security','ACCOUNT_STATE_POLICIES','alter table moaon_auth.account_state enable row level security'],
  ['alter role moaon_control_app bypassrls','RUNTIME_ROLE','alter role moaon_control_app nobypassrls'],
  ['grant anon to moaon_control_app','RUNTIME_ROLE','revoke anon from moaon_control_app'],
  ['set row_security=off','RLS_SESSION','set row_security=on'],
  ['set search_path=public','RLS_SESSION','set search_path=pg_catalog'],
 ];
 for(const [change,code,undo] of drifts){await db.exec(change);assert.equal(status(await run(),code),'INVALID',change);await db.exec(undo);assert.equal((await run()).status,'CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS',undo);}
 await db.exec("create function public.private_policy() returns boolean language plpgsql as $$begin raise exception 'must not execute';end$$;alter policy moaon_credential_runtime_lock on public.dashboard_users with check(public.private_policy())");
 const spoof=await run();assert.equal(status(spoof,'DASHBOARD_USERS_POLICIES'),'INVALID');assert.doesNotMatch(JSON.stringify(spoof),/private/);
 await db.exec('alter policy moaon_credential_runtime_lock on public.dashboard_users with check(false);create policy other_role_only on public.dashboard_users to anon using(true)');
 assert.equal((await run()).status,'CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS');
});
test('CLI rejects arguments without configuration or connection and returns only safe JSON',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');
 const cli=path.join(__dirname,'../scripts/check-moaon-credential-policies.js');
 for(const args of [[],['--private-secret']]){
  const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',windowsHide:true,timeout:10000,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
  assert.equal(result.status,1,result.stderr);assert.equal(result.stderr,'');
  const report=JSON.parse(result.stdout);assert.equal(report.status,'BLOCKED');assert.doesNotMatch(result.stdout,/private/);
  assert.equal(report.checks[0].code,args.length?'CLI_ARGUMENTS':'DIAGNOSTIC_OPT_IN');
 }
 const script=`const assert=require('node:assert/strict'),Module=require('node:module'),load=Module._load;let closed=0;Module._load=function(name,...rest){if(name==='./control-database-config.js')return {createConfiguredControlDatabase:()=>({query:async()=>({rows:${JSON.stringify(rows())}}),close:async()=>{closed++;}})};return load.call(this,name,...rest);};process.argv=['node',${JSON.stringify(cli)}];require(${JSON.stringify(cli)});process.on('beforeExit',()=>assert.equal(closed,1));`;
 const success=spawnSync(process.execPath,['-e',script],{encoding:'utf8',windowsHide:true,timeout:10000,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,MOAON_CONTROL_DB_DIAGNOSTIC:'1'}});
 assert.equal(success.status,0,success.stderr);assert.equal(success.stderr,'');assert.equal(JSON.parse(success.stdout).status,'CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS');
});
