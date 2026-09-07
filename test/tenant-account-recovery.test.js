'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {createAccountRecovery,AccountRecoveryError}=require('../lib/tenancy/account-recovery.js');
const {createAuthSessionStore}=require('../lib/tenancy/auth-session-store.js');

const ID='20000000-0000-4000-8000-000000000001',OTHER='20000000-0000-4000-8000-000000000002';
const OP='50000000-0000-4000-8000-000000000001';
const identity={id:ID,email:'owner@example.test',emailConfirmedAt:'2026-09-08T00:00:00.000Z'};
const profile={userId:ID,email:'owner@example.test',active:true};
function setup(overrides={}){
  const calls=[];
  const handle={identity,updatePassword:async p=>{calls.push(['update',p]);return identity;},signOutGlobal:async()=>calls.push(['signout']),currentIdentity:async()=>identity,dispose:async()=>calls.push(['dispose'])};
  const deps={
    provider:{requestRecoveryEmail:async e=>calls.push(['mail',e]),confirmEmail:async()=>({ok:true,identity}),openRecovery:async()=>handle},
    profiles:{findActiveByEmail:async e=>e===profile.email?profile:null,getByUserId:async id=>id===ID?profile:null},
    sessionStore:{beginPasswordChange:async x=>calls.push(['begin',x]),completePasswordChange:async x=>calls.push(['complete',x])},
    requestLimit:async x=>{calls.push(['limit',x.kind]);return {allowed:true};},randomUUID:()=>OP,timeoutMs:1000,now:()=>Date.parse('2026-09-08T00:00:00.000Z'),...overrides
  };
  return {service:createAccountRecovery(deps),calls,handle,deps};
}

test('mail request is limited first, uses only active DB profile, and has one enumeration-safe response',async()=>{
  for(const mode of ['active','absent','inactive','mail-error']){
    const {service,calls,deps}=setup();
    if(mode==='absent')deps.profiles.findActiveByEmail=async()=>null;
    if(mode==='inactive')deps.profiles.findActiveByEmail=async()=>({...profile,active:false});
    if(mode==='mail-error')deps.provider.requestRecoveryEmail=async()=>{throw Error('SMTP secret');};
    assert.deepEqual(await service.requestRecovery({email:' OWNER@example.test '}),{status:'ACCEPTED'});
    assert.equal(calls[0][0],'limit');
    assert.equal(calls.some(c=>c[0]==='mail'),mode==='active');
  }
});

test('limiter failure is unavailable without revealing whether an account exists',async()=>{
  const {service}=setup({requestLimit:async()=>{throw Error('redis secret');}});
  await assert.rejects(()=>service.requestRecovery({email:'owner@example.test'}),e=>e instanceof AccountRecoveryError&&e.code==='RECOVERY_UNAVAILABLE'&&!e.message.includes('secret'));
});

test('confirmation fixes signup semantics at provider seam and validates current DB binding',async()=>{
  const {service}=setup();
  assert.deepEqual(await service.confirmEmail({tokenHash:'signup-token'}),{status:'CONFIRMED',membershipCreated:false,requiresFreshLogin:true});
  const bad=setup({profiles:{findActiveByEmail:async()=>null,getByUserId:async()=>({...profile,email:'changed@example.test'})}}).service;
  await assert.rejects(()=>bad.confirmEmail({tokenHash:'signup-token'}),e=>e.code==='RECOVERY_REJECTED');
});

test('successful recovery uses server UUID and exact fenced write order, returning no token or session',async()=>{
  const {service,calls}=setup();
  const result=await service.completeRecovery({tokenHash:'recovery-token',newPassword:'twelve-chars!'});
  assert.deepEqual(result,{status:'COMPLETED',requiresFreshLogin:true});
  assert.deepEqual(calls.map(c=>c[0]),['limit','begin','update','signout','complete','dispose']);
  assert.deepEqual(calls.find(c=>c[0]==='begin')[1],{userId:ID,operationId:OP});
  assert.equal(JSON.stringify(result).includes('token'),false);
});

test('password and token validation happen before external work without trimming password',async()=>{
  for(const input of [
    {tokenHash:'x',newPassword:'short'},
    {tokenHash:' x ',newPassword:'twelve-chars!'},
    {tokenHash:'x',newPassword:'a'.repeat(129)},
  ]){
    const {service,calls}=setup();
    await assert.rejects(()=>service.completeRecovery(input),e=>e.code==='RECOVERY_REJECTED');
    assert.equal(calls.length,0);
  }
});

test('identity mismatch or inactive profile never starts the SQL fence',async()=>{
  for(const overrides of [
    {provider:{requestRecoveryEmail:async()=>{},confirmEmail:async()=>{},openRecovery:async()=>({identity:{...identity,email:'other@example.test'},dispose:async()=>{}})}},
    {profiles:{findActiveByEmail:async()=>null,getByUserId:async()=>({...profile,active:false})}},
  ]){
    const {service,calls}=setup(overrides);
    await assert.rejects(()=>service.completeRecovery({tokenHash:'x',newPassword:'twelve-chars!'}),e=>e.code==='RECOVERY_REJECTED');
    assert.equal(calls.some(c=>c[0]==='begin'),false);
  }
});

test('any failure or timeout after fence begins stays blocked and never completes or continues late',async()=>{
  let resolveUpdate; const late=new Promise(r=>{resolveUpdate=r;});
  const {service,calls}=setup({timeoutMs:10,provider:{requestRecoveryEmail:async()=>{},confirmEmail:async()=>{},openRecovery:async()=>({identity,updatePassword:()=>late,signOutGlobal:async()=>calls.push(['signout']),currentIdentity:async()=>identity,dispose:async()=>calls.push(['dispose'])})}});
  assert.deepEqual(await service.completeRecovery({tokenHash:'x',newPassword:'twelve-chars!'}),{status:'REVIEW_REQUIRED'});
  resolveUpdate(identity); await new Promise(r=>setTimeout(r,20));
  assert.equal(calls.some(c=>c[0]==='signout'||c[0]==='complete'),false);
});

test('provider signout failure, changed identity, and fence errors never unlock',async()=>{
  for(const point of ['begin','signout','changed','complete']){
    const {service,calls,deps}=setup();
    if(point==='begin')deps.sessionStore.beginPasswordChange=async()=>{throw Error('db');};
    if(point==='signout')deps.provider.openRecovery=async()=>({...setup().handle,signOutGlobal:async()=>{throw Error('provider');}});
    if(point==='changed')deps.provider.openRecovery=async()=>({...setup().handle,currentIdentity:async()=>({...identity,email:'changed@example.test'})});
    if(point==='complete')deps.sessionStore.completePasswordChange=async()=>{throw Error('db');};
    const run=service.completeRecovery({tokenHash:'x',newPassword:'twelve-chars!'});
    assert.deepEqual(await run,{status:'REVIEW_REQUIRED'});
    assert.equal(calls.filter(c=>c[0]==='complete').length,0);
  }
});

test('PGlite integration revokes prior session and old ticket while preserving another account',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);`);
    await db.exec(await fs.readFile(path.join(__dirname,'../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql'),'utf8'));
    await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/auth-session-fence.sql'),'utf8'));
    await db.query('insert into auth.users values ($1),($2)',[ID,OTHER]);
    await db.query(`insert into dashboard_users(user_id,email,username,display_name,role) values ($1,'owner@example.test','owner','Owner','OWNER'),($2,'other@example.test','other','Other','VIEWER')`,[ID,OTHER]);
    const old='30000000-0000-4000-8000-000000000001',sid='40000000-0000-4000-8000-000000000001',otherSid='40000000-0000-4000-8000-000000000002';
    await db.query('select moaon_begin_login($1,$2)',[ID,old]); await db.query(`select moaon_issue_session($1,$2,$3,$4,clock_timestamp()+interval '1 hour')`,[ID,old,sid,'a'.repeat(64)]);
    await db.query(`insert into dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at) values ($1,$2,$3,'x','X','VIEWER',clock_timestamp()+interval '1 hour')`,[otherSid,OTHER,'b'.repeat(64)]);
    const rpcClient={rpc:async(name,args)=>{try{const vals=Object.values(args);const r=await db.query(`select public.${name}(${vals.map((_,i)=>'$'+(i+1)).join(',')}) as data`,vals);return {data:r.rows[0].data,error:null};}catch(error){return {data:null,error:{code:error.code,message:error.message}};}}};
    const profiles={findActiveByEmail:async()=>profile,getByUserId:async()=>profile};
    const {service}=setup({profiles,sessionStore:createAuthSessionStore({rpcClient}),randomUUID:()=>OP});
    await service.completeRecovery({tokenHash:'x',newPassword:'twelve-chars!'});
    const sessions=(await db.query('select user_id,revoked_at is not null revoked from dashboard_sessions order by user_id')).rows;
    assert.deepEqual(sessions,[{user_id:ID,revoked:true},{user_id:OTHER,revoked:false}]);
    await assert.rejects(()=>db.query(`select moaon_issue_session($1,$2,$3,$4,clock_timestamp()+interval '1 hour')`,[ID,old,'40000000-0000-4000-8000-000000000009','c'.repeat(64)]),/AUTH_TRANSITION_REJECTED/);
  }finally{await db.close();}
});
