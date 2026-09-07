'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthSessionStore, AuthSessionStoreError } = require('../lib/tenancy/auth-session-store.js');
const id = '20000000-0000-4000-8000-000000000001';
const ticket = '30000000-0000-4000-8000-000000000001';
const session = '40000000-0000-4000-8000-000000000001';
const expiry = '2026-09-08T06:00:00.000Z';
const window = Object.freeze({issuedAt:'2026-09-08T12:00:00.000Z',expiresAt:'2026-09-09T00:00:00.000Z'});

test('requires an explicit RPC client, never an ambient production connection', () => {
  for (const opts of [undefined, {}, {rpcClient:{}}, {rpcClient:{rpc:1}}]) {
    assert.throws(() => createAuthSessionStore(opts), TypeError);
  }
});

test('calls fixed RPC names with exact parameters; no secrets or SQL forwarded', async () => {
  const calls=[];
  const rpcClient={rpc:async (name,args) => { calls.push({name,args}); return {data:name==='moaon_get_session_window'?window:true,error:null}; }};
  const store=createAuthSessionStore({rpcClient});
  assert.ok(Object.isFrozen(store));
  await store.beginLogin({userId:id,ticketId:ticket});
  assert.deepEqual(await store.getSessionWindow({userId:id,ticketId:ticket}),window);
  await store.issueSession({userId:id,ticketId:ticket,sessionId:session,tokenHash:'a'.repeat(64),expiresAt:expiry});
  await store.beginPasswordChange({userId:id,operationId:ticket});
  await store.completePasswordChange({userId:id,operationId:ticket});
  assert.deepEqual(calls, [
    {name:'moaon_begin_login',args:{p_user_id:id,p_ticket_id:ticket}},
    {name:'moaon_get_session_window',args:{p_user_id:id,p_ticket_id:ticket}},
    {name:'moaon_issue_session',args:{p_user_id:id,p_ticket_id:ticket,p_session_id:session,p_token_hash:'a'.repeat(64),p_expires_at:expiry}},
    {name:'moaon_begin_password_change',args:{p_user_id:id,p_operation_id:ticket}},
    {name:'moaon_complete_password_change',args:{p_user_id:id,p_operation_id:ticket}},
  ]);
});

test('session window accepts only exact canonical UTC milliseconds and twelve hours', async () => {
  const invalid=[
    null,true,1,[],{},
    {issuedAt:window.issuedAt},
    {issuedAt:window.issuedAt,expiresAt:'2026-09-09T00:00:00Z'},
    {issuedAt:'2026-09-08T12:00:00.000+00:00',expiresAt:window.expiresAt},
    {issuedAt:'2026-02-31T12:00:00.000Z',expiresAt:window.expiresAt},
    {issuedAt:'infinity',expiresAt:'infinity'},
    {issuedAt:window.issuedAt,expiresAt:'2026-09-08T23:59:59.999Z'},
  ];
  for(const data of invalid){
    let calls=0;
    const store=createAuthSessionStore({rpcClient:{rpc:async()=>{calls++;return {data,error:null};}}});
    await assert.rejects(()=>store.getSessionWindow({userId:id,ticketId:ticket}),error =>
      error instanceof AuthSessionStoreError && error.code==='AUTH_TRANSITION_UNAVAILABLE');
    assert.equal(calls,1);
  }
});

test('session window validates IDs before transport and preserves known rejection category', async () => {
  let calls=0;
  const store=createAuthSessionStore({rpcClient:{rpc:async()=>{calls++;return {data:window,error:null};}}});
  await assert.rejects(()=>store.getSessionWindow({userId:null,ticketId:ticket}),TypeError);
  await assert.rejects(()=>store.getSessionWindow({userId:id,ticketId:null}),TypeError);
  assert.equal(calls,0);
  const rejected=createAuthSessionStore({rpcClient:{rpc:async()=>({data:null,error:{code:'P0001',message:'AUTH_TRANSITION_REJECTED'}})}});
  await assert.rejects(()=>rejected.getSessionWindow({userId:id,ticketId:ticket}),error=>
    error instanceof AuthSessionStoreError && error.code==='AUTH_TRANSITION_REJECTED');
  const unavailable=createAuthSessionStore({rpcClient:{rpc:async()=>({data:null,error:{code:'42501',message:'secret provider detail'}})}});
  await assert.rejects(()=>unavailable.getSessionWindow({userId:id,ticketId:ticket}),error=>
    error instanceof AuthSessionStoreError && error.code==='AUTH_TRANSITION_UNAVAILABLE'&&!error.message.includes('secret'));
});

test('session window timeout makes one call and ignores late success', async () => {
  let calls=0,resolve;
  const late=new Promise(done=>{resolve=done;});
  const store=createAuthSessionStore({rpcClient:{rpc:()=>{calls++;return late;}},timeoutMs:10});
  await assert.rejects(()=>store.getSessionWindow({userId:id,ticketId:ticket}),error=>error.code==='AUTH_TRANSITION_UNAVAILABLE');
  resolve({data:window,error:null});
  await new Promise(done=>setTimeout(done,20));
  assert.equal(calls,1);
});

test('session window sanitizes synchronous and asynchronous transport failures', async () => {
  for(const rpc of [
    ()=>{throw new TypeError('secret DB type detail');},
    async()=>{throw new TypeError('secret async DB type detail');},
  ]){
    const store=createAuthSessionStore({rpcClient:{rpc}});
    await assert.rejects(()=>store.getSessionWindow({userId:id,ticketId:ticket}),error=>
      error instanceof AuthSessionStoreError && error.code==='AUTH_TRANSITION_UNAVAILABLE'
      && !error.message.includes('secret') && !error.cause);
  }
});

test('optionally binds the verified profile while preserving the prior issue call', async () => {
  const calls=[];
  const store=createAuthSessionStore({rpcClient:{rpc:async(name,args)=>{calls.push({name,args});return {data:true,error:null};}}});
  await store.issueSession({
    userId:id,ticketId:ticket,sessionId:session,tokenHash:'a'.repeat(64),expiresAt:expiry,
    expectedProfile:{email:'owner@example.test',username:'owner',displayName:'Owner',role:'OWNER'}
  });
  assert.deepEqual(calls,[{name:'moaon_issue_session',args:{
    p_user_id:id,p_ticket_id:ticket,p_session_id:session,p_token_hash:'a'.repeat(64),p_expires_at:expiry,
    p_expected_email:'owner@example.test',p_expected_username:'owner',p_expected_display_name:'Owner',p_expected_role:'OWNER'
  }}]);
});

test('invalid IDs and hashes are rejected before network access', async () => {
  let calls=0;
  const store=createAuthSessionStore({rpcClient:{rpc:async () => { calls++; return {data:true}; }}});
  for (const userId of [null,undefined,'',{},'select 1',id+' ', '00000000-0000-0000-0000-000000000000']) {
    await assert.rejects(() => store.beginLogin({userId,ticketId:ticket}), TypeError);
  }
  for (const tokenHash of [null,'cookie','A'.repeat(64)]) {
    await assert.rejects(() => store.issueSession({userId:id,ticketId:ticket,sessionId:session,tokenHash,expiresAt:expiry}), TypeError);
  }
  for (const expiresAt of ['2026-02-31T06:00:00.000Z','infinity',0,new Date()]) {
    await assert.rejects(() => store.issueSession({userId:id,ticketId:ticket,sessionId:session,tokenHash:'a'.repeat(64),expiresAt}), TypeError);
  }
  for (const expectedProfile of [
    null,{},
    {email:'OWNER@example.test',username:'owner',displayName:'Owner',role:'OWNER'},
    {email:'owner@example.test',username:'x',displayName:'Owner',role:'OWNER'},
    {email:'owner@example.test',username:'owner',displayName:null,role:'OWNER'},
    {email:'owner@example.test',username:'owner',displayName:'Owner',role:'ADMIN'},
  ]) {
    await assert.rejects(() => store.issueSession({
      userId:id,ticketId:ticket,sessionId:session,tokenHash:'a'.repeat(64),expiresAt:expiry,expectedProfile
    }), TypeError);
  }
  assert.equal(calls,0);
});

for (const response of [{data:false}, {data:null}, {}, {data:true,error:{message:'secret database detail'}}]) {
  test(`unconfirmed RPC result fails closed: ${JSON.stringify(response)}`, async () => {
    let calls=0;
    const store=createAuthSessionStore({rpcClient:{rpc:async () => {calls++;return response;}}});
    await assert.rejects(() => store.beginPasswordChange({userId:id,operationId:ticket}), e =>
      e instanceof AuthSessionStoreError && e.code==='AUTH_TRANSITION_UNAVAILABLE' && !/secret|database detail/.test(e.message));
    assert.equal(calls,1);
  });
}

test('known SQL rejection differs from network failure, without leaking provider details', async () => {
  for (const [response,code] of [
    [{data:null,error:{code:'P0001',message:'AUTH_TRANSITION_REJECTED'}},'AUTH_TRANSITION_REJECTED'],
    [{data:null,error:{code:'42501',message:'AUTH_TRANSITION_REJECTED'}},'AUTH_TRANSITION_UNAVAILABLE'],
  ]) {
    const store=createAuthSessionStore({rpcClient:{rpc:async () => response}});
    await assert.rejects(() => store.beginLogin({userId:id,ticketId:ticket}), e => e.code===code);
  }
});

test('timeouts never retry or complete a password change automatically', async () => {
  let calls=0;
  const store=createAuthSessionStore({rpcClient:{rpc:() => {calls++;return new Promise(()=>{});}},timeoutMs:10});
  await assert.rejects(() => store.beginPasswordChange({userId:id,operationId:ticket}), e => e.code==='AUTH_TRANSITION_UNAVAILABLE');
  assert.equal(calls,1);
});

test('synchronous and asynchronous transport failures are sanitized', async () => {
  for (const rpc of [() => {throw Error('secret');}, async () => {throw Error('secret');}]) {
    const store=createAuthSessionStore({rpcClient:{rpc}});
    await assert.rejects(() => store.completePasswordChange({userId:id,operationId:ticket}), e =>
      e.code==='AUTH_TRANSITION_UNAVAILABLE' && !e.cause && !e.message.includes('secret'));
  }
});
