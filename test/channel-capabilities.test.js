'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const channels = require('../lib/platforms/channel-capabilities.js');

test('unconfigured channels remain setup or verification required', async () => {
  const result = await channels.buildChannelCapabilities({ syncs:[], cafe24Token:null });
  assert.equal(result.phase, '11-1');
  assert.equal(result.channels.find(item => item.platform === 'NAVER').status, 'SETUP_REQUIRED');
  assert.equal(result.channels.find(item => item.platform === 'CAFE24').status, 'SETUP_REQUIRED');
  assert.equal(result.channels.find(item => item.platform === 'COUPANG').status, 'VERIFY_REQUIRED');
});

test('Naver exposes verified reads but keeps unapproved writes locked', () => {
  const metadata = { capabilities:{
    products:{ read:true, write:false }, orders:{ read:true, write:false },
    inquiries:{ read:true, write:false }, claims:{ read:true, write:false }
  } };
  const result = channels.naverChannel([{ platform:'NAVER', job_type:'COMMERCE_CONNECTION_TEST', status:'SUCCESS', metadata }]);
  assert.equal(result.status, 'READ_READY');
  assert.equal(result.capabilities.every(item => item.read.status === 'READY'), true);
  assert.equal(result.capabilities.every(item => item.write.status === 'LOCKED'), true);
});

test('Naver credential failure stays setup required instead of looking connected', () => {
  const result = channels.naverChannel([{
    platform:'NAVER', job_type:'COMMERCE_CONNECTION_TEST', status:'FAILED',
    metadata:{ code:'NAVER_COMMERCE_CONFIG_REQUIRED' }
  }]);
  assert.equal(result.status, 'SETUP_REQUIRED');
  assert.equal(result.capabilities.every(item => item.read.status === 'SETUP_REQUIRED'), true);
});

test('Cafe24 requires OAuth reconnect when newly requested write scopes are missing', () => {
  const token = { access_token:'token', scopes:['mall.read_product','mall.read_order','mall.read_community'] };
  const result = channels.cafe24Channel([{ platform:'CAFE24', job_type:'FETCH_ALL', status:'SUCCESS' }], token);
  assert.equal(result.status, 'RECONNECT_REQUIRED');
  assert.equal(result.missingScopes.includes('mall.write_product'), true);
  assert.equal(result.capabilities.find(item => item.key === 'products').write.status, 'RECONNECT_REQUIRED');
});

test('Coupang fixed-IP reads can be ready while product writes stay locked', () => {
  const sync = { platform:'COUPANG', job_type:'FETCH_ALL', status:'SUCCESS', metadata:{ counts:{ inquiries:0, returns:0, exchanges:0 }, productWriteEnabled:false } };
  const result = channels.coupangChannel([sync], { products:2, orders:0 });
  assert.equal(result.status, 'READ_READY');
  assert.equal(result.capabilities.every(item => item.read.status === 'READY'), true);
  assert.equal(result.capabilities.find(item => item.key === 'products').write.status, 'LOCKED');
});
