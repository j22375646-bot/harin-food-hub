'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { NextResponse } = require('next/server');
const auth = require('../lib/dashboard-auth.js');
const loginRequest = require('../lib/dashboard-login-request.js');

const quotaError = { message:'Service for this project is restricted due to the following violations: exceed_egress_quota.' };

// Run the real handler; only the external authentication operation is replaced.
function loginHandler(authenticateAccount, method = 'POST') {
  const source = fs.readFileSync(path.join(__dirname,'../app/api/dashboard/login/route.js'),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace('export const runtime','const runtime')
    .replace(/export async function /g,'async function ');
  return new Function('authModule','loginRequestModule','NextResponse',`${source}\nreturn typeof ${method} === 'function' ? ${method} : undefined;`)(
    {...auth,authenticateAccount},loginRequest,NextResponse
  );
}

test('opening the login processing URL returns to the form without authentication or query forwarding', async()=>{
  let calls = 0;
  const GET = loginHandler(async()=>{calls++; throw new Error('must not authenticate');}, 'GET');
  assert.equal(typeof GET, 'function', 'direct navigation needs a recovery handler');
  const response = await GET(new Request('https://hub.example/api/dashboard/login?next=https://foreign.example&password=do-not-forward'));
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'https://hub.example/login');
  assert.equal(response.headers.get('set-cookie'),null);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(calls,0);
});

for (const [label,error,expected] of [
  ['quota message without SDK status',quotaError,'restricted'],
  ['provider HTTP 402',{status:402,message:'Payment Required'},'restricted'],
  ['database outage',{code:'PGRST000',message:'database connection unavailable'},'unavailable'],
  ['unknown exception',new Error('internal configuration failure'),'unavailable'],
  ['real password rejection',{code:'INVALID_CREDENTIALS'},'invalid'],
  ['password attempt limit',{code:'LOGIN_RATE_LIMITED'},'blocked'],
  ['auth deadline',{code:'LOGIN_AUTH_TIMEOUT'},'delayed']
]) {
  test(`login redirect distinguishes ${label} and never issues a session`,async t=>{
    const logs=[];
    t.mock.method(console,'error',(...args)=>logs.push(args));
    const POST = loginHandler(async()=>{throw error;});
    const response = await POST(new Request('https://hub.example/api/dashboard/login',{
      method:'POST',headers:{origin:'https://hub.example'},
      body:new URLSearchParams({password:'003742',next:'/orders'})
    }));
    const location = new URL(response.headers.get('location'));
    assert.equal(response.status,303);
    assert.equal(location.searchParams.get('error'),expected);
    assert.equal(location.searchParams.get('next'),'/orders');
    assert.equal(response.headers.get('set-cookie'),null);
    assert.equal(location.searchParams.has('message'),false);
    assert.deepEqual(logs,['restricted','unavailable','delayed'].includes(expected)
      ?[['[DASHBOARD_LOGIN_FAILURE]',{reason:expected}]]:[]);
  });
}

function accountDatabase() {
  const state = {failures:0,sessions:0};
  const db = {from(table){
    return {
      select(){return this;},eq(){return this;},
      maybeSingle:async()=>({data:table==='dashboard_users'
        ?{user_id:'owner-id',email:'owner@example.com',username:'owner',display_name:'Owner',role:'OWNER',active:true}:null,error:null}),
      upsert:async()=>{state.failures++;return {error:null};},
      insert:async()=>{state.sessions++;return {error:null};}
    };
  }};
  return {db,state};
}

for (const [label,error,expected] of [
  ['quota',{status:402,code:'unexpected_failure',message:quotaError.message},'LOGIN_SERVICE_RESTRICTED'],
  ['provider unavailable',{status:503,code:'unexpected_failure',message:'upstream unavailable'},'LOGIN_AUTH_UNAVAILABLE'],
  ['provider rate limit',{status:429,code:'over_request_rate_limit',message:'too many requests'},'LOGIN_AUTH_UNAVAILABLE'],
  ['transport',{name:'AuthRetryableFetchError',status:0,message:'fetch failed'},'LOGIN_AUTH_UNAVAILABLE']
]) {
  test(`provider ${label} is not counted as a wrong password`,async()=>{
    const {db,state}=accountDatabase();
    const authClient={auth:{signInWithPassword:async credentials=>{
      assert.equal(credentials.password,'003742','leading zeros must remain intact');
      return {data:{user:null,session:null},error};
    }}};
    await assert.rejects(auth.authenticateAccount({account:'owner',password:'003742',ip:'192.0.2.1'},db,{authClient}),
      error=>error.code===expected);
    assert.equal(state.failures,0);
    assert.equal(state.sessions,0);
  });
}

test('genuine invalid credentials still increment the failed-password counter',async()=>{
  const {db,state}=accountDatabase();
  const authClient={auth:{signInWithPassword:async()=>({
    data:{user:null,session:null},error:{status:400,code:'invalid_credentials',message:'Invalid login credentials'}
  })}};
  await assert.rejects(auth.authenticateAccount({account:'owner',password:'003742',ip:'192.0.2.1'},db,{authClient}),
    error=>error.code==='INVALID_CREDENTIALS');
  assert.equal(state.failures,1);
  assert.equal(state.sessions,0);
});
