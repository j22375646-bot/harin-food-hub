'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const calendar=require('../lib/shipping-reference/business-calendar.js');
const address=require('../lib/shipping-reference/address-client.js');
const holiday=require('../lib/shipping-reference/holiday-client.js');
const readiness=require('../lib/shipping-reference/readiness.js');

test('15시 마감 뒤 주문은 다음 영업일, 주말 주문은 월요일로 계산한다',()=>{
  const fridayAfter=calendar.calculateShippingEstimate({orderedAt:'2026-08-14T15:01:00+09:00',asOf:'2026-08-14T16:00:00+09:00',holidayReady:true});
  const saturday=calendar.calculateShippingEstimate({orderedAt:'2026-08-15T10:00:00+09:00',asOf:'2026-08-15T11:00:00+09:00',holidayReady:true});
  assert.equal(fridayAfter.plannedShipDate,'2026-08-17');
  assert.equal(saturday.plannedShipDate,'2026-08-17');
});

test('공휴일이 월요일이면 다음 화요일 출고로 계산한다',()=>{
  const estimate=calendar.calculateShippingEstimate({orderedAt:'2026-08-14T16:00:00+09:00',asOf:'2026-08-14T17:00:00+09:00',holidayReady:true,holidayDates:['20260817']});
  assert.equal(estimate.plannedShipDate,'2026-08-18');
  assert.equal(estimate.confidence,'READY');
});

test('공휴일 자료가 없으면 확정 지연 대신 부분 판단을 반환한다',()=>{
  const estimate=calendar.calculateShippingEstimate({orderedAt:'2026-08-13T10:00:00+09:00',asOf:'2026-08-14T10:00:00+09:00'});
  assert.equal(estimate.status,'OVERDUE');
  assert.equal(estimate.confidence,'PARTIAL');
  assert.match(estimate.note,/공휴일 키/);
});

test('주소 검색 전에 우편번호 연락처 동호수 상세를 제거한다',()=>{
  const sanitized=address.sanitizeRoadQuery('(31184) 충청남도 천안시 동남구 일봉로 20 204동 405호 010-1234-5678');
  assert.equal(sanitized,'충청남도 천안시 동남구 일봉로 20');
  assert.doesNotMatch(sanitized,/405|010/);
});

test('공식 특일 XML을 최소 공개 필드로 정규화한다',()=>{
  const rows=holiday.parseHolidayXml('<?xml version="1.0"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items><item><dateName>광복절</dateName><isHoliday>Y</isHoliday><locdate>20260815</locdate></item></items></body></response>');
  assert.deepEqual(rows,[{date:'20260815',name:'광복절',isHoliday:true}]);
});

test('공공데이터포털의 URL 인코딩 키를 한 번만 디코딩해 요청한다',async()=>{
  let requested;await holiday.readYear({config:{endpoint:'https://apis.data.go.kr/example',apiKey:'abc%2B123%3D'},year:2026,fetchImpl:async url=>{requested=url;return {ok:true,status:200,text:async()=>'<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items></items></body></response>'};}});
  assert.equal(requested.searchParams.get('ServiceKey'),'abc+123=');
});

test('주소 조회 성공 기록에는 원문과 후보를 저장하지 않는다',async()=>{
  let saved;
  const db={from(){return {insert(row){saved=row;return {select(){return {single:async()=>({data:{id:'1',provider:row.provider,status:row.status,fetched_at:row.fetched_at},error:null})}}}}}}};
  const fetchImpl=async()=>({json:async()=>({results:{common:{errorCode:'0',totalCount:'1'},juso:[{roadAddr:'전남 순천시 승주로 1',jibunAddr:'전남 순천시 승주읍 1',zipNo:'57908'}]}})});
  const result=await readiness.probeAddress({db,query:'전남 순천시 승주로 1',env:{JUSO_ROAD_ADDRESS_API_KEY:'test'},fetchImpl,now:new Date('2026-08-17T00:00:00Z')});
  assert.equal(result.candidates.length,1);
  assert.deepEqual(saved.source_data,{});
  assert.equal(saved.metadata.raw_query_stored,false);
  assert.doesNotMatch(JSON.stringify(saved),/승주로/);
});

test('19-3 real route and owner-only probe endpoints stay wired',()=>{
  const root=path.join(__dirname,'..');
  const route=fs.readFileSync(path.join(root,'app','data-collection','shipping-reference','page.js'),'utf8');
  const handler=fs.readFileSync(path.join(root,'lib','shipping-reference','route-handler.js'),'utf8');
  const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260817193000_add_shipping_reference_snapshots.sql'),'utf8');
  assert.match(route,/workspace:'shipping-reference'/);
  assert.match(handler,/verifySession/);
  assert.match(handler,/content-length/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/shipping_reference_address_source_empty/);
});

test('23 recovery lets the first road-address sample verify a pending connector',()=>{
  const root=path.join(__dirname,'..');
  const center=fs.readFileSync(path.join(root,'app','shipping-reference-center.js'),'utf8');
  const guard=fs.readFileSync(path.join(root,'lib','provider-operations','request-guard.js'),'utf8');
  assert.match(center,/!\['SETUP_REQUIRED','LOCKED'\]\.includes\(addressService\.status\)/);
  assert.match(center,/도로명주소 첫 샘플 조회가 연결 확인/);
  assert.match(guard,/active\?\.id\|\|null/);
});
