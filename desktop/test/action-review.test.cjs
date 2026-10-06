'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createActionReview}=require('../action-review.cjs');
function setup(timeoutMs=1000){
  let answer;const sent=[],window=new EventEmitter();window.isDestroyed=()=>false;window.webContents=new EventEmitter();window.webContents.send=(...args)=>sent.push(args);
  const show=createActionReview({ipcMain:{handle:(_name,fn)=>answer=fn},getMainWindow:()=>window,isTrustedRenderer:event=>event==='trusted',timeoutMs});
  return {window,sent,show,answer:(...args)=>answer(...args)};
}
test('review accepts only trusted recipient and current one-use token; busy fails closed',async()=>{
  const e=setup(),pending=e.show(e.window,{message:'<img> literal',buttons:['cancel','send']}),token=e.sent[0][1].token;
  assert.equal(e.sent[0][1].message,'<img> literal');
  assert.deepEqual(await e.show(e.window,{}),{response:0});
  assert.equal(e.answer('foreign',token,1),false);assert.equal(e.answer('trusted','wrong',1),false);assert.equal(e.answer('trusted',token,true),false);
  assert.equal(e.answer('trusted',token,1),true);assert.deepEqual(await pending,{response:1});assert.equal(e.answer('trusted',token,1),false);
});
test('review navigation and expiry cancel without authorizing any work',async()=>{
  const e=setup(10);let pending=e.show(e.window,{});e.window.webContents.emit('did-start-navigation');assert.deepEqual(await pending,{response:0});
  pending=e.show(e.window,{});assert.deepEqual(await pending,{response:0});
});
