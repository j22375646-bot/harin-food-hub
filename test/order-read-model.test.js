'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('overlapping list scopes share data work, not mutable results or later reads',async()=>{
 const {createOrderReadModelReader}=require('../lib/orders/order-read-model.js');
 let orders=0,events=0,release;const db={};
 const read=createOrderReadModelReader({loadOrders:async()=>{orders++;await new Promise(r=>release=r);return {orders:[{amount:100}]};},loadEvents:async()=>{events++;return {data:[],error:null};}});
 const a=read(db),b=read(db);await new Promise(setImmediate);assert.equal(orders,1);assert.equal(events,1);release();const [x,y]=await Promise.all([a,b]);x.center.orders[0].amount=0;assert.equal(y.center.orders[0].amount,100);
 const c=read(db);await new Promise(setImmediate);assert.equal(orders,2);release();await c;
});
test('different database instances and failed reads are never shared across scopes',async()=>{
 const {createOrderReadModelReader}=require('../lib/orders/order-read-model.js');let calls=0;
 const read=createOrderReadModelReader({loadOrders:async()=>{calls++;throw Error('fixture');},loadEvents:async()=>({data:[],error:null})});
 const db={};await Promise.allSettled([read(db),read({})]);assert.equal(calls,2);await assert.rejects(read(db));assert.equal(calls,3);
});
