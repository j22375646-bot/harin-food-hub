'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('active assistant credentials renew without reviving invalid access',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema moaon_control;
 create table moaon_control.tenants(id uuid primary key,status text);
 create table dashboard_users(user_id uuid primary key,role text,active boolean);
 create table dashboard_sessions(id uuid,user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz,role text);
 create table moaon_control.memberships(tenant_id uuid,user_id uuid,version int,status text,role text);
 insert into moaon_control.tenants values('a3452bca-e259-40ed-a93d-b8bcc5c1b9e0','ACTIVE');
 insert into dashboard_users values('11111111-1111-4111-8111-111111111111','OWNER',true);
 insert into moaon_control.memberships select id,'11111111-1111-4111-8111-111111111111',1,'ACTIVE','OWNER' from moaon_control.tenants;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260915171752_moaon_assistant_access.sql','utf8'));
 const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_moaon_assistant_access_auto_renew.sql'));
 assert.ok(migration,'renewal migration exists');
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 await db.exec(`insert into moaon_assistant_access(tenant_id,owner_id,membership_version,revision,token_hash,expires_at,scopes) select id,'11111111-1111-4111-8111-111111111111',1,2,repeat('a',64),now()+interval '6 days',array['orders'] from moaon_control.tenants`);
 const verify=(consume=true,hash='a'.repeat(64))=>db.query('select moaon_assistant_access_verify($1,$2) v',[hash,consume]);
 const state=async()=>(await db.query('select expires_at,revision,scopes,requests,token_hash from moaon_assistant_access')).rows[0];
 const before=await state();await verify(false);assert.deepEqual(await state(),before);
 const result=await verify();let renewed=await state();
 assert.ok(new Date(renewed.expires_at)-Date.now()>29*86400000);
 assert.equal(renewed.revision,2);assert.deepEqual(renewed.scopes,['orders']);assert.equal(renewed.token_hash,before.token_hash);
 assert.equal(result.rows[0].v.revision,2);
 await verify();assert.equal((await state()).expires_at.getTime(),renewed.expires_at.getTime());
 for(const mutation of ["expires_at=now()-interval '1 second'","revoked_at=now()","membership_version=2","requests=10,window_start=now()"]){
  await db.exec('begin');await db.exec("update moaon_assistant_access set expires_at=now()+interval '6 days'");await db.exec('update moaon_assistant_access set '+mutation);
  await assert.rejects(verify(),/ASSISTANT_AUTH_REQUIRED|ASSISTANT_RATE_LIMITED/);await db.exec('rollback');
 }
 for(const mutation of ["update dashboard_users set active=false","update dashboard_users set role='MEMBER'","update moaon_control.memberships set status='INACTIVE'","update moaon_control.memberships set version=2","update moaon_control.tenants set status='INACTIVE'"]){
  await db.exec('begin');await db.exec(mutation);await assert.rejects(verify(),/ASSISTANT_AUTH_REQUIRED/);await db.exec('rollback');
 }
 await assert.rejects(verify(true,'b'.repeat(64)),/ASSISTANT_AUTH_REQUIRED/);
 await db.exec('set role anon');await assert.rejects(verify(),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
