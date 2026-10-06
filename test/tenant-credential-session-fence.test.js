const test=require('node:test');
const assert=require('node:assert/strict');
const {createCredentialStore}=require('../lib/tenancy/credential-store.js');
test('credential store refuses composition without same-transaction session fence',()=>{
 assert.throws(()=>createCredentialStore({database:{transaction(){}},cipher:{seal(){}},verifySession:async()=>null}),TypeError);
});
const {PGlite}=require('@electric-sql/pglite');
const {setupCredentialAuth,sessionId,userId,credential}=require('./helpers/credential-auth-fixture.js');
let createCredentialSessionFence;try{({createCredentialSessionFence}=require('../lib/tenancy/credential-session-fence.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('same-transaction fence rejects revoked sessions even when external identity is valid',async t=>{
 assert.equal(typeof createCredentialSessionFence,'function');
 const db=new PGlite();t.after(()=>db.close());await setupCredentialAuth(db);
 await db.exec('update dashboard_sessions set revoked_at=clock_timestamp()');
 await assert.rejects(db.transaction(tx=>createCredentialSessionFence().lock(tx,{actor:{id:sessionId,userId},credential})),{code:'CREDENTIAL_ACCESS_DENIED'});
});
test('real auth schema rejects malformed identities and every stale session binding',async t=>{
 const db=new PGlite();t.after(()=>db.close());await setupCredentialAuth(db);
 const fence=createCredentialSessionFence(),actor={id:sessionId,userId};
 for(const bad of [null,{...actor,id:'session'},{...actor,userId:'owner'},{...actor,id:null}]){
  await assert.rejects(db.transaction(tx=>fence.lock(tx,{actor:bad,credential})),{code:'CREDENTIAL_ACCESS_DENIED'});
 }
 for(const [name,sql,args] of [
  ['missing account','delete from moaon_auth.account_state'],
  ['blocked account',"update moaon_auth.account_state set blocked=true,operation_id='55555555-5555-4555-8555-555555555555'"],
  ['inactive profile','update dashboard_users set active=false'],
  ['missing session','delete from dashboard_sessions'],
  ['expired session',"update dashboard_sessions set expires_at=clock_timestamp()-interval '1 second'"],
  ['infinite expiry',"update dashboard_sessions set expires_at='infinity'"],
  ['wrong token',"update dashboard_sessions set token_hash=repeat('b',64)"],
 ])await t.test(name,async()=>{
  await assert.rejects(db.transaction(async tx=>{await tx.query(sql,args);await fence.lock(tx,{actor,credential});}),{code:'CREDENTIAL_ACCESS_DENIED'});
 });
 await assert.rejects(db.transaction(tx=>fence.lock(tx,{actor:{...actor,userId:'33333333-3333-4333-8333-333333333333'},credential})),{code:'CREDENTIAL_ACCESS_DENIED'});
 await assert.rejects(db.transaction(async tx=>{
  await tx.query("insert into auth.users values('33333333-3333-4333-8333-333333333333')");
  await tx.query("insert into dashboard_users(user_id,email,username,display_name,role) values('33333333-3333-4333-8333-333333333333','other@example.test','other','Other','OWNER')");
  await tx.query("update dashboard_sessions set user_id='33333333-3333-4333-8333-333333333333'");
  await fence.lock(tx,{actor,credential});
 }),{code:'CREDENTIAL_ACCESS_DENIED'});
 await db.transaction(async tx=>{const held=await fence.lock(tx,{actor,credential});await held.assertCurrent();});
});
