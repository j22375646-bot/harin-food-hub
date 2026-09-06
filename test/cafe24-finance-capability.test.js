'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

test('Cafe24 generic 403은 개발자 승인 미완료로 단정하지 않는다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const result=capability.classifyFinanceError(Object.assign(new Error('Cafe24 API failed (403)'),{
    status:403,
    payload:{error:{code:'FORBIDDEN',message:'Access forbidden'}}
  }));

  assert.equal(result.status,'VERIFY_REQUIRED');
  assert.equal(result.shouldCollect,false);
  assert.deepEqual(result.evidence,{
    http_status:403,
    error_code:'FORBIDDEN',
    error_message:'Access forbidden'
  });
});

test('sync evidence용 sanitizer는 JSON 중첩 credential과 Authorization marker를 모두 제거한다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const markers=['MARKER_ACCESS','MARKER_REFRESH','MARKER_CLIENT','MARKER_AUTH'];
  const result=capability.classifyFinanceError({
    status:403,
    payload:{error:{
      code:'FORBIDDEN',
      message:JSON.stringify({
        access_token:markers[0],
        nested:{refresh_token:markers[1],client_secret:markers[2]},
        headers:{Authorization:`Bearer ${markers[3]}`}
      })
    }}
  });

  for(const marker of markers)assert.equal(result.evidence.error_message.includes(marker),false);
  assert.match(result.evidence.error_message,/\[REDACTED\]/);
});

test('403 Error message만 승인 필요를 주장하면 payload 근거가 없어 VERIFY_REQUIRED로 유지한다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const result=capability.classifyFinanceError(Object.assign(
    new Error('APPROVAL_REQUIRED restricted client'),
    {status:403}
  ));

  assert.equal(result.status,'VERIFY_REQUIRED');
  assert.equal(result.evidence.error_message,'APPROVAL_REQUIRED restricted client');
});

test('Cafe24 403 payload가 scope 부족을 명시하면 OAuth 재연결로 분류한다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const result=capability.classifyFinanceError({
    status:403,
    payload:{error:{code:'INSUFFICIENT_SCOPE',message:'Access token does not include scope authority'}}
  });

  assert.equal(result.status,'RECONNECT_REQUIRED');
  assert.equal(result.shouldCollect,false);
  assert.equal(result.reconnectUrl,'/oauth/cafe24/start');
  assert.match(result.action,/OAuth.*다시 연결/);
});

test('Cafe24 제한 클라이언트 승인 payload가 명시된 경우에만 승인 필요로 분류한다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const result=capability.classifyFinanceError({
    status:403,
    payload:{error:{code:'RESTRICTED_CLIENT',message:'해당 API는 특정 클라이언트만 사용할 수 있습니다. Cafe24 개발자센터로 문의해주세요.'}}
  });

  assert.equal(result.status,'APPROVAL_REQUIRED');
  assert.equal(result.shouldCollect,false);
  assert.match(result.action,/개발자센터.*승인/);
  assert.equal(result.evidence.error_code,'RESTRICTED_CLIENT');
});

test('Cafe24 매출통계 권한이 토큰에 없으면 승인 완료로 오인하지 않고 OAuth 재연결을 요구한다',()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const result=capability.assessFinanceCapability({
    access_token:'stored',
    scopes:['mall.read_product','mall.read_order','mall.read_analytics']
  });

  assert.equal(result.status,'RECONNECT_REQUIRED');
  assert.equal(result.scope,'mall.read_salesreport');
  assert.equal(result.shouldCollect,false);
  assert.match(result.action,/OAuth.*다시 연결/);
  assert.equal(result.reconnectUrl,'/oauth/cafe24/start');
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

test('Cafe24 매출통계 권한 확인은 실제 API 200과 명시적 scope 부족을 구분한다',async()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const token={access_token:'stored',scopes:['mall.read_order','mall.read_salesreport']};
  const ready=await capability.verifyFinanceCapability({mallId:'mall',shopNo:1},token,{
    adminGet:async()=>({status:200,payload:{financials:[]}}),
    now:new Date('2026-09-02T00:00:00Z')
  });
  assert.equal(ready.status,'READY');
  assert.equal(ready.verified,true);

  const reconnect=await capability.verifyFinanceCapability({mallId:'mall',shopNo:1},token,{
    adminGet:async()=>{throw Object.assign(new Error('insufficient_scope'),{status:403});},
    now:new Date('2026-09-02T00:00:00Z')
  });
  assert.equal(reconnect.status,'RECONNECT_REQUIRED');
  assert.equal(reconnect.shouldCollect,false);
  assert.match(reconnect.action,/OAuth.*다시 연결/);
});

test('Cafe24 권한 probe의 generic 403은 VERIFY_REQUIRED와 sanitized evidence를 반환한다',async()=>{
  const capability=require('../lib/cafe24/finance-capability.js');
  const token={access_token:'stored',scopes:['mall.read_order','mall.read_salesreport']};
  const result=await capability.verifyFinanceCapability({mallId:'mall',shopNo:1},token,{
    adminGet:async()=>{throw Object.assign(new Error('generic forbidden'),{
      status:403,payload:{error:{
        code:'FORBIDDEN',
        message:'authorization=Bearer token-123 client_secret=very-secret access forbidden'
      }}
    });},
    now:new Date('2026-09-02T00:00:00Z')
  });

  assert.equal(result.status,'VERIFY_REQUIRED');
  assert.equal(result.verified,false);
  assert.equal(result.evidence.error_code,'FORBIDDEN');
  assert.equal(result.evidence.error_message,'authorization=[REDACTED] client_secret=[REDACTED] access forbidden');
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
  const reconnect=capability.callbackDestination(
    'https://hub.example.com/oauth/cafe24/callback',
    {status:'RECONNECT_REQUIRED'}
  );
  const approval=capability.callbackDestination(
    'https://hub.example.com/oauth/cafe24/callback',
    {status:'APPROVAL_REQUIRED'}
  );
  assert.equal(reconnect.toString(),'https://hub.example.com/settlement-costs?cafe24=reconnect-required');
  assert.equal(approval.toString(),'https://hub.example.com/settlement-costs?cafe24=approval-required');
});

test('Cafe24 OAuth 완료 자동화는 매출통계 권한이 확인된 경우에만 즉시 수집을 예약한다',async()=>{
  const completion=require('../lib/cafe24/oauth-completion.js');
  const scheduled=[];
  const triggers=[];
  assert.equal(completion.scheduleAuthorizedSync({
    capability:{status:'RECONNECT_REQUIRED',shouldCollect:false},
    schedule:job=>scheduled.push(job),
    sync:async trigger=>triggers.push(trigger)
  }),false);
  assert.equal(scheduled.length,0);

  assert.equal(completion.scheduleAuthorizedSync({
    capability:{status:'READY',shouldCollect:true},
    schedule:job=>scheduled.push(job),
    sync:async trigger=>triggers.push(trigger)
  }),true);
  assert.equal(scheduled.length,1);
  await scheduled[0]();
  assert.deepEqual(triggers,['OAUTH_CALLBACK']);
});

test('Cafe24 OAuth 콜백은 응답 뒤 자동 수집을 연결한다',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../app/oauth/cafe24/callback/route.js'),'utf8');
  assert.match(source,/from 'next\/server'/);
  assert.match(source,/scheduleAuthorizedSync/);
  assert.match(source,/syncCafe24/);
});
