'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { projectOrdersPayload } = require('../hub-connection.cjs');
const project = order => projectOrdersPayload({ok:true, orders:[order], total:1, offset:0, nextOffset:null, snapshot:'a'.repeat(64), partial:false}, '2026-09-08T00:00:00Z').orders[0].details;

test('detail projection includes bounded operational fields without receiver, raw labels or image URLs', () => {
  const detail = project({externalOrderId:'CHANNEL-123', items:[{name:'차', option:'3봉', quantity:3, imageUrl:'SECRET'}], invoice:{status:'REGISTERED',number:'1234567890123',label:'SECRET'}, listDeliveryBadge:{status:'IN_TRANSIT',source:'EPOST',detail:'SECRET'}, cancelled:false, cancellationRequested:true, receiver:{name:'SECRET'}, token:'SECRET'});
  assert.deepEqual(detail, {externalOrderId:'CHANNEL-123',items:[{name:'차',option:'3봉',quantity:3}],invoice:{status:'REGISTERED',number:'1234567890123'},delivery:{status:'IN_TRANSIT',source:'EPOST'},cancelled:false,cancellationRequested:true});
  assert.equal(JSON.stringify(detail).includes('SECRET'), false);
  for (const value of [detail, detail.items, detail.items[0], detail.invoice, detail.delivery]) assert.equal(Object.isFrozen(value),true);
});

test('missing or malformed detail never becomes cleared cancellation or known shipment status', () => {
  for (const source of [{}, {items:'bad',invoice:{status:'REGISTERED',number:'123'},listDeliveryBadge:{status:'DELIVERED',source:'unknown'},cancelled:'false',cancellationRequested:0}]) {
    assert.deepEqual(project(source),{externalOrderId:'',items:[],invoice:null,delivery:null,cancelled:null,cancellationRequested:null});
  }
  for (const quantity of [null,0,-1,1.5,'2',Infinity]) assert.equal(project({items:[{quantity}]}).items[0].quantity,null);
  const bounded = project({items:Array.from({length:30},()=>({name:'a'.repeat(2000),quantity:2}))});
  assert.equal(bounded.items.length,8);
  assert.equal(bounded.items[0].name.length,500);
});

test('detail consumes actual server adapter contract while keeping PII outside desktop DTO', () => {
  const { buildOrderPage } = require('../../lib/ui/phase28-adapters/orders.js');
  const page = buildOrderPage([{hubOrderId:'H1',externalOrderId:'C1',platform:'CAFE24',stage:'SHIPPING',invoiceNumber:'1234567890123',tracking:{statusCode:'IN_TRANSIT'},items:[{name:'차',option:'1상자',quantity:2}],receiver:{name:'PRIVATE',contact:'PRIVATE',address:'PRIVATE'}}],[],{stage:'IN_TRANSIT'});
  const row = projectOrdersPayload({ok:true,...page,partial:false},'2026-09-08T00:00:00Z',{scope:'IN_TRANSIT'}).orders[0];
  assert.equal(row.details.externalOrderId,'C1');
  assert.deepEqual(row.details.invoice,{status:'REGISTERED',number:'1234567890123'});
  assert.deepEqual(row.details.delivery,{status:'IN_TRANSIT',source:'EPOST'});
  assert.deepEqual(row.details.items,[{name:'차',option:'1상자',quantity:2}]);
  assert.equal(JSON.stringify(row).includes('PRIVATE'),false);
});
