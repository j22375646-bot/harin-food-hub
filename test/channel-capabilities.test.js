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
    inquiries:{ read:true, write:false }, claims:{ read:true, write:false },
    settlements:{ read:true, write:false }
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

test('Naver successful fixed-IP commerce sync is current connection evidence', () => {
  const result = channels.naverChannel([
    { platform:'NAVER', job_type:'COMMERCE_CONNECTION_TEST', status:'FAILED', finished_at:'2026-08-16T08:00:00Z', metadata:{ code:'NAVER_COMMERCE_CONFIG_REQUIRED' } },
    { platform:'NAVER', job_type:'COMMERCE_SYNC', status:'SUCCESS', finished_at:'2026-08-16T09:00:00Z', metadata:{ fixedIp:true, counts:{ products:203, orders:83, inquiries:1, claims:0, settlements:21 }, errors:[], writeEnabled:false } }
  ]);
  assert.equal(result.status, 'READ_READY');
  assert.match(result.summary, /상품·주문/);
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

test('Cafe24 realtime order success is current connection evidence', () => {
  const token = {
    access_token:'token',
    scopes:['mall.read_product','mall.write_product','mall.read_order','mall.write_order','mall.read_community','mall.write_community']
  };
  const result = channels.cafe24Channel([
    { platform:'CAFE24', job_type:'FETCH_ALL', status:'FAILED', finished_at:'2026-08-16T08:00:00Z' },
    { platform:'CAFE24', job_type:'ORDERS_REALTIME', status:'SUCCESS', finished_at:'2026-08-16T09:00:00Z' }
  ], token);
  assert.equal(result.status, 'WRITE_READY');
  assert.equal(result.capabilities.every(item => item.read.status === 'READY'), true);
  assert.equal(result.lastVerifiedAt, '2026-08-16T09:00:00Z');
});

test('Coupang newer fixed-IP order and CS successes supersede an old direct-IP failure', () => {
  const result = channels.coupangChannel([
    { platform:'COUPANG', job_type:'FETCH_ALL', status:'FAILED', finished_at:'2026-08-16T08:00:00Z', error_message:'IP not allowed' },
    { platform:'COUPANG', job_type:'ORDERS_REALTIME', status:'SUCCESS', finished_at:'2026-08-16T09:00:00Z', metadata:{ counts:{ orders:20 } } },
    { platform:'COUPANG', job_type:'CUSTOMER_SERVICE', status:'SUCCESS', finished_at:'2026-08-16T09:01:00Z', metadata:{ fixedIp:true, counts:{ inquiries:0, returns:1 } } }
  ], { products:1, orders:20 });
  assert.equal(result.status, 'READ_READY');
  assert.match(result.summary, /주문·CS 정상/);
});

function coupangWithLatestCs(status,metadata={}){
  return channels.coupangChannel([
    {platform:'COUPANG',job_type:'FETCH_ALL',status:'SUCCESS',finished_at:'2026-09-07T01:00:00Z',metadata:{counts:{inquiries:0,returns:0,exchanges:0}}},
    {platform:'COUPANG',job_type:'CUSTOMER_SERVICE',status,finished_at:'2026-09-07T02:00:00Z',metadata}
  ],{products:2});
}

for(const dataset of ['inquiries','returns','exchanges']){
  test(`Coupang partial ${dataset} failure locks only the affected CS capability`,()=>{
    const model=coupangWithLatestCs('PARTIAL',{
      counts:{inquiries:0,returns:1,exchanges:0},errors:[{dataset,message:'Source unavailable'}]
    });
    const inquiries=model.capabilities.find(item=>item.key==='inquiries');
    const claims=model.capabilities.find(item=>item.key==='claims');
    assert.equal(inquiries.read.status,dataset==='inquiries'?'VERIFY_REQUIRED':'READY');
    assert.equal(inquiries.write.status,dataset==='inquiries'?'LOCKED':'READY');
    assert.equal(claims.read.status,dataset==='inquiries'?'READY':'VERIFY_REQUIRED');
    assert.equal(claims.write.status,dataset==='inquiries'?'READY':'LOCKED');
    assert.equal(model.status,'VERIFY_REQUIRED');
  });
}

test('an older full-sync success cannot hide a newer failed CS collection',()=>{
  const model=coupangWithLatestCs('FAILED',{errors:[{dataset:'inquiries',message:'No access'}]});
  for(const key of ['inquiries','claims']){
    const capability=model.capabilities.find(item=>item.key===key);
    assert.equal(capability.read.status,'VERIFY_REQUIRED');
    assert.equal(capability.write.status,'LOCKED');
  }
  assert.equal(model.status,'FAILED');
});

test('unverified inquiry status blocks inquiry writes while verified claim collection stays available',()=>{
  const model=coupangWithLatestCs('PARTIAL',{
    counts:{inquiries:0,returns:0,exchanges:0},errors:[],
    inquiryVerificationWarnings:[{inquiryId:'old',code:'COUPANG_INQUIRY_NOT_FOUND'}]
  });
  assert.equal(model.capabilities.find(item=>item.key==='inquiries').read.status,'VERIFY_REQUIRED');
  assert.equal(model.capabilities.find(item=>item.key==='inquiries').write.status,'LOCKED');
  assert.equal(model.capabilities.find(item=>item.key==='claims').read.status,'READY');
  assert.equal(model.status,'VERIFY_REQUIRED');
});

test('partial CS results without dataset evidence cannot unlock reads or writes',()=>{
  const model=coupangWithLatestCs('PARTIAL',{});
  for(const key of ['inquiries','claims']){
    const capability=model.capabilities.find(item=>item.key===key);
    assert.equal(capability.read.status,'VERIFY_REQUIRED');
    assert.equal(capability.write.status,'LOCKED');
  }
});

test('a full-sync failure outside CS preserves independently verified inquiry and claim reads',()=>{
  const model=channels.coupangChannel([{
    platform:'COUPANG',job_type:'FETCH_ALL',status:'PARTIAL',finished_at:'2026-09-07T02:00:00Z',
    metadata:{counts:{inquiries:0,returns:0,exchanges:0},errors:[{dataset:'settlements',message:'Revenue unavailable'}]}
  }],{products:2});
  assert.equal(model.capabilities.find(item=>item.key==='inquiries').read.status,'READY');
  assert.equal(model.capabilities.find(item=>item.key==='claims').read.status,'READY');
});

test('a newer full CS read supersedes an older failed CS collection',()=>{
  const model=channels.coupangChannel([
    {platform:'COUPANG',job_type:'CUSTOMER_SERVICE',status:'FAILED',finished_at:'2026-09-07T01:00:00Z'},
    {platform:'COUPANG',job_type:'FETCH_ALL',status:'SUCCESS',finished_at:'2026-09-07T02:00:00Z',metadata:{counts:{inquiries:0,returns:0,exchanges:0}}}
  ],{products:2});
  assert.equal(model.status,'READ_READY');
  assert.equal(model.capabilities.find(item=>item.key==='inquiries').read.status,'READY');
  assert.equal(model.capabilities.find(item=>item.key==='claims').read.status,'READY');
});
