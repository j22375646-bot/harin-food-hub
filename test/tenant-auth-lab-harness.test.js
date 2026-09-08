'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const test=require('node:test');

const ROOT=path.resolve(__dirname,'..');
const RUNNER=path.join(ROOT,'scripts','auth-lab','verify-step-up.cjs');
const UTILS=path.join(ROOT,'scripts','auth-lab','auth-lab-utils.cjs');

test('RFC 6238 SHA-1 vectors catch wrong TOTP counter, digits, or Base32 decoding',()=>{
  const {totpCode}=require(UTILS);
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpCode(secret,{timestampMs:59_000,digits:8}),'94287082');
  assert.equal(totpCode(secret,{timestampMs:1_111_111_109_000,digits:8}),'07081804');
});

test('lab configuration requires explicit opt-in and both external TLS file paths',()=>{
  const {readLabConfiguration}=require(UTILS);
  for(const env of [{},
    {MOAON_AUTH_LAB_RUN:'0',MOAON_AUTH_LAB_CERT:'cert',MOAON_AUTH_LAB_KEY:'key'},
    {MOAON_AUTH_LAB_RUN:'1',MOAON_AUTH_LAB_KEY:'key'},
    {MOAON_AUTH_LAB_RUN:'1',MOAON_AUTH_LAB_CERT:'cert'}]) {
    assert.throws(()=>readLabConfiguration(env),error=>error?.code==='AUTH_LAB_DISABLED');
  }
  assert.deepEqual(readLabConfiguration({MOAON_AUTH_LAB_RUN:'1',MOAON_AUTH_LAB_CERT:'cert',MOAON_AUTH_LAB_KEY:'key'}),{
    certPath:'cert',keyPath:'key',
  });
});

test('client request guard permits only the fixed TLS localhost auth namespace',()=>{
  const {authorizeClientUrl}=require(UTILS);
  assert.equal(authorizeClientUrl('https://127.0.0.1:54443/auth/v1/token?grant_type=password').href,
    'https://127.0.0.1:54443/auth/v1/token?grant_type=password');
  for(const target of [
    'http://127.0.0.1:54443/auth/v1/token',
    'https://localhost:54443/auth/v1/token',
    'https://127.0.0.1:54444/auth/v1/token',
    'https://127.0.0.1:54443/auth/v10/token',
    'https://user@127.0.0.1:54443/auth/v1/token',
  ]) assert.throws(()=>authorizeClientUrl(target),error=>error?.code==='AUTH_LAB_TARGET_REJECTED');
});

test('gateway mapping only strips the fixed auth prefix and never selects an upstream host',()=>{
  const {mapGatewayPath}=require(UTILS);
  assert.equal(mapGatewayPath('/auth/v1/signup'),'/signup');
  assert.equal(mapGatewayPath('/auth/v1/token?grant_type=password'),'/token?grant_type=password');
  assert.throws(()=>mapGatewayPath('/other'),error=>error?.code==='AUTH_LAB_TARGET_REJECTED');
});

test('next-step wait advances the counter without exceeding 31 seconds',()=>{
  const {nextTotpWaitMs}=require(UTILS);
  assert.equal(nextTotpWaitMs(59_000,1),1_050);
  assert.equal(nextTotpWaitMs(30_001,1),30_049);
  assert.ok(nextTotpWaitMs(30_000,1)<=31_000);
});

test('JWT tampering preserves public claims while changing the decoded signature bytes',()=>{
  const {tamperJwtSignature}=require(UTILS);
  const token='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.AAAA';
  const changed=tamperJwtSignature(token);
  const before=token.split('.');
  const after=changed.split('.');
  assert.equal(after[0],before[0]);
  assert.equal(after[1],before[1]);
  assert.notDeepEqual(Buffer.from(after[2],'base64url'),Buffer.from(before[2],'base64url'));
});

test('runner without explicit opt-in exits before any network work and prints no secret values',()=>{
  const env={...process.env};
  delete env.MOAON_AUTH_LAB_RUN;
  env.MOAON_AUTH_LAB_CERT='do-not-print-cert';
  env.MOAON_AUTH_LAB_KEY='do-not-print-key';
  const result=spawnSync(process.execPath,[RUNNER],{cwd:ROOT,env,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stdout,/^CHECK opt-in FAIL 1\r?\n$/);
  assert.equal(result.stderr,'');
  assert.doesNotMatch(result.stdout,/do-not-print/);
});
