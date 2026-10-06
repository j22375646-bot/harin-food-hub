const test=require('node:test'),assert=require('node:assert/strict');
const {checkCredentialWriteHooks}=require('../lib/tenancy/credential-write-hooks-check.js');
const codes=['REPLICATION_MODE','PROVIDER_CREDENTIALS_HOOKS','ACCOUNT_STATE_HOOKS','DASHBOARD_USERS_HOOKS','DASHBOARD_SESSIONS_HOOKS'];
const rows=()=>codes.map(code=>({code,present:true,valid:true}));
test('actual candidate allows internal FK triggers and detects user hooks without executing them',async t=>{
 const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs/promises'),path=require('node:path');
 const db=new PGlite();t.after(()=>db.close());
 const invoke=()=>checkCredentialWriteHooks({env:{MOAON_CONTROL_DB_DIAGNOSTIC:'1'},createControlDatabase:()=>({query:sql=>db.query(sql),close:async()=>{}})});
 assert.equal((await invoke()).checks.find(x=>x.code==='PROVIDER_CREDENTIALS_HOOKS').status,'MISSING');
 await require('./helpers/credential-auth-fixture.js').setupCredentialAuth(db);
 for(const file of ['control-plane.sql','credential-store.sql','control-role.sql','credential-runtime-role.sql'])await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql',file),'utf8'));
 const run=async()=>{await db.exec('set session authorization moaon_control_app');try{return await invoke();}finally{await db.exec('set session authorization postgres');}};
 assert.equal((await run()).status,'CREDENTIAL_WRITE_HOOKS_MATCH_REQUIRES_OPERATIONS');
 const state=(result,code)=>result.checks.find(x=>x.code===code)?.status;
 await db.exec("create function public.private_hook() returns trigger language plpgsql as $$begin raise exception 'must not execute';end$$");
 const drifts=[
  ['create trigger extra before update on moaon_control.provider_credentials for each row execute function public.private_hook()','PROVIDER_CREDENTIALS_HOOKS','drop trigger extra on moaon_control.provider_credentials'],
  ['create trigger extra after update on public.dashboard_sessions for each statement execute function public.private_hook();alter table public.dashboard_sessions disable trigger extra','DASHBOARD_SESSIONS_HOOKS','drop trigger extra on public.dashboard_sessions'],
  ['create constraint trigger extra after update on moaon_auth.account_state deferrable initially deferred for each row execute function public.private_hook()','ACCOUNT_STATE_HOOKS','drop trigger extra on moaon_auth.account_state'],
  ['create rule extra as on update to public.dashboard_users do instead nothing','DASHBOARD_USERS_HOOKS','drop rule extra on public.dashboard_users'],
  ['create table public.private_child() inherits(public.dashboard_users)','DASHBOARD_USERS_HOOKS','drop table public.private_child'],
  ['create table public.private_parent();alter table moaon_control.provider_credentials inherit public.private_parent','PROVIDER_CREDENTIALS_HOOKS','alter table moaon_control.provider_credentials no inherit public.private_parent;drop table public.private_parent'],
  ['alter table moaon_control.provider_credentials rename to private_original;create table moaon_control.provider_credentials(tenant_id uuid) partition by hash(tenant_id)','PROVIDER_CREDENTIALS_HOOKS','drop table moaon_control.provider_credentials;alter table moaon_control.private_original rename to provider_credentials'],
  ['alter table moaon_control.provider_credentials disable trigger all','PROVIDER_CREDENTIALS_HOOKS','alter table moaon_control.provider_credentials enable trigger all'],
  ['set session_replication_role=replica','REPLICATION_MODE','set session_replication_role=origin'],
 ];
 for(const [change,code,undo] of drifts){await db.exec(change);const result=await run();assert.equal(state(result,code),'INVALID',change);assert.doesNotMatch(JSON.stringify(result),/private|must not execute/);await db.exec(undo);assert.equal((await run()).status,'CREDENTIAL_WRITE_HOOKS_MATCH_REQUIRES_OPERATIONS',undo);}
});
test('write hook diagnostic requires opt-in and safely closes on all transport outcomes',async()=>{
 let opened=0,closed=0;
 const factory=()=>{opened++;return {query:async()=>({rows:rows()}),close:async()=>{closed++;}};};
 for(const flag of [undefined,'','0','true'])assert.equal((await checkCredentialWriteHooks({env:{MOAON_CONTROL_DB_DIAGNOSTIC:flag},createControlDatabase:factory})).status,'BLOCKED');
 assert.equal(opened,0);
 const env=Object.freeze({MOAON_CONTROL_DB_DIAGNOSTIC:'1'});
 const result=await checkCredentialWriteHooks({env,createControlDatabase:factory});
 assert.equal(result.status,'CREDENTIAL_WRITE_HOOKS_MATCH_REQUIRES_OPERATIONS');assert.equal(closed,1);
 assert.ok(result.operationalChecks.every(x=>x.status==='UNVERIFIED'));
 for(const mode of ['query','shape','close']){
  const result=await checkCredentialWriteHooks({env,createControlDatabase:()=>({query:async()=>{if(mode==='query')throw Error('private-error');return {rows:mode==='shape'?[{code:'private-row'}]:rows()};},close:async()=>{closed++;if(mode==='close')throw Error('private-close');}})});
  assert.equal(result.status,'BLOCKED');assert.doesNotMatch(JSON.stringify(result),/private/);
 }assert.equal(closed,4);
});
test('CLI rejects arguments without configuration or connection and returns only safe JSON',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');
 const cli=path.join(__dirname,'../scripts/check-moaon-credential-write-hooks.js');
 for(const args of [[],['--private-secret']]){
  const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',windowsHide:true,timeout:10000,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
  assert.equal(result.status,1,result.stderr);assert.equal(result.stderr,'');
  const report=JSON.parse(result.stdout);assert.equal(report.status,'BLOCKED');assert.doesNotMatch(result.stdout,/private/);
  assert.equal(report.checks[0].code,args.length?'CLI_ARGUMENTS':'DIAGNOSTIC_OPT_IN');
 }
 const script=`const assert=require('node:assert/strict'),Module=require('node:module'),load=Module._load;let closed=0;Module._load=function(name,...rest){if(name==='./control-database-config.js')return {createConfiguredControlDatabase:()=>({query:async()=>({rows:${JSON.stringify(rows())}}),close:async()=>{closed++;}})};return load.call(this,name,...rest);};process.argv=['node',${JSON.stringify(cli)}];require(${JSON.stringify(cli)});process.on('beforeExit',()=>assert.equal(closed,1));`;
 const success=spawnSync(process.execPath,['-e',script],{encoding:'utf8',windowsHide:true,timeout:10000,env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,MOAON_CONTROL_DB_DIAGNOSTIC:'1'}});
 assert.equal(success.status,0,success.stderr);assert.equal(success.stderr,'');assert.equal(JSON.parse(success.stdout).status,'CREDENTIAL_WRITE_HOOKS_MATCH_REQUIRES_OPERATIONS');
});
