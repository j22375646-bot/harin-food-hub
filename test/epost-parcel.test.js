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

test('checks idempotency then issues only testYn=Y through encrypted POST data', async () => {
  const calls=[];
  const fetchImpl=async (url, options) => {
    calls.push({url,options,body:String(options.body)});
    if(calls.length===1)return response('<error><error_code>ERR-225</error_code><message>없음</message></error>');
    return response('<xsync><reqNo>REQ-1</reqNo><resNo>RES-1</resNo><regiNo>TESTREGINOAPI</regiNo><orderNo>TEST-HR-C24-ABCDEF12</orderNo></xsync>');
  };
  const result=await client.issueTestShipment(input,{env,fetchImpl});
  assert.equal(result.trackingNo,'TESTREGINOAPI');
  assert.equal(result.testOnly,true);
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/api\.GetResInfo\.jparcel$/);
  assert.match(calls[1].url,/api\.InsertOrder\.jparcel$/);
  assert.equal(calls.every(call=>call.options.method==='POST'),true);
  assert.equal(calls.every(call=>!call.url.includes(env.EPOST_API_KEY)),true);
  assert.equal(calls[1].body.includes('홍길동'),false);
  assert.match(calls[1].body,/regData=/);
});

test('reuses an existing test result without a duplicate InsertOrder call', async () => {
  const calls=[];
  const fetchImpl=async (url,options) => { calls.push({url,options}); return response('<xsync><reqNo>REQ-OLD</reqNo><regiNo>TESTREGINOAPI</regiNo></xsync>'); };
  const result=await client.issueTestShipment(input,{env,fetchImpl});
  assert.equal(result.reused,true);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/api\.GetResInfo\.jparcel$/);
});

test('keeps test and live parcel writes behind independent safety locks', async () => {
  await assert.rejects(() => client.issueTestShipment(input,{env:{...env,EPOST_TEST_WRITES_ENABLED:'false'},fetchImpl:async()=>response('')}), error=>error.code==='EPOST_TEST_WRITE_LOCKED');
  await assert.rejects(() => client.issueTestShipment(input,{env:{...env,EPOST_LIVE_WRITES_ENABLED:'true'},fetchImpl:async()=>response('')}), error=>error.code==='EPOST_LIVE_WRITE_CONFLICT');
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
