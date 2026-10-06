'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{randomBytes}=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path');
const {createPostgresControlDatabase}=require('../../lib/tenancy/postgres-control-database.js');
const {checkCredentialInvariants}=require('../../lib/tenancy/credential-invariants-check.js');
const url=new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL||'invalid:');
if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='55437'||url.username!=='moaon_test_admin'||!url.password||url.pathname!=='/postgres'||url.search||url.hash)throw Error('Explicit disposable loopback cluster required.');
test('PostgreSQL 17 actual candidate canonical invariants use restricted role and close all fixtures',async()=>{
 const name=`moaon_test_invariants_${process.pid}_${randomBytes(4).toString('hex')}`;
 const supervisor=new Pool({connectionString:url.toString(),ssl:false,max:1,statement_timeout:300000,connectionTimeoutMillis:15000});
 let admin,database,created=false,roleCreated=false;
 try{
  assert.equal((await supervisor.query("select count(*)::int as count from pg_roles where rolname='moaon_control_app'")).rows[0].count,0);
  await supervisor.query(`create database "${name}"`);created=true;
  const target=new URL(url);target.pathname='/'+name;
  admin=new Pool({connectionString:target.toString(),ssl:false,max:1,statement_timeout:300000,connectionTimeoutMillis:15000});
  assert.equal(Math.floor(Number((await admin.query("select current_setting('server_version_num') as version")).rows[0].version)/10000),17);
  for(const file of ['control-plane.sql','credential-store.sql','control-role.sql']){await admin.query(await fs.readFile(path.join(__dirname,'../../lib/tenancy/sql',file),'utf8'));if(file==='control-role.sql')roleCreated=true;}
  const password=randomBytes(24).toString('hex');await admin.query(`alter role moaon_control_app login password '${password}'`);
  database=createPostgresControlDatabase({connection:{host:'127.0.0.1',port:55437,database:name,user:'moaon_control_app',password,ssl:false},localTestOnly:true,connectionTimeoutMillis:15000,statementTimeoutMillis:15000,diagnostic(){}});
  const result=await checkCredentialInvariants({env:{MOAON_CONTROL_DB_DIAGNOSTIC:'1'},createControlDatabase:()=>({query:database.query,close:async()=>{}})});
  assert.equal(result.status,'CREDENTIAL_INVARIANTS_MATCH_REQUIRES_OPERATIONS',JSON.stringify(result));
  await admin.query('alter table moaon_control.provider_credentials drop constraint provider_credentials_revision_check;alter table moaon_control.provider_credentials add check(revision>0) not valid');
  const drift=await checkCredentialInvariants({env:{MOAON_CONTROL_DB_DIAGNOSTIC:'1'},createControlDatabase:()=>({query:database.query,close:async()=>{}})});
  assert.equal(drift.checks.find(x=>x.code==='REVISION_CHECK').status,'INVALID');
 }finally{
  const errors=[];for(const close of [()=>database?.close(),()=>admin?.end()])try{await close();}catch(e){errors.push(e);}
  let dropped=!created;if(created)try{await supervisor.query(`drop database "${name}"`);dropped=true;}catch(e){errors.push(e);}
  if(dropped&&roleCreated)try{await supervisor.query('drop role moaon_control_app');}catch(e){errors.push(e);}
  try{await supervisor.end();}catch(e){errors.push(e);}if(errors.length)throw Error('Disposable invariant fixture cleanup failed.');
 }
});
