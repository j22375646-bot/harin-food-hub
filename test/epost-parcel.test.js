'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parcel = require('../lib/epost/parcel.js');
const client = require('../lib/epost/client.js');

const env = {
  EPOST_API_KEY:'test-auth-key', EPOST_SECURITY_KEY:'0123456789abcdef',
  EPOST_CUSTOMER_NO:'1234567890', EPOST_CONTRACT_APPROVAL_NO:'1234567890',
  EPOST_OFFICE_SERIAL:'12345', EPOST_TEST_WRITES_ENABLED:'true',
  EPOST_LIVE_WRITES_ENABLED:'false'
};

const input = {
  hubOrderId:'HR-C24-ABCDEF12', platform:'CAFE24', goodsName:'작두콩차&선물', quantity:2,
  weight:2, volume:60, asOf:'2026-08-14T03:00:00Z',
  receiver:{ name:'홍길동', postCode:'12345', address:'서울시 테스트로 1', addressDetail:'101호', contact:'010-1234-5678', message:'문 앞' }
};

function response(xml, status = 200) {
  return { ok:status >= 200 && status < 300, status, text:async () => xml };
}

test('builds a test-only parcel request and validates required delivery fields', () => {
  const result = parcel.testApplication(input, { customerNo:'1234567890',approvalNo:'1234567890',officeSerial:'12345' });
  assert.match(result.plainText, /testYn=Y/);
  assert.match(result.plainText, /printYn=N/);
  assert.match(result.plainText, /orderNo=TEST-HR-C24-ABCDEF12/);
  assert.doesNotMatch(result.plainText, /goodsNm=[^&]*&선물/);
  assert.equal(result.shipment.receiver.contact, '01012345678');
  assert.equal(parcel.validateTestShipment({ ...input, receiver:{ ...input.receiver, postCode:'' } }).ok, false);
});

test('uses the official contract-parcel HTTP endpoint and classifies transport failures for retry', async () => {
  assert.equal(client.BASE_URL, 'http://ship.epost.go.kr');
  const transportError = Object.assign(new Error('fetch failed'), {
    cause:Object.assign(new Error('socket reset'), { code:'ECONNRESET' })
  });
  await assert.rejects(
    () => client.requestXml('api.GetResInfo.jparcel', 'custNo=1234567890', {
      env,
      fetchImpl:async () => { throw transportError; }
    }),
    error => error.code === 'EPOST_NETWORK_ERROR'
      && error.retryable === true
      && /ECONNRESET/.test(error.message)
  );
});

test('checks idempotency then issues only testYn=Y through the documented encrypted GET query', async () => {
  const calls=[];
  const fetchImpl=async (url, options) => {
    calls.push({url:String(url),options});
    if(calls.length===1)return response('<error><error_code>ERR-225</error_code><message>없음</message></error>');
    return response('<xsync><reqNo>REQ-1</reqNo><resNo>RES-1</resNo><regiNo>TESTREGINOAPI</regiNo><orderNo>TEST-HR-C24-ABCDEF12</orderNo></xsync>');
  };
  const result=await client.issueTestShipment(input,{env,fetchImpl});
  assert.equal(result.trackingNo,'TESTREGINOAPI');
  assert.equal(result.testOnly,true);
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/api\.GetResInfo\.jparcel\?/);
  assert.match(calls[1].url,/api\.InsertOrder\.jparcel\?/);
  assert.equal(calls.every(call=>call.options.method==='GET'),true);
  assert.equal(calls.every(call=>call.options.body===undefined),true);
  assert.equal(new URL(calls[1].url).searchParams.get('key'),env.EPOST_API_KEY);
  assert.equal(calls[1].url.includes('홍길동'),false);
  assert.ok(new URL(calls[1].url).searchParams.get('regData'));
});

test('keeps Korea Post maintenance responses pending for an automatic retry', async () => {
  await assert.rejects(
    () => client.requestXml('api.GetResInfo.jparcel', 'custNo=1234567890', {
      env,
      fetchImpl:async () => response('<html><title>작업 안내</title><p>전산시스템 작업 안내</p><p>서비스가 일시 중단되오니 양해 부탁드립니다.</p></html>',404)
    }),
    error => error.code === 'EPOST_MAINTENANCE'
      && error.retryable === true
      && /점검 중/.test(error.message)
  );
});

test('reuses an existing test result without a duplicate InsertOrder call', async () => {
  const calls=[];
  const fetchImpl=async (url,options) => { calls.push({url,options}); return response('<xsync><reqNo>REQ-OLD</reqNo><regiNo>TESTREGINOAPI</regiNo></xsync>'); };
  const result=await client.issueTestShipment(input,{env,fetchImpl});
  assert.equal(result.reused,true);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/api\.GetResInfo\.jparcel\?/);
});

test('discovers only safe office identifiers without returning address or contact data', async () => {
  const xml='<xsync><officeInfo><officeSer>06</officeSer><officeNm>하린식품 발송지</officeNm><regiPoNm>승주우체국</regiPoNm><officeAddr>비공개 주소</officeAddr><officeTelno>061-000-0000</officeTelno></officeInfo></xsync>';
  const offices=client.parseOfficeList(xml);
  assert.deepEqual(offices,[{officeSerial:'06',officeName:'하린식품 발송지',registrationPostOffice:'승주우체국'}]);
  assert.equal(JSON.stringify(offices).includes('비공개 주소'),false);
  assert.equal(JSON.stringify(offices).includes('061-000-0000'),false);
});

test('keeps test and live parcel writes behind independent safety locks', async () => {
  await assert.rejects(() => client.issueTestShipment(input,{env:{...env,EPOST_TEST_WRITES_ENABLED:'false'},fetchImpl:async()=>response('')}), error=>error.code==='EPOST_TEST_WRITE_LOCKED');
  await assert.rejects(() => client.issueTestShipment(input,{env:{...env,EPOST_LIVE_WRITES_ENABLED:'true'},fetchImpl:async()=>response('')}), error=>error.code==='EPOST_LIVE_WRITE_CONFLICT');
});

test('builds and issues a live parcel once, then reuses the assigned tracking number', async () => {
  const live=parcel.liveApplication(input,{customerNo:'1234567890',approvalNo:'1234567890',officeSerial:'12345'});
  assert.match(live.plainText,/testYn=N/);
  assert.match(live.plainText,/orderNo=HR-C24-ABCDEF12/);
  assert.match(live.plainText,/recTel=01012345678/);
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url,options});
    if(calls.length===1)return response('<error><error_code>ERR-225</error_code><message>없음</message></error>');
    return response('<xsync><reqNo>REQ-LIVE</reqNo><resNo>RES-LIVE</resNo><regiNo>6012345678901</regiNo></xsync>');
  };
  const result=await client.issueShipment(input,{env:{...env,EPOST_LIVE_WRITES_ENABLED:'true'},fetchImpl});
  assert.equal(result.trackingNo,'6012345678901');
  assert.equal(result.live,true);
  assert.equal(calls.length,2);
});

test('live issuance remains locked unless the dedicated worker flag is enabled', async () => {
  await assert.rejects(()=>client.issueShipment(input,{env,fetchImpl:async()=>response('')}),error=>error.code==='EPOST_LIVE_WRITE_LOCKED');
});

test('test issuance route requires auth, explicit test confirmation and the encrypted worker queue', () => {
  const root=path.resolve(__dirname,'..');
  const route=fs.readFileSync(path.join(root,'app/api/epost/test-issue/route.js'),'utf8');
  assert.match(route,/apiSafety\.isAuthorized\(request, authModule\)/);
  assert.match(route,/body\.confirm !== true \|\| body\.testOnly !== true/);
  assert.match(route,/EPOST_TEST_ISSUE/);
  assert.match(route,/operationQueue\.queueOperation/);
  assert.match(route,/priorSuccess/);
  assert.doesNotMatch(route,/EPOST_API_KEY|EPOST_SECURITY_KEY/);
});

test('live issuance route is authenticated, idempotent and fixed-IP queued', () => {
  const root=path.resolve(__dirname,'..');
  const route=fs.readFileSync(path.join(root,'app/api/epost/issue/route.js'),'utf8');
  assert.match(route,/apiSafety\.isAuthorized\(request, authModule\)/);
  assert.match(route,/EPOST_LIVE_ISSUE/);
  assert.match(route,/idempotencyKey:`epost-live:\$\{hubOrderId\}`/);
  assert.match(route,/operationQueue\.queueOperation/);
  assert.doesNotMatch(route,/EPOST_API_KEY|EPOST_SECURITY_KEY/);
});
