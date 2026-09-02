'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

test('Cafe24 매출통계 권한이 토큰에 없으면 재연결 성공으로 오인하지 않고 개발자 승인을 요구한다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const result=capability.assessFinanceCapability({
    access_token:'stored',
    scopes:['mall.read_product','mall.read_order','mall.read_analytics']
  });

  assert.equal(result.status,'APPROVAL_REQUIRED');
  assert.equal(result.scope,'mall.read_salesreport');
  assert.equal(result.shouldCollect,false);
  assert.match(result.action,/개발자센터.*승인/);
  assert.match(result.docsUrl,/^https:\/\/developers\.cafe24\.com\//);
});

test('Cafe24 매출통계 권한이 승인된 토큰만 재무 API 자동수집을 허용한다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const result=capability.assessFinanceCapability({
    access_token:'stored',
    scopes:['mall.read_order','mall.read_salesreport']
  });

  assert.equal(result.status,'READY');
  assert.equal(result.shouldCollect,true);
});

test('Cafe24 OAuth 요청은 기본 권한과 제한 승인 권한을 구분하면서 둘 다 요청한다',()=>{
  const previous={};
  for(const [key,value] of Object.entries({
    CAFE24_MALL_ID:'mall',CAFE24_CLIENT_ID:'client',CAFE24_CLIENT_SECRET:'secret',CAFE24_REDIRECT_URI:'https://example.com/callback'
  })){previous[key]=process.env[key];process.env[key]=value;}
  try{
    const config=require('../lib/cafe24/config.js').getConfig();
    assert.ok(config.requiredScopes.includes('mall.read_analytics'));
    assert.equal(config.requiredScopes.includes('mall.read_salesreport'),false);
    assert.deepEqual(config.restrictedScopes,['mall.read_salesreport']);
    assert.ok(config.scopes.includes('mall.read_salesreport'));
  }finally{
    for(const [key,value] of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;
  }
});

test('Cafe24 OAuth URL은 공식 규격대로 scope를 공백으로 구분한다',async()=>{
  const previous={};
  for(const [key,value] of Object.entries({
    CAFE24_MALL_ID:'mall',CAFE24_CLIENT_ID:'client',CAFE24_CLIENT_SECRET:'secret',CAFE24_REDIRECT_URI:'https://example.com/callback'
  })){previous[key]=process.env[key];process.env[key]=value;}
  try{
    const route=await import(`../app/oauth/cafe24/start/route.js?test=${Date.now()}`);
    const response=await route.GET();
    const location=response.headers.get('location');
    assert.ok(location);
    const scopes=new URL(location).searchParams.get('scope').split(' ');
    assert.ok(scopes.includes('mall.read_order'));
    assert.ok(scopes.includes('mall.read_salesreport'));
  }finally{
    for(const [key,value] of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;
  }
});

test('Cafe24 OAuth 콜백은 승인 상태를 정산 페이지로 돌려준다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const destination=capability.callbackDestination(
    'https://hub.example.com/oauth/cafe24/callback',
    {status:'APPROVAL_REQUIRED'}
  );
  assert.equal(destination.toString(),'https://hub.example.com/settlement-costs?cafe24=approval-required');
});
