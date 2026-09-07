'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createSupabaseRecoveryProvider} = require('../lib/tenancy/supabase-recovery-provider.js');

const USER_ID='20000000-0000-4000-8000-000000000001';
const NOW='2026-09-08T00:00:00.000Z';
const user={id:USER_ID,email:'owner@example.test',is_anonymous:false,deleted_at:null,banned_until:null,email_confirmed_at:NOW};
const session={access_token:'access-secret',refresh_token:'refresh-secret',expires_in:3600,user};

function fixture(routes, calls=[]){
  return async (url,init={})=>{
    const body=init.body?JSON.parse(init.body):null;
    calls.push({url:String(url),method:init.method,body,authorization:init.headers?.Authorization||init.headers?.authorization});
    const key=`${init.method||'GET'} ${new URL(url).pathname}${new URL(url).search}`;
    const response=routes[key];
    if(!response) throw Error(`unexpected ${key}`);
    return new Response(response.body===undefined?null:JSON.stringify(response.body),{status:response.status||200,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
  };
}
function provider(fetch,extra={}){
  return createSupabaseRecoveryProvider({
    url:'https://project.supabase.co',publishableKey:'publishable-test',serviceRoleKey:'service-test',
    callbackUrl:'https://app.example.test/auth/callback',fetch,timeoutMs:1000,now:()=>Date.parse(NOW),...extra
  });
}

test('SDK wire contract fixes callback and creates a fresh nonpersistent client per operation',async()=>{
  const calls=[];
  const p=provider(fixture({
    'POST /auth/v1/recover?redirect_to=https%3A%2F%2Fapp.example.test%2Fauth%2Fcallback':{body:{}},
    'POST /auth/v1/verify':{body:session},
    [`GET /auth/v1/admin/users/${USER_ID}`]:{body:user},
    'POST /auth/v1/logout?scope=local':{},
  },calls));
  assert.deepEqual(await p.requestRecoveryEmail('owner@example.test'),{ok:true});
  const confirmed=await p.confirmEmail('token-hash');
  assert.deepEqual(confirmed,{ok:true,identity:{id:USER_ID,email:'owner@example.test',emailConfirmedAt:NOW}});
  assert.deepEqual(calls[0].body,{email:'owner@example.test',code_challenge:null,code_challenge_method:null,gotrue_meta_security:{}});
  assert.deepEqual(calls[1].body,{token_hash:'token-hash',type:'signup',gotrue_meta_security:{}});
  assert.equal(calls[2].authorization,'Bearer service-test');
  assert.equal(calls[3].authorization,'Bearer access-secret');
  assert.equal(JSON.stringify(confirmed).includes('secret'),false);
});

test('recovery handle uses recovery OTP, updates password, then admin global-signout without exposing tokens',async()=>{
  const calls=[];
  const p=provider(fixture({
    'POST /auth/v1/verify':{body:session},
    [`GET /auth/v1/admin/users/${USER_ID}`]:{body:user},
    'PUT /auth/v1/user':{body:{user}},
    'POST /auth/v1/logout?scope=global':{},
    'POST /auth/v1/logout?scope=local':{},
  },calls));
  const handle=await p.openRecovery('recovery-token');
  assert.deepEqual(handle.identity,{id:USER_ID,email:'owner@example.test',emailConfirmedAt:NOW});
  assert.equal(JSON.stringify(handle).includes('secret'),false);
  assert.deepEqual(await handle.updatePassword('new-password-123'),handle.identity);
  await handle.signOutGlobal();
  await handle.dispose();
  assert.deepEqual(calls.filter(c=>c.url.includes('/verify'))[0].body,{token_hash:'recovery-token',type:'recovery',gotrue_meta_security:{}});
  assert.deepEqual(calls.find(c=>c.method==='PUT').body,{password:'new-password-123',code_challenge:null,code_challenge_method:null});
  assert.equal(calls.find(c=>c.url.includes('scope=global')).authorization,'Bearer access-secret');
});

test('SDK error-bearing responses and malformed identities fail closed with sanitized errors',async()=>{
  for(const body of [
    {status:400,body:{code:'otp_expired',message:'token secret leaked'}},
    {body:{...session,user:{...user,email_confirmed_at:'2026-02-31T00:00:00Z'}}},
    {body:{...session,user:{...user,is_anonymous:true}}},
  ]){
    const p=provider(fixture({'POST /auth/v1/verify':body}));
    await assert.rejects(()=>p.openRecovery('bounded-token'),e=>e.code==='RECOVERY_REJECTED'&&!e.message.includes('secret'));
  }
});

test('unverified, deleted, banned, mismatched, and invalid-clock identities never verify',async()=>{
  const cases=[
    {...user,email_confirmed_at:null},
    {...user,deleted_at:NOW},
    {...user,banned_until:'2026-09-09T00:00:00.000Z'},
  ];
  for(const invalid of cases){
    const p=provider(fixture({'POST /auth/v1/verify':{body:{...session,user:invalid}}}));
    await assert.rejects(()=>p.openRecovery('token'),e=>e.code==='RECOVERY_REJECTED');
  }
  const p=provider(fixture({'POST /auth/v1/verify':{body:session}}),{now:()=>Number.NaN});
  await assert.rejects(()=>p.openRecovery('token'),e=>e.code==='RECOVERY_REJECTED');
});

test('concurrent recovery handles retain isolated session tokens',async()=>{
  const secondId='20000000-0000-4000-8000-000000000002';
  const secondUser={...user,id:secondId,email:'second@example.test'};
  const calls=[];
  const fetch=async(url,init={})=>{
    const u=new URL(url),body=init.body?JSON.parse(init.body):{};
    calls.push({path:u.pathname+u.search,authorization:init.headers?.Authorization||init.headers?.authorization,body});
    let payload={};
    if(u.pathname.endsWith('/verify'))payload=body.token_hash==='one'?session:{...session,access_token:'access-second-secret',refresh_token:'refresh-second-secret',user:secondUser};
    else if(u.pathname.includes('/admin/users/'))payload=u.pathname.endsWith(secondId)?secondUser:user;
    else if(u.pathname.endsWith('/user'))payload=(init.headers?.Authorization||'').includes('second')?{user:secondUser}:{user};
    return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
  };
  const p=provider(fetch);
  const [one,two]=await Promise.all([p.openRecovery('one'),p.openRecovery('two')]);
  await Promise.all([one.updatePassword('password-one!'),two.updatePassword('password-two!')]);
  await Promise.all([one.signOutGlobal(),two.signOutGlobal()]);
  const global=calls.filter(c=>c.path.includes('scope=global')).map(c=>c.authorization).sort();
  assert.deepEqual(global,['Bearer access-second-secret','Bearer access-secret']);
  assert.equal(JSON.stringify([one,two]).includes('secret'),false);
});

test('requires explicit HTTPS configuration and permits loopback HTTP only when test-enabled',()=>{
  const base={publishableKey:'p',serviceRoleKey:'s',callbackUrl:'https://app.test/callback',fetch:async()=>{},timeoutMs:10};
  assert.throws(()=>createSupabaseRecoveryProvider(base),TypeError);
  assert.throws(()=>createSupabaseRecoveryProvider({...base,url:'https://x.test',callbackUrl:'http://localhost:3000/callback'}),TypeError);
  assert.doesNotThrow(()=>createSupabaseRecoveryProvider({...base,url:'http://127.0.0.1:54321',callbackUrl:'http://localhost:3000/callback',allowInsecureLoopback:true}));
});

test('timed-out SDK fetch is aborted and cannot be mistaken for success',async()=>{
  let aborted=false;
  const fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('late secret'));}));
  const p=provider(fetch,{timeoutMs:10});
  await assert.rejects(()=>p.requestRecoveryEmail('owner@example.test'),e=>e.code==='RECOVERY_UNAVAILABLE');
  assert.equal(aborted,true);
});
