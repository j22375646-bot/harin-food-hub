'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createSupabaseRecoveryProvider} = require('../lib/tenancy/supabase-recovery-provider.js');

const USER_ID='20000000-0000-4000-8000-000000000001';
const NOW=new Date(Math.floor(Date.now()/1000)*1000).toISOString();
const user={id:USER_ID,email:'owner@example.test',is_anonymous:false,deleted_at:null,banned_until:null,email_confirmed_at:NOW};
const NOW_SECONDS=Date.parse(NOW)/1000;
const session={access_token:'access-secret',refresh_token:'refresh-secret',expires_in:3600,expires_at:NOW_SECONDS+3600,user};

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
function requestedRefresh(calls){
  return calls.some(call=>{
    const raw=call.url||call.path;
    const grant=raw?new URL(raw,'https://provider.example.test').searchParams.get('grant_type'):null;
    return grant==='refresh_token'||call.body?.grant_type==='refresh_token';
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
    {...user,banned_until:new Date(Date.parse(NOW)+86_400_000).toISOString()},
  ];
  for(const invalid of cases){
    const p=provider(fixture({'POST /auth/v1/verify':{body:{...session,user:invalid}}}));
    await assert.rejects(()=>p.openRecovery('token'),e=>e.code==='RECOVERY_REJECTED');
  }
  const p=provider(fixture({'POST /auth/v1/verify':{body:session}}),{now:()=>Number.NaN});
  await assert.rejects(()=>p.openRecovery('token'),e=>e.code==='RECOVERY_UNAVAILABLE');
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

test('verified temporary session is cleaned when authoritative lookup fails or mismatches',async()=>{
  for(const adminResponse of [
    {status:503,body:{code:'provider_down',message:'internal secret'}},
    {body:{...user,email:'changed@example.test'}},
  ]){
    const calls=[];
    const p=provider(fixture({
      'POST /auth/v1/verify':{body:session},
      [`GET /auth/v1/admin/users/${USER_ID}`]:adminResponse,
      'POST /auth/v1/logout?scope=local':{},
    },calls));
    await assert.rejects(()=>p.openRecovery('token'),e=>['RECOVERY_REJECTED','RECOVERY_UNAVAILABLE'].includes(e.code)&&!e.message.includes('secret'));
    const cleanup=calls.find(c=>c.url.includes('scope=local'));
    assert.ok(cleanup,'verified temporary session must be cleaned');
    assert.equal(cleanup.authorization,'Bearer access-secret');
  }
});

test('throwing provider clock is sanitized and cleans a verified temporary session',async()=>{
  const calls=[];
  const p=provider(fixture({'POST /auth/v1/verify':{body:session},'POST /auth/v1/logout?scope=local':{}},calls),{now:()=>{throw Error('clock secret');}});
  await assert.rejects(()=>p.openRecovery('token'),e=>e.code==='RECOVERY_UNAVAILABLE'&&!e.message.includes('secret'));
  assert.ok(calls.some(c=>c.url.includes('scope=local')));
});

test('SDK update timeout aborts transport and cannot advance to global signout',async()=>{
  const calls=[];let updateAborted=false;
  const fetch=async(url,init={})=>{
    const u=new URL(url);calls.push(u.pathname+u.search);
    if(u.pathname.endsWith('/verify'))return new Response(JSON.stringify(session),{status:200,headers:{'content-type':'application/json'}});
    if(u.pathname.includes('/admin/users/'))return new Response(JSON.stringify(user),{status:200,headers:{'content-type':'application/json'}});
    if(u.pathname.endsWith('/user'))return new Promise((_r,reject)=>init.signal.addEventListener('abort',()=>{updateAborted=true;reject(Error('update secret'));}));
    return new Response(null,{status:200});
  };
  const p=provider(fetch,{timeoutMs:10}),handle=await p.openRecovery('token');
  await assert.rejects(()=>handle.updatePassword('twelve-chars!'),e=>e.code==='RECOVERY_UNAVAILABLE');
  assert.equal(updateAborted,true);
  assert.equal(calls.some(value=>value.includes('scope=global')),false);
  await handle.dispose();
});

test('SDK admin global-signout timeout aborts and never advances to authoritative recheck',async()=>{
  const calls=[];let signoutAborted=false,adminReads=0;
  const fetch=async(url,init={})=>{
    const u=new URL(url);calls.push(u.pathname+u.search);
    if(u.pathname.endsWith('/verify'))return new Response(JSON.stringify(session),{status:200,headers:{'content-type':'application/json'}});
    if(u.pathname.includes('/admin/users/')){adminReads++;return new Response(JSON.stringify(user),{status:200,headers:{'content-type':'application/json'}});}
    if(u.pathname.endsWith('/user'))return new Response(JSON.stringify({user}),{status:200,headers:{'content-type':'application/json'}});
    if(u.search.includes('scope=global'))return new Promise((_r,reject)=>init.signal.addEventListener('abort',()=>{signoutAborted=true;reject(Error('signout secret'));}));
    return new Response(null,{status:200});
  };
  const p=provider(fetch,{timeoutMs:10}),handle=await p.openRecovery('token');
  await handle.updatePassword('twelve-chars!');
  await assert.rejects(()=>handle.signOutGlobal(),e=>e.code==='RECOVERY_UNAVAILABLE');
  assert.equal(signoutAborted,true);
  assert.equal(adminReads,1,'failed signout must not trigger a recheck');
  await handle.dispose();
});

test('SDK error-bearing update and global-signout responses are sanitized failures',async()=>{
  for(const failurePath of ['update','signout']){
    const calls=[];
    const fetch=async(url,init={})=>{
      const u=new URL(url);calls.push(u.pathname+u.search);
      if(u.pathname.endsWith('/verify'))return new Response(JSON.stringify(session),{status:200,headers:{'content-type':'application/json'}});
      if(u.pathname.includes('/admin/users/'))return new Response(JSON.stringify(user),{status:200,headers:{'content-type':'application/json'}});
      if(u.pathname.endsWith('/user'))return new Response(JSON.stringify(failurePath==='update'?{code:'provider_error',message:'update secret'}:{user}),{status:failurePath==='update'?500:200,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
      if(u.search.includes('scope=global'))return new Response(JSON.stringify({code:'provider_error',message:'signout secret'}),{status:failurePath==='signout'?500:200,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
      return new Response(null,{status:200});
    };
    const handle=await provider(fetch).openRecovery('token');
    if(failurePath==='update'){
      await assert.rejects(()=>handle.updatePassword('twelve-chars!'),e=>e.code==='RECOVERY_UNAVAILABLE'&&!e.message.includes('secret'));
      assert.equal(calls.some(value=>value.includes('scope=global')),false);
    }else{
      await handle.updatePassword('twelve-chars!');
      await assert.rejects(()=>handle.signOutGlobal(),e=>e.code==='RECOVERY_UNAVAILABLE'&&!e.message.includes('secret'));
    }
    await handle.dispose();
  }
});

test('verified sessions require a finite expiry beyond the SDK 90-second refresh margin',async()=>{
  const expiries=[
    {expires_at:1,expires_in:-1},
    {expires_at:'not-a-number',expires_in:3600},
    {expires_at:null,expires_in:null},
    {expires_at:1e308,expires_in:3600},
    {expires_at:NOW_SECONDS+90,expires_in:90},
  ];
  for(const expiry of expiries){
    const calls=[];
    const p=provider(fixture({'POST /auth/v1/verify':{body:{...session,...expiry}},'POST /auth/v1/logout?scope=local':{}},calls));
    await assert.rejects(()=>p.openRecovery('token'),e=>e.code==='RECOVERY_REJECTED');
    assert.equal(calls.some(c=>c.url.includes('/admin/users/')),false);
    assert.equal(requestedRefresh(calls),false);
  }
});

test('session expiry is rechecked immediately before update without an implicit refresh',async()=>{
  let clock=Date.parse(NOW),puts=0;const calls=[];
  const near={...session,expires_at:NOW_SECONDS+91,expires_in:91};
  const p=provider(fixture({'POST /auth/v1/verify':{body:near},[`GET /auth/v1/admin/users/${USER_ID}`]:{body:user},'POST /auth/v1/logout?scope=local':{}},calls),{now:()=>clock});
  const handle=await p.openRecovery('token');clock+=2000;
  await assert.rejects(()=>handle.updatePassword('twelve-chars!'),e=>e.code==='RECOVERY_REJECTED');
  puts=calls.filter(c=>c.method==='PUT').length;
  assert.equal(puts,0);
  assert.equal(requestedRefresh(calls),false);
  await handle.dispose();
});

test('verifyOtp response arriving after provider timeout is locally revoked exactly once',async()=>{
  const calls=[];let release;
  const fetch=async(url,init={})=>{
    const u=new URL(url);calls.push({path:u.pathname+u.search,body:init.body?JSON.parse(init.body):null,authorization:init.headers?.Authorization||init.headers?.authorization});
    if(u.pathname.endsWith('/verify'))return new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify(session),{status:200,headers:{'content-type':'application/json'}}));});
    if(u.pathname.includes('/admin/users/'))return new Response(JSON.stringify(user),{status:200,headers:{'content-type':'application/json'}});
    return new Response(null,{status:200});
  };
  const p=provider(fetch,{timeoutMs:10});
  await assert.rejects(()=>p.openRecovery('token'),e=>e.code==='RECOVERY_UNAVAILABLE');
  release();await new Promise(r=>setTimeout(r,30));
  const cleanup=calls.filter(c=>c.path.includes('scope=local'));
  assert.equal(cleanup.length,1);
  assert.equal(cleanup[0].authorization,'Bearer access-secret');
  assert.equal(calls.some(c=>c.path.includes('/admin/users/')),false);
  assert.equal(requestedRefresh(calls),false);
});
