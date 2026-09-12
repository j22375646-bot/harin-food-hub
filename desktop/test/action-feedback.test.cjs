'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOrderChanges}=require('../ui/action-feedback.js');
const row=(quantity=1)=>({hubOrderId:'a',productName:'검증 상품',quantity,stage:'PAID',amount:1000});
test('first/identical reads are quiet; changed values are consumed once',()=>{
 const t=createOrderChanges();t.accept('same',[row()],true,0);assert.equal(t.take('a',1),false);
 t.accept('same',[row()],true,2);assert.equal(t.take('a',3),false);
 t.accept('same',[row(2)],true,4);assert.equal(t.take('a',5),true);assert.equal(t.take('a',6),false);
 t.accept('same',[row(2)],true,7);assert.equal(t.take('a',8),false);
});
test('newly visible rows, page/query isolation, partial and session reset, expiry',()=>{
 const t=createOrderChanges();t.accept('first',[],true,0);t.accept('first',[row()],true,1);assert.equal(t.take('a',2),true);
 t.accept('page2',[row(2)],true,3);assert.equal(t.take('a',4),false);
 t.accept('page2',[row(3)],false,5);t.accept('page2',[row(4)],true,6);assert.equal(t.take('a',7),false);
 t.reset();t.accept('page2',[row(5)],true,8);assert.equal(t.take('a',9),false);
 t.accept('page2',[row(6)],true,10);assert.equal(t.take('a',8011),false);
});
test('fetch timestamps do not create change effects; shipping changes do',()=>{
 const t=createOrderChanges();t.accept('x',[{...row(),checkedAt:'yesterday'}],true,0);
 t.accept('x',[{...row(),checkedAt:'today'}],true,1);assert.equal(t.take('a',2),false);
 t.accept('x',[{...row(),details:{delivery:{status:'DELIVERED'}}}],true,3);assert.equal(t.take('a',4),true);
});
