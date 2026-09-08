'use strict';

const assert=require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const http=require('node:http');
const https=require('node:https');
const path=require('node:path');
const {PassThrough}=require('node:stream');
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

test('pinned fetch times out and destroys a request that never receives a response',async()=>{
  const {createPinnedFetch}=require(UTILS);
  const originalRequest=https.request;
  const request=new EventEmitter();
  let lateError;
  request.destroyed=false;
  request.write=()=>{};
  request.end=()=>{lateError=setTimeout(()=>request.emit('error',Object.assign(new Error('late'),{code:'UPSTREAM_LATE'})),80);};
  request.destroy=error=>{
    if(request.destroyed)return;
    request.destroyed=true;
    if(error)queueMicrotask(()=>request.emit('error',error));
  };
  https.request=()=>request;
  try{
    const pinnedFetch=createPinnedFetch({ca:'test-ca',timeoutMs:20});
    await assert.rejects(()=>pinnedFetch('https://127.0.0.1:54443/auth/v1/health'),error=>error?.code==='AUTH_LAB_TIMEOUT');
    assert.equal(request.destroyed,true);
  }finally{
    clearTimeout(lateError);
    https.request=originalRequest;
  }
});

test('pinned fetch timeout remains active while a response body is incomplete',async()=>{
  const {createPinnedFetch}=require(UTILS);
  const originalRequest=https.request;
  const request=new EventEmitter();
  const response=new PassThrough();
  request.destroyed=false;
  request.write=()=>{};
  request.end=()=>{};
  request.destroy=()=>{request.destroyed=true;};
  response.statusCode=200;
  response.headers={'content-type':'application/json'};
  response.complete=false;
  https.request=(_target,_options,onResponse)=>{
    queueMicrotask(()=>{onResponse(response);response.write('{"partial":');});
    return request;
  };
  try{
    const pinnedFetch=createPinnedFetch({ca:'test-ca',timeoutMs:20});
    await assert.rejects(()=>pinnedFetch('https://127.0.0.1:54443/auth/v1/user'),error=>error?.code==='AUTH_LAB_TIMEOUT');
    assert.equal(request.destroyed,true);
    assert.equal(response.destroyed,true);
  }finally{
    response.destroy();
    https.request=originalRequest;
  }
});

test('pinned fetch rejects an aborted partial response once and removes its abort listener',async()=>{
  const {createPinnedFetch}=require(UTILS);
  const originalRequest=https.request;
  const request=new EventEmitter();
  const response=new PassThrough();
  const abortListeners=new Set();
  const signal={
    aborted:false,
    addEventListener(_name,listener){abortListeners.add(listener);},
    removeEventListener(_name,listener){abortListeners.delete(listener);},
  };
  request.destroyed=false;
  request.write=()=>{};
  request.end=()=>{};
  request.destroy=()=>{request.destroyed=true;};
  response.statusCode=200;
  response.headers={'content-type':'application/json'};
  response.complete=false;
  https.request=(_target,_options,onResponse)=>{
    queueMicrotask(()=>{
      onResponse(response);
      response.write('{"partial":');
      response.emit('aborted');
    });
    return request;
  };
  try{
    const pinnedFetch=createPinnedFetch({ca:'test-ca',timeoutMs:100});
    await assert.rejects(()=>pinnedFetch('https://127.0.0.1:54443/auth/v1/user',{signal}),error=>error?.code==='AUTH_LAB_RESPONSE_ABORTED');
    assert.equal(request.destroyed,true);
    assert.equal(response.destroyed,true);
    assert.equal(abortListeners.size,0);
  }finally{
    response.destroy();
    https.request=originalRequest;
  }
});

test('pinned fetch rejects a response stream error instead of waiting for its timeout',async()=>{
  const {createPinnedFetch}=require(UTILS);
  const originalRequest=https.request;
  const request=new EventEmitter();
  const response=new PassThrough();
  request.destroyed=false;
  request.write=()=>{};
  request.end=()=>{};
  request.destroy=()=>{request.destroyed=true;};
  response.statusCode=200;
  response.headers={'content-type':'application/json'};
  response.complete=false;
  response.on('error',()=>{});
  https.request=(_target,_options,onResponse)=>{
    queueMicrotask(()=>{
      onResponse(response);
      response.write('{"partial":');
      response.emit('error',Object.assign(new Error('truncated'),{code:'ECONNRESET'}));
    });
    return request;
  };
  try{
    const pinnedFetch=createPinnedFetch({ca:'test-ca',timeoutMs:100});
    await assert.rejects(()=>pinnedFetch('https://127.0.0.1:54443/auth/v1/user'),error=>error?.code==='AUTH_LAB_RESPONSE_ERROR');
    assert.equal(request.destroyed,true);
    assert.equal(response.destroyed,true);
  }finally{
    response.destroy();
    https.request=originalRequest;
  }
});

test('TLS gateway times out a stalled upstream and closes every transport handle',async()=>{
  const {startTlsGateway}=require(UTILS);
  const originalCreateServer=https.createServer;
  const originalRequest=http.request;
  const server=new EventEmitter();
  const upstream=new PassThrough();
  let requestHandler;
  let lateError;
  let closeAllCalls=0;
  server.listen=(_port,_host,callback)=>queueMicrotask(callback);
  server.close=callback=>queueMicrotask(()=>callback());
  server.closeAllConnections=()=>{closeAllCalls+=1;};
  https.createServer=(_options,handler)=>{requestHandler=handler;return server;};
  http.request=()=>{
    lateError=setTimeout(()=>upstream.emit('error',new Error('late upstream error')),80);
    return upstream;
  };
  const incoming=new PassThrough();
  const outgoing=new PassThrough();
  incoming.url='/auth/v1/user';
  incoming.method='GET';
  incoming.headers={};
  outgoing.headersSent=false;
  outgoing.writeHead=status=>{outgoing.statusCode=status;outgoing.headersSent=true;};
  let gateway;
  try{
    gateway=await startTlsGateway({cert:'test-cert',key:'test-key',timeoutMs:20});
    const finished=once(outgoing,'finish');
    requestHandler(incoming,outgoing);
    incoming.end();
    await finished;
    assert.equal(outgoing.statusCode,504);
    assert.equal(upstream.destroyed,true);
    await gateway.close();
    gateway=null;
    assert.equal(closeAllCalls,1);
  }finally{
    clearTimeout(lateError);
    if(gateway)await gateway.close();
    upstream.destroy();
    outgoing.destroy();
    incoming.destroy();
    http.request=originalRequest;
    https.createServer=originalCreateServer;
  }
});

test('TLS gateway close destroys an outstanding upstream before its deadline',async()=>{
  const {startTlsGateway}=require(UTILS);
  const originalCreateServer=https.createServer;
  const originalRequest=http.request;
  const server=new EventEmitter();
  const upstream=new PassThrough();
  let requestHandler;
  let closeAllCalls=0;
  server.listen=(_port,_host,callback)=>queueMicrotask(callback);
  server.close=callback=>queueMicrotask(()=>callback());
  server.closeAllConnections=()=>{closeAllCalls+=1;};
  https.createServer=(_options,handler)=>{requestHandler=handler;return server;};
  http.request=()=>upstream;
  const incoming=new PassThrough();
  const outgoing=new PassThrough();
  incoming.url='/auth/v1/user';
  incoming.method='GET';
  incoming.headers={};
  outgoing.headersSent=false;
  outgoing.writeHead=status=>{outgoing.statusCode=status;outgoing.headersSent=true;};
  let gateway;
  try{
    gateway=await startTlsGateway({cert:'test-cert',key:'test-key',timeoutMs:1_000});
    requestHandler(incoming,outgoing);
    incoming.end();
    await gateway.close();
    gateway=null;
    assert.equal(upstream.destroyed,true);
    assert.equal(outgoing.destroyed,true);
    assert.equal(closeAllCalls,1);
  }finally{
    if(gateway)await gateway.close();
    upstream.destroy();
    outgoing.destroy();
    incoming.destroy();
    http.request=originalRequest;
    https.createServer=originalCreateServer;
  }
});

test('TLS gateway cancels upstream immediately when the downstream closes',async()=>{
  const {startTlsGateway}=require(UTILS);
  const originalCreateServer=https.createServer;
  const originalRequest=http.request;
  const server=new EventEmitter();
  const upstream=new PassThrough();
  let requestHandler;
  server.listen=(_port,_host,callback)=>queueMicrotask(callback);
  server.close=callback=>queueMicrotask(()=>callback());
  server.closeAllConnections=()=>{};
  https.createServer=(_options,handler)=>{requestHandler=handler;return server;};
  http.request=()=>upstream;
  const incoming=new PassThrough();
  const outgoing=new PassThrough();
  incoming.url='/auth/v1/user';
  incoming.method='GET';
  incoming.headers={};
  outgoing.headersSent=false;
  outgoing.writeHead=status=>{outgoing.statusCode=status;outgoing.headersSent=true;};
  let gateway;
  try{
    gateway=await startTlsGateway({cert:'test-cert',key:'test-key',timeoutMs:1_000});
    requestHandler(incoming,outgoing);
    incoming.end();
    outgoing.destroy();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(upstream.destroyed,true);
  }finally{
    if(gateway)await gateway.close();
    upstream.destroy();
    outgoing.destroy();
    incoming.destroy();
    http.request=originalRequest;
    https.createServer=originalCreateServer;
  }
});

async function assertGatewayResponseCancellation(eventName){
  const {startTlsGateway}=require(UTILS);
  const originalCreateServer=https.createServer;
  const originalRequest=http.request;
  const server=new EventEmitter();
  const upstream=new PassThrough();
  const response=new PassThrough();
  let requestHandler;
  server.listen=(_port,_host,callback)=>queueMicrotask(callback);
  server.close=callback=>queueMicrotask(()=>callback());
  server.closeAllConnections=()=>{};
  https.createServer=(_options,handler)=>{requestHandler=handler;return server;};
  http.request=(_options,onResponse)=>{
    queueMicrotask(()=>{
      onResponse(response);
      response.write('{"partial":');
      response.emit(eventName,eventName==='error'?new Error('truncated'):undefined);
    });
    return upstream;
  };
  response.statusCode=200;
  response.headers={'content-type':'application/json'};
  response.complete=false;
  response.on('error',()=>{});
  const incoming=new PassThrough();
  const outgoing=new PassThrough();
  incoming.url='/auth/v1/user';
  incoming.method='GET';
  incoming.headers={};
  outgoing.headersSent=false;
  outgoing.writeHead=status=>{outgoing.statusCode=status;outgoing.headersSent=true;};
  let gateway;
  try{
    gateway=await startTlsGateway({cert:'test-cert',key:'test-key',timeoutMs:1_000});
    requestHandler(incoming,outgoing);
    incoming.end();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(upstream.destroyed,true);
    assert.equal(response.destroyed,true);
    assert.equal(outgoing.destroyed,true);
  }finally{
    if(gateway)await gateway.close();
    response.destroy();
    upstream.destroy();
    outgoing.destroy();
    incoming.destroy();
    http.request=originalRequest;
    https.createServer=originalCreateServer;
  }
}

test('TLS gateway cancels both sides when the upstream response is aborted',()=>assertGatewayResponseCancellation('aborted'));

test('TLS gateway cancels both sides when the upstream response emits an error',()=>assertGatewayResponseCancellation('error'));

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
