'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const center=require('../lib/customer-service/unified-center.js');

const readyChannels=['NAVER','COUPANG','CAFE24'].map(platform=>({platform,capabilities:[
  {key:'inquiries',read:{status:'READY',label:'가능'}},{key:'claims',read:{status:'READY',label:'가능'}}
]}));

test('미답변 문의를 오늘 처리와 기한 초과로 구분한다',()=>{
  const now=new Date('2026-08-14T12:00:00+09:00');
  assert.equal(center.dueState({occurredAt:'2026-08-14T08:00:00+09:00',now}).code,'TODAY');
  assert.equal(center.dueState({occurredAt:'2026-08-13T08:00:00+09:00',now}).code,'OVERDUE');
  assert.equal(center.dueState({occurredAt:'2026-08-12T08:00:00+09:00',completed:true,now}).code,'COMPLETED');
});

test('문의와 주문 상품 배송상태를 연결한다',()=>{
  const result=center.buildUnifiedCustomerService({
    now:new Date('2026-08-14T12:00:00+09:00'),channelConnections:readyChannels,
    coupangOrders:[{order_id:'O1',shipment_box_id:'S1',status:'DELIVERING',ordered_at:'2026-08-14',gross_amount:15000}],
    coupangOrderItems:[{order_id:'O1',product_name:'작두콩차',quantity:2}],
    coupangInquiries:[{inquiry_key:'Q1',inquiry_id:'1',order_id:'O1',answered:false,inquired_at:'2026-08-14T09:00:00+09:00'}]
  });
  assert.equal(result.active[0].order.status,'DELIVERING');
  assert.equal(result.active[0].order.products[0].name,'작두콩차');
  assert.equal(result.summary.linkedOrders,1);
});

test('처리 완료된 문의와 클레임은 기본 활성 목록에서 제외한다',()=>{
  const result=center.buildUnifiedCustomerService({
    now:new Date('2026-08-14T12:00:00+09:00'),channelConnections:readyChannels,
    coupangInquiries:[{inquiry_key:'Q1',inquiry_id:'1',answered:true,inquired_at:'2026-08-13'}],
    coupangReturns:[{receipt_id:'R1',status:'SUCCESS',requested_at:'2026-08-13'}]
  });
  assert.equal(result.active.length,0);
  assert.equal(result.summary.completed,2);
});

test('취소와 반품을 구분하고 교환을 공통 단계로 만든다',()=>{
  const result=center.buildUnifiedCustomerService({
    now:new Date('2026-08-14T12:00:00+09:00'),channelConnections:readyChannels,
    coupangReturns:[{receipt_id:'C1',cancel_type:'CANCEL',status:'RELEASE_STOP_UNCHECKED',requested_at:'2026-08-14'} ,{receipt_id:'R1',cancel_type:'RETURN',status:'RETURNS_UNCHECKED',requested_at:'2026-08-14'}],
    coupangExchanges:[{exchange_id:'E1',status:'PROGRESS',requested_at:'2026-08-14'}]
  });
  assert.deepEqual(new Set(result.active.map(row=>row.kind)),new Set(['CANCEL','RETURN','EXCHANGE']));
  assert.equal(result.summary.claims,3);
});

test('채널이 연결되지 않으면 빈 0건이 아니라 설정 필요 상태를 유지한다',()=>{
  const result=center.buildUnifiedCustomerService({channelConnections:[{platform:'NAVER',capabilities:[{key:'inquiries',read:{status:'SETUP_REQUIRED',label:'설정 필요',reason:'API 키 필요'}}]}]});
  const naver=result.channelStates.find(item=>item.platform==='NAVER');
  assert.equal(naver.status,'SETUP_REQUIRED');
  assert.match(naver.message,/API 키/);
});

test('권한만 확인되고 실제 수집기가 없는 채널은 수집 연결 대기로 표시한다',()=>{
  const result=center.buildUnifiedCustomerService({channelConnections:readyChannels});
  const cafe24=result.channelStates.find(item=>item.platform==='CAFE24');
  const coupang=result.channelStates.find(item=>item.platform==='COUPANG');
  assert.equal(cafe24.status,'VERIFY_REQUIRED');
  assert.equal(cafe24.statusLabel,'수집 연결 대기');
  assert.equal(coupang.status,'READY');
});

test('처리 감사기록을 문의에 연결한다',()=>{
  const result=center.buildUnifiedCustomerService({
    now:new Date('2026-08-14T12:00:00+09:00'),channelConnections:readyChannels,
    coupangInquiries:[{inquiry_key:'Q1',inquiry_id:'55',answered:false,inquired_at:'2026-08-14'}],
    operationAudits:[{id:'A1',target_type:'INQUIRY',target_id:'55',operation_type:'REPLY_ONLINE',status:'SUCCESS',executed_at:'2026-08-14T10:00:00+09:00'}]
  });
  assert.equal(result.rows[0].audit.status,'SUCCESS');
  assert.equal(result.rows[0].audit.operationType,'REPLY_ONLINE');
});

test('검색과 유형 필터는 활성 요청만 반환한다',()=>{
  const rows=[
    {platform:'COUPANG',kind:'INQUIRY',completed:false,due:{code:'TODAY'},sourceId:'1',title:'배송 문의',content:'언제 오나요'},
    {platform:'COUPANG',kind:'RETURN',completed:false,due:{code:'OVERDUE'},sourceId:'2',title:'반품',content:'회수'},
    {platform:'COUPANG',kind:'INQUIRY',completed:true,due:{code:'COMPLETED'},sourceId:'3',title:'완료',content:'완료'}
  ];
  assert.equal(center.filterRows(rows,{kind:'INQUIRY'}).length,1);
  assert.equal(center.filterRows(rows,{query:'회수'}).length,1);
  assert.equal(center.filterRows(rows,{activeOnly:false}).length,3);
});

test('답변 템플릿은 실제 전송 전 초안만 제공한다',()=>{
  assert.ok(center.REPLY_TEMPLATES.length>=5);
  assert.ok(center.REPLY_TEMPLATES.every(item=>item.content.includes('하린식품')));
});
