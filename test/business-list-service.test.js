'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const auth=require('../lib/dashboard-auth.js');
const {createBusinessListService}=require('../lib/tenancy/business-list-service.js');
test('signed cookies, identity checks and actual membership SQL isolate two users',async()=>{
 const keys=['DASHBOARD_SESSION_SECRET','NODE_ENV','HARIN_DEV_AUTH_BYPASS'];
 const previous=keys.map(key=>process.env[key]);
 process.env.DASHBOARD_SESSION_SECRET='isolated-business-list-test-only-signing-key';
 process.env.NODE_ENV='test';delete process.env.HARIN_DEV_AUTH_BYPASS;
 const database=new PGlite();
 try{
  await database.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/control-plane.sql'),'utf8'));
  const users=[1,2].map(n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  const tenants=[1,2].map(n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  const sessions=users.map((userId,i)=>{
   const id=`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
   const token=auth.createSessionToken({sessionId:id,userId,expiresAt:'2099-01-01T00:00:00.000Z'});
   return {token,id,user_id:userId,username:'test-owner',display_name:'시험',role:'OWNER',expires_at:'2099-01-01T00:00:00.000Z',revoked_at:null,last_seen_at:'2026-09-08T00:00:00Z',token_hash:auth.tokenHash(token)};
  });
  for(let i=0;i<2;i++){
   await database.query('insert into moaon_control.tenants(id,display_name,status) values($1,$2,$3)',[tenants[i],`시험 사업장 ${i+1}`,'ACTIVE']);
   await database.query('insert into moaon_control.memberships(tenant_id,user_id,role,status,version) values($1,$2,$3,$4,$5)',[tenants[i],users[i],'OWNER','ACTIVE',1]);
  }
  let active=true;
  const identityDb={from(table){const filters={};return {
   select(){return this;},eq(key,value){filters[key]=value;return this;},
   async maybeSingle(){
    if(table==='dashboard_sessions')return {data:sessions.find(row=>row.id===filters.id&&row.token_hash===filters.token_hash)||null,error:null};
    assert.equal(table,'dashboard_users');
    return {data:users.includes(filters.user_id)?{user_id:filters.user_id,email:filters.user_id+'@example.com',active}:null,error:null};
   },
  };}};
  const authAdmin={async getUserById(id){return {data:{user:{id,email:id+'@example.com',is_anonymous:false,email_confirmed_at:'2020-01-01T00:00:00Z',banned_until:null,deleted_at:null}},error:null};}};
  const handle=createBusinessListService({database,identityDb,authAdmin});
  const send=token=>handle(new Request('https://hub.example/api/moaon/businesses',{headers:{cookie:'harin_dashboard_session='+token}}));
  const responses=await Promise.all(sessions.map(row=>send(row.token)));
  for(let i=0;i<2;i++){
   assert.equal(responses[i].status,200);
   assert.deepEqual(await responses[i].json(),{ok:true,businesses:[{tenantId:tenants[i],displayName:`시험 사업장 ${i+1}`,role:'OWNER',membershipVersion:1}]});
  }
  await database.query("update moaon_control.memberships set status='REMOVED' where user_id=$1",[users[0]]);
  assert.deepEqual(await (await send(sessions[0].token)).json(),{ok:true,businesses:[]});
  assert.equal((await (await send(sessions[1].token)).json()).businesses.length,1);
  sessions[1].revoked_at='2026-09-08T00:00:00Z';assert.equal((await send(sessions[1].token)).status,401);
  const [payload,signature]=sessions[0].token.split('.');
  const changed=(signature[0]==='a'?'b':'a')+signature.slice(1);
  assert.equal((await send(payload+'.'+changed)).status,401);
  active=false;assert.equal((await send(sessions[0].token)).status,401);
 }finally{
  await database.close();keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
 }
});
test('partial server configuration cannot silently become a working service',()=>{
 for(const configuration of [undefined,{}, {database:{}}])assert.throws(()=>createBusinessListService(configuration));
});
