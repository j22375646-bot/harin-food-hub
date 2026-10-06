const test=require('node:test'),assert=require('node:assert/strict');
const {checkCredentialSchema}=require('../lib/tenancy/credential-schema-check.js');
const tableCodes=['TENANTS','MEMBERSHIPS','PROVIDER_CREDENTIALS','ACCOUNT_STATE','DASHBOARD_USERS','DASHBOARD_SESSIONS','CREDENTIAL_REQUEST_LIMITS','INVITATIONS','AUDIT_EVENTS'];
const codes=[...tableCodes,'CREDENTIAL_NETWORK_FUNCTION','CREDENTIAL_USER_FUNCTION'];
const rows=()=>codes.map(code=>({code,present:true,valid:true}));
test('diagnostic requires exact opt-in before constructing any transport',async()=>{
 let factories=0;for(const flag of [undefined,'','0','true','private-secret']){const result=await checkCredentialSchema({env:{MOAON_CONTROL_DB_DIAGNOSTIC:flag},createControlDatabase(){factories++;throw Error('private-secret');}});assert.equal(result.status,'BLOCKED');assert.doesNotMatch(JSON.stringify(result),/private-secret/);}
 assert.equal(factories,0);
});
test('one fixed catalog-only SELECT, safe projection and always close on success or failure',async()=>{
 let closed=0;const queries=[];const env=Object.freeze({MOAON_CONTROL_DB_DIAGNOSTIC:'1'});
 const result=await checkCredentialSchema({env,createControlDatabase:()=>({query:async(sql,...args)=>{queries.push(sql);assert.deepEqual(args,[]);return {rows:rows()};},close:async()=>{closed++;}})});
 assert.equal(result.status,'SCHEMA_PRESENT_REQUIRES_OPERATIONS');assert.equal(closed,1);assert.equal(queries.length,1);assert.match(queries[0],/^\s*with\b/i);assert.doesNotMatch(queries[0],/\b(insert|update|delete|alter|grant|revoke|truncate|call)\b/i);assert.ok(result.operationalChecks.every(x=>x.status==='UNVERIFIED'));
 for(const failure of ['query','shape','close']){
  const result=await checkCredentialSchema({env,createControlDatabase:()=>({query:async()=>{if(failure==='query')throw Error('private-db-host-password');return {rows:failure==='shape'?[{code:'private-row'}]:rows()};},close:async()=>{closed++;if(failure==='close')throw Error('private-close');}})});assert.equal(result.status,'BLOCKED');assert.doesNotMatch(JSON.stringify(result),/private-/);
 }assert.equal(closed,4);
 assert.equal((await checkCredentialSchema({env,createControlDatabase:()=>null})).status,'BLOCKED');
});
test('isolated PostgreSQL catalogs distinguish missing table, missing RLS, wrong function kind and definer',async t=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();t.after(()=>db.close());
 await db.exec('create schema moaon_control;create schema moaon_auth;');
 const tables=['moaon_control.tenants','moaon_control.memberships','moaon_control.provider_credentials','moaon_auth.account_state','public.dashboard_users','public.dashboard_sessions','moaon_control.credential_request_limits','moaon_control.invitations','moaon_control.audit_events'];
 for(const table of tables)await db.exec(`create table ${table}(id int);alter table ${table} enable row level security;`);
 await db.exec("create function public.moaon_consume_credential_network(text) returns boolean language sql as 'select true';create function public.moaon_consume_credential_user(text) returns boolean language sql as 'select true';");
 const run=()=>checkCredentialSchema({env:{MOAON_CONTROL_DB_DIAGNOSTIC:'1'},createControlDatabase:()=>({query:sql=>db.query(sql),close:async()=>{}})});
 assert.equal((await run()).status,'SCHEMA_PRESENT_REQUIRES_OPERATIONS');
 await db.exec('alter table moaon_control.tenants disable row level security');assert.equal((await run()).checks.find(x=>x.code==='TENANTS').status,'INVALID');await db.exec('alter table moaon_control.tenants enable row level security');
 await db.exec('drop table moaon_control.invitations');assert.equal((await run()).checks.find(x=>x.code==='INVITATIONS').status,'MISSING');await db.exec('create table moaon_control.invitations(id int);alter table moaon_control.invitations enable row level security');
 await db.exec('alter function public.moaon_consume_credential_user(text) security definer');assert.equal((await run()).checks.find(x=>x.code==='CREDENTIAL_USER_FUNCTION').status,'INVALID');
 await db.exec("drop function public.moaon_consume_credential_user(text);create procedure public.moaon_consume_credential_user(text) language sql as 'select true';");assert.equal((await run()).checks.find(x=>x.code==='CREDENTIAL_USER_FUNCTION').status,'INVALID');
 await db.exec('drop procedure public.moaon_consume_credential_user(text)');assert.equal((await run()).checks.find(x=>x.code==='CREDENTIAL_USER_FUNCTION').status,'MISSING');
 await db.exec("create function public.moaon_consume_credential_user(text) returns integer language sql as 'select 1';");assert.equal((await run()).checks.find(x=>x.code==='CREDENTIAL_USER_FUNCTION').status,'INVALID');
 await db.exec("drop function public.moaon_consume_credential_user(text);create function public.moaon_consume_credential_user(integer) returns boolean language sql as 'select true';");assert.equal((await run()).checks.find(x=>x.code==='CREDENTIAL_USER_FUNCTION').status,'INVALID');
});
test('default factory connection failure stays fixed JSON and closes; CLI disallows args before connection',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');const checker=path.join(__dirname,'../lib/tenancy/credential-schema-check.js'),cli=path.join(__dirname,'../scripts/check-moaon-credential-schema.js');
 const environment={SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,MOAON_CONTROL_DB_DIAGNOSTIC:'1',MOAON_CONTROL_DB_HOST:'private.example',MOAON_CONTROL_DB_PORT:'5432',MOAON_CONTROL_DB_NAME:'private_db',MOAON_CONTROL_DB_PASSWORD:'private-secret'};
 const stub=`const assert=require('node:assert/strict'),Module=require('node:module'),load=Module._load;let connects=0,closes=0;Module._load=function(name,...rest){if(name==='pg')return {Pool:class {constructor(config){assert.equal(config.connectionTimeoutMillis,5000);assert.equal(config.query_timeout,5000);assert.equal(config.statement_timeout,5000);}on(){}async connect(){connects++;throw Error('private-host-error');}async end(){closes++;}}};return load.call(this,name,...rest);};`;
 const code=stub+`require(${JSON.stringify(checker)}).checkCredentialSchema().then(result=>{assert.equal(connects,1);assert.equal(closes,1);process.stdout.write(JSON.stringify(result));});`;
 const result=spawnSync(process.execPath,['-e',code],{env:environment,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.equal(JSON.parse(result.stdout).status,'BLOCKED');assert.doesNotMatch(result.stdout,/private|CONTROL_DATABASE_FAILURE/);
 const args=stub+`process.argv=['node',${JSON.stringify(cli)},'--target=private'];require(${JSON.stringify(cli)});process.on('beforeExit',()=>assert.equal(connects,0));`;
 const denied=spawnSync(process.execPath,['-e',args],{env:environment,encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(denied.status,1);assert.equal(JSON.parse(denied.stdout).status,'BLOCKED');assert.equal(denied.stderr,'');assert.doesNotMatch(denied.stdout,/private/);
});
