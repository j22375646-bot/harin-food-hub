'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  buildPhase28OrdersModel,
  buildPhase28CsModel,
  PHASE28_AVAILABLE_ADAPTERS
}=require('../lib/ui/phase28-adapters/index.js');

test('orders adapter derives seller-delivery work without inventing retry totals',()=>{
  const model=buildPhase28OrdersModel({
    generatedAt:'2026-08-29T01:40:00.000Z',
    unifiedOrders:{
      orders:[
        {hubOrderId:'NV-1',externalOrderId:'20260829-1',platform:'NAVER',channelLabel:'네이버',stage:'PAID',fulfillment:'SELLER',shippingEligible:true,invoiceNumber:'',timingBadge:{type:'DELAYED',label:'배송지연'},productName:'작두콩차',orderedAt:'2026-08-29T01:18:00.000Z',amount:12000,quantity:1,receiver:{name:'김하린',contact:'010-0000-0000',address:'충남 천안시',message:'문 앞'},items:[{name:'작두콩차',option:'30티백',quantity:1}]},
        {hubOrderId:'CP-RG-1',platform:'COUPANG',stage:'PAID',fulfillment:'ROCKET_GROWTH',shippingEligible:false,invoiceNumber:''},
        {hubOrderId:'C24-1',platform:'CAFE24',stage:'DELIVERED',fulfillment:'SELLER',shippingEligible:false,invoiceNumber:'1234567890123'}
      ],
      channels:[{platform:'NAVER',status:'READY',label:'정상',message:'1건 표시'}],
      summary:{actionRequired:1,cancellations:0,windowDays:30,windowStart:'2026-07-31',windowEnd:'2026-08-29'}
    }
  });

  assert.equal(model.hero.workCount,1);
  assert.equal(model.hero.delayedCount,1);
  assert.equal(model.workspaces.find(item=>item.id==='ACTIVE').count,1);
  assert.equal(model.workspaces.find(item=>item.id==='RETRY').status,'CHECK_REQUIRED');
  assert.equal(model.workspaces.find(item=>item.id==='RETRY').count,null);
  assert.equal(model.channels[0].status,'READY');
  assert.equal(model.priorities[0].id,'NV-1');
  assert.equal(model.orders[0].hubOrderId,'NV-1');
  assert.deepEqual(model.orders[0].stageIds,['ACTIVE','EPOST']);
  assert.equal(model.orders[0].receiver.name,'김하린');
  assert.equal(model.orders[0].amount,12000);
  assert.equal(model.orders[0].items[0].option,'30티백');
  assert.equal(model.cutoff.label,'오후 3시');
});

test('orders adapter distinguishes an observed zero from an unavailable client-only retry count',()=>{
  const model=buildPhase28OrdersModel({
    unifiedOrders:{orders:[],channels:[],summary:{cancellations:0,windowDays:30}}
  });

  assert.equal(model.hero.workCount,0);
  assert.equal(model.hero.cancellationCount,0);
  assert.equal(model.workspaces.find(item=>item.id==='ACTIVE').status,'READY');
  assert.equal(model.workspaces.find(item=>item.id==='RETRY').status,'CHECK_REQUIRED');
});

test('cs adapter preserves setup-required channels and due priorities',()=>{
  const model=buildPhase28CsModel({
    generatedAt:'2026-08-29T01:40:00.000Z',
    customerService:{
      active:[
        {id:'C1',sourceId:'C24-101',platform:'CAFE24',kind:'INQUIRY',kindLabel:'배송 문의',title:'배송 문의',content:'언제 도착하나요?',occurredAt:'2026-08-28T22:00:00.000Z',status:'WAITING',due:{code:'OVERDUE',label:'기한 초과',ageHours:27},orderId:'O-1',order:{orderId:'O-1',status:'PAID',amount:12000,products:[{name:'작두콩차',option:'30티백',quantity:1}]}},
        {id:'N1',platform:'NAVER',kind:'RETURN',title:'반품 문의',content:'반품 접수',due:{code:'TODAY',label:'오늘 처리',ageHours:2}}
      ],
      channelStates:[{platform:'NAVER',status:'SETUP_REQUIRED',statusLabel:'설정 필요',message:'연결 필요'}],
      templates:[{id:'SHIPPING',label:'배송 확인',content:'배송 상태를 확인하겠습니다.'}],
      summary:{active:2,unanswered:1,overdue:1,claims:1,linkedOrders:1,completed:4}
    }
  });

  assert.equal(model.hero.activeCount,2);
  assert.equal(model.hero.overdueCount,1);
  assert.equal(model.hero.unansweredCount,1);
  assert.equal(model.channels[0].status,'SETUP_REQUIRED');
  assert.equal(model.priorities[0].id,'C1');
  assert.equal(model.priorities[0].dueCode,'OVERDUE');
  assert.equal(model.priorities[0].linkedOrder,true);
  assert.equal(model.rows[0].sourceId,'C24-101');
  assert.equal(model.rows[0].kindLabel,'배송 문의');
  assert.equal(model.rows[0].order.products[0].option,'30티백');
  assert.equal(model.templates[0].id,'SHIPPING');
  assert.equal(model.rows[0].stageIds.includes('ACTIVE'),true);
  assert.equal(model.rows[1].stageIds.includes('CLAIMS'),true);
});

test('orders and cs adapters are advertised as available without removing main',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses']);
});
