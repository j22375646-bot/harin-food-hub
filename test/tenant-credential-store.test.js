const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {createCredentialSessionFence}=require('../lib/tenancy/credential-session-fence.js');
const {setupCredentialAuth,sessionId}=require('./helpers/credential-auth-fixture.js');
const {createCredentialCipher}=require('../lib/tenancy/credential-envelope.js');
let createCredentialStore;try{({createCredentialStore}=require('../lib/tenancy/credential-store.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const tenantId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
test('real SQL owner save encrypts, rejects stale revisions and rolls back revoked sessions',async t=>{
 assert.equal(typeof createCredentialStore,'function');const db=new PGlite();t.after(()=>db.close());await setupCredentialAuth(db);
 await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/control-plane.sql'),'utf8'));
 await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/credential-store.sql'),'utf8'));
 await db.query("insert into moaon_control.tenants(id,display_name,status) values($1,'test','ACTIVE')",[tenantId]);
 await db.query("insert into moaon_control.memberships(tenant_id,user_id,role,status,version) values($1,$2,'OWNER','ACTIVE',1)",[tenantId,userId]);
 let reads=0,denySecond=false;const cipher=createCredentialCipher({activeKeyId:'v1',keys:{v1:Buffer.alloc(32,1).toString('base64')}});
 const store=createCredentialStore({database:db,cipher,sessionFence:createCredentialSessionFence(),verifySession:async()=>{if(denySecond&&++reads===2)throw Error('secret');return {id:sessionId,userId,expiresAt:'2099-01-01T00:00:00Z'};}});
 const input={tenantId,provider:'NAVER',expectedRevision:0,fields:{clientId:'test',clientSecret:'never-plaintext'}};
 await db.exec('update dashboard_sessions set revoked_at=clock_timestamp()');
 await assert.rejects(store.save('test.signature',input),{code:'CREDENTIAL_ACCESS_DENIED'});
 await db.exec('update dashboard_sessions set revoked_at=null');
 const result=await store.save('test.signature',input);assert.deepEqual(result,{tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'});
 await assert.rejects(store.save('test.signature',{...input,tenantId:'33333333-3333-4333-8333-333333333333'}),{code:'CREDENTIAL_ACCESS_DENIED'});
 await assert.rejects(store.save('test.signature',{...input,role:'OWNER'}),{code:'CREDENTIAL_INVALID'});
 await assert.rejects(store.save('test.signature',{...input,expectedRevision:-1}),{code:'CREDENTIAL_INVALID'});
 const row=(await db.query('select * from moaon_control.provider_credentials')).rows[0];assert.doesNotMatch(JSON.stringify(row),/never-plaintext/);assert.equal(cipher.open({tenantId,provider:'NAVER',revision:1},row.envelope).clientSecret,'never-plaintext');
 await assert.rejects(store.save('test.signature',input),{code:'CREDENTIAL_CONFLICT'});
 for(const role of ['VIEWER','OPERATOR']){await db.query('update moaon_control.memberships set role=$1',[role]);await assert.rejects(store.save('test.signature',{...input,expectedRevision:1}),{code:'CREDENTIAL_ACCESS_DENIED'});}
 await db.exec("update moaon_control.memberships set role='OWNER'");denySecond=true;await assert.rejects(store.save('test.signature',{...input,expectedRevision:1}));assert.equal((await db.query('select revision from moaon_control.provider_credentials')).rows[0].revision,1);
 denySecond=false;const results=await Promise.allSettled([store.save('test.signature',{...input,expectedRevision:1}),store.save('test.signature',{...input,expectedRevision:1})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const {createCredentialSaveRequest}=require('../lib/tenancy/credential-request.js');
 const handle=createCredentialSaveRequest({admit:async()=>({allowed:true}),origin:'https://hub.example',save:store.save});
 const response=await handle(new Request('https://hub.example/api/moaon/credentials',{method:'POST',headers:{origin:'https://hub.example','content-type':'application/json',cookie:'harin_dashboard_session=test.signature'},body:JSON.stringify({...input,expectedRevision:2})}));
 assert.equal(response.status,200);assert.equal((await response.json()).revision,3);assert.equal((await db.query('select revision from moaon_control.provider_credentials')).rows[0].revision,3);
 await db.exec(`create function expire_credential_session() returns trigger language plpgsql as $$begin
  update dashboard_sessions set expires_at=clock_timestamp()-interval '1 second'; return NEW; end $$;
  create trigger expire_credential_session after update on moaon_control.provider_credentials for each row execute function expire_credential_session()`);
 await assert.rejects(store.save('test.signature',{...input,expectedRevision:3}),{code:'CREDENTIAL_ACCESS_DENIED'});
 assert.equal((await db.query('select revision from moaon_control.provider_credentials')).rows[0].revision,3);
 await db.exec('drop trigger expire_credential_session on moaon_control.provider_credentials');
 await db.exec('create role credential_public nologin; set role credential_public');await assert.rejects(db.query('select * from moaon_control.provider_credentials'));await db.exec('reset role');
});
