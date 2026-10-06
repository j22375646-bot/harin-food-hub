'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const client = require('../lib/naver-commerce/client.js');
const probe = require('../lib/naver-commerce/probe.js');

test('different client credentials never reuse another business token',async t=>{
 client.resetTokenCache();t.after(()=>client.resetTokenCache());let calls=0;
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({access_token:`token-${++calls}`,expires_in:3600})}));
 const a={clientId:'business-a',clientSecret:bcrypt.genSaltSync(4),tokenType:'SELF',accountId:''};
 assert.equal(await client.getAccessToken(a),'token-1');assert.equal(await client.getAccessToken({...a}),'token-1');
 assert.equal(await client.getAccessToken({...a,clientId:'business-b'}),'token-2');
 assert.equal(await client.getAccessToken({...a,clientId:'business-b',clientSecret:bcrypt.genSaltSync(4)}),'token-3');
});

test('cache reset during token fetch prevents a late response restoring cleared cache',async t=>{
 client.resetTokenCache();t.after(()=>client.resetTokenCache());let release,calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;if(calls===1)await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({access_token:calls===1?'old-token':'fresh-token',expires_in:3600})};});
 const config={clientId:'test',clientSecret:bcrypt.genSaltSync(4),tokenType:'SELF',accountId:''};
 const pending=client.getAccessToken(config);client.resetTokenCache();release();assert.equal(await pending,'old-token');
 assert.equal(await client.getAccessToken(config),'fresh-token');
});

test('failed forced refresh does not leave the old token reusable',async t=>{
 client.resetTokenCache();t.after(()=>client.resetTokenCache());let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:calls!==2,status:401,json:async()=>calls===2?{}:{access_token:`token-${calls}`,expires_in:3600}};});
 const config={clientId:'test',clientSecret:bcrypt.genSaltSync(4),tokenType:'SELF',accountId:''};
 assert.equal(await client.getAccessToken(config),'token-1');await assert.rejects(client.getAccessToken(config,{force:true}));
 assert.equal(await client.getAccessToken(config),'token-3');
});

test('Naver Commerce signature is a base64 encoded bcrypt result', () => {
  const clientId = 'test-client';
  const timestamp = '1786600000000';
  const clientSecret = bcrypt.genSaltSync(10);
  const encoded = client.createSecretSign({ clientId, clientSecret, timestamp });
  const hash = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(bcrypt.compareSync(`${clientId}_${timestamp}`, hash), true);
});

test('Naver Commerce config requires server credentials and keeps writes locked by default', () => {
  assert.throws(() => client.getConfig({}), error => error.code === 'NAVER_COMMERCE_CONFIG_REQUIRED');
  const config = client.getConfig({ NAVER_COMMERCE_CLIENT_ID:'id', NAVER_COMMERCE_CLIENT_SECRET:'secret' });
  assert.equal(config.tokenType, 'SELF');
  assert.equal(config.writeEnabled, false);
  assert.throws(() => client.getConfig({ NAVER_COMMERCE_CLIENT_ID:'id', NAVER_COMMERCE_CLIENT_SECRET:'secret', NAVER_COMMERCE_TOKEN_TYPE:'SELLER' }), /ACCOUNT_ID/);
});

test('Naver Commerce order window is formatted in Korea time', () => {
  assert.equal(probe.kstIso(new Date('2026-08-13T00:00:00.000Z')), '2026-08-13T09:00:00.000+09:00');
});

test('a collection deadline aborts both token and API transport requests', async t => {
  client.resetTokenCache();
  const controller = new AbortController();
  let requests = 0;
  t.mock.method(globalThis,'fetch',async (_url,options) => {
    assert.equal(options.signal,controller.signal);
    requests++;
    if (requests === 1) return {ok:true,json:async () => ({access_token:'test-token',expires_in:3600})};
    controller.abort();
    options.signal.throwIfAborted();
  });
  await assert.rejects(client.request('GET','/v1/pay-order/seller/product-orders',{
    config:{clientId:'test',clientSecret:bcrypt.genSaltSync(4),tokenType:'SELF',accountId:''},
    signal:controller.signal,maxAttempts:1,
  }),error => error.name === 'AbortError');
  assert.equal(requests,2);
  client.resetTokenCache();
});
