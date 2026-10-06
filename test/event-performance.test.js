'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),p=require('../lib/calendar/event-performance.js');
test('pre/during/post periods are equal length across years and Korean midnight is used',()=>{
 const r=p.periods({date:'2026-12-30',endDate:'2027-01-02'});assert.equal(r.days,4);assert.deepEqual(r.periods.map(x=>[x.from,x.to]),[['2026-12-26','2026-12-29'],['2026-12-30','2027-01-02'],['2027-01-03','2027-01-06']]);
 const v=p.summarize([{order_id:'x',order_date:'2026-12-29T15:00:00Z',paid_amount:'1000'}],p.sources[0],r.periods[1],'2027-01-10');assert.equal(v.orders,1);assert.equal(v.amount,1000);
 const missing=p.summarize([{order_id:'x',order_date:'2026-12-30',paid_amount:null}],p.sources[0],r.periods[1],'2027-01-10');assert.equal(missing.amount,null);
});
test('partial pages and duplicate rows never become a successful zero, channel failures remain isolated',async()=>{
 const db={from(table){return {select(){return this;},gte(){return this;},lt(){return this;},order(){return this;},async range(){return table==='naver_commerce_orders'?{data:[{order_id:'1',order_date:'2026-09-13',paid_amount:1000}],count:1}:{error:{message:'unavailable'}};}};}};
 const r=await p.load(db,{id:'x',platforms:['NAVER','COUPANG'],date:'2026-09-13',endDate:'2026-09-13'},new Date('2026-09-15T00:00:00Z'));assert.equal(r.channels.length,3);assert.equal(r.channels[0].periods[1].amount,1000);assert.equal(r.channels[1].periods[1].amount,null);assert.equal(r.coverage,'UNCONFIRMED');assert.equal(r.channels[2].key,'COUPANG_RG');
 const bad={from(){return {select(){return this;},gte(){return this;},lt(){return this;},order(){return this;},range:async()=>({count:5001,data:[]})};}};await assert.rejects(()=>p.readSource(bad,p.sources[0],'2026-09-01','2026-09-30'));
});
