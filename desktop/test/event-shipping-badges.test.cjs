'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectVisual}=require('../order-visual.cjs');
const base={stage:'PAID',orderedAt:'2026-09-11T14:59:59+09:00',timingBadge:{type:'SAME_DAY',detail:'서버 판정'},shippingEstimate:{confidence:'READY',plannedShipDate:'2026-09-11'}};
test('shipping badge respects strict 15:00 cutoff and never treats registration as departure',()=>{
 assert.equal(projectVisual(base).timing.label,'당일출고');
 for(const at of ['2026-09-11T15:00:00+09:00','2026-09-11T15:00:59+09:00','invalid'])assert.equal(projectVisual({...base,orderedAt:at}).timing.type,'CHECK_REQUIRED');
 for(const stage of ['SHIPPING','IN_TRANSIT','DELIVERED','CANCELLED'])assert.equal(projectVisual({...base,stage}),undefined);
 assert.equal(projectVisual({...base,invoiceNumber:'1234567890123'}).timing.label,'당일출고');
 assert.equal(projectVisual({...base,shippingEstimate:{...base.shippingEstimate,confidence:'PARTIAL'}}).timing.label,'당일출고 예정');
 const delayed={...base,timingBadge:{type:'DELAYED'}};assert.equal(projectVisual(delayed).timing.label,'배송지연');assert.equal(projectVisual({...delayed,shippingEstimate:{confidence:'PARTIAL'}}).timing.label,'출고 지연 확인');
 assert.equal(projectVisual({...base,orderedAt:'2026-09-10T16:00:00+09:00'}).timing.label,'오늘 출고 예정');
});
test('edited event gift rule reaches the same order projection with amount and date boundaries',()=>{
 const {resolveEventGift}=require('../../lib/calendar/calendar-center.js');const event={id:'event',type:'EVENT',status:'OPEN',title:'행사',date:'2026-09-10',endDate:'2026-09-30',giftTiers:[{minimumAmount:30000,giftName:'차',quantity:1},{minimumAmount:50000,giftName:'컵',quantity:2}]};
 for(const [amount,expected] of [[29999,null],[30000,'차'],[49999,'차'],[50000,'컵']]){const gift=resolveEventGift(event,{orderAmount:amount,date:'2026-09-11'});const visual=projectVisual({giftRequired:Boolean(gift),gifts:gift?[gift]:[]});assert.equal(visual?.gifts?.[0]?.name||null,expected);}
 assert.equal(resolveEventGift(event,{orderAmount:50000,date:'2026-10-01'}),null);
});

test('registered but not departed overdue orders retain a delay badge only with confirmed calendar data',()=>{
 const order={stage:'WAITING_FOR_CARRIER',shippingEstimate:{status:'OVERDUE',plannedShipDate:'2026-09-10',confidence:'READY'}};
 assert.equal(projectVisual(order).timing.label,'배송지연');assert.equal(projectVisual({...order,stage:'SHIPPING'}),undefined);
 assert.equal(projectVisual({...order,shippingEstimate:{...order.shippingEstimate,confidence:'PARTIAL'}}).timing.type,'CHECK_REQUIRED');
});

test('a server cutoff mismatch cannot mark a 15:00 order overdue on its order date plan',()=>{
 const order={...base,orderedAt:'2026-09-11T15:00:00+09:00',timingBadge:{type:'DELAYED'}};assert.equal(projectVisual(order).timing.type,'CHECK_REQUIRED');
});

test('same-day provisional planning stays visible while holiday certainty stays explicit',()=>{
 const result=projectVisual({...base,timingBadge:{type:'SAME_DAY_PARTIAL',detail:'주말 반영 · 공휴일 확인 필요'},shippingEstimate:{...base.shippingEstimate,confidence:'PARTIAL'}}).timing;
 assert.equal(result.label,'당일출고 예정');assert.match(result.detail,/공휴일 확인 필요/);
});
