'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {knownRows,deltaPage,mergePage,parseKnown}=require('../order-page-delta.cjs');
const row=(id,amount=100)=>({hubOrderId:'HR-C24-'+id.repeat(8),amount,receiver:{name:'시험'}});
const page=orders=>({ok:true,partial:false,offset:0,orders,total:orders.length,nextOffset:null,snapshot:'a'.repeat(64)});
test('changed rows only, removal from visible page, additions, reordering and reconstruction',()=>{
 const baseline=[row('A'),row('B'),row('C')],fresh=page([row('D'),row('B',200),row('A')]);
 const delta=deltaPage(fresh,knownRows(baseline));
 assert.deepEqual(delta.orders.map(o=>o.hubOrderId),[row('D').hubOrderId,row('B').hubOrderId]);
 assert.deepEqual(mergePage(delta,baseline),fresh);
 assert.equal(deltaPage(page(baseline),knownRows(baseline)).orders.length,0);
 assert.equal(knownRows([]),'-');assert.deepEqual(mergePage(deltaPage(page([]),knownRows(baseline)),baseline),page([]));
});
test('invalid, duplicate, oversize baselines, unexpected or missing rows are rejected',()=>{
 for(const value of ['', 'private','x'.repeat(2049),knownRows([row('A')])+'~'+knownRows([row('A')])])assert.throws(()=>parseKnown(value));
 const baseline=[row('A')],delta=deltaPage(page([row('A',200)]),knownRows(baseline));
 assert.throws(()=>mergePage({...delta,orders:[]},baseline));
 assert.throws(()=>mergePage({...delta,orders:[row('B')]},baseline));
 assert.throws(()=>deltaPage({...page(baseline),partial:true},'-'));
});

test('delta URL is limited to first-page Main GET and rejects extra data',()=>{
 const policy=require('../connection-policy.cjs'),url=policy.buildOrdersScopeUrl()+'&known='+encodeURIComponent(knownRows([row('A')]));
 assert.equal(policy.isAllowedRemoteRequest({url,method:'GET',webContentsId:0},{}),true);
 for(const change of [{method:'POST'},{webContentsId:99},{url:url+'&extra=1'},{url:url.replace('&known=','&offset=0&snapshot='+'a'.repeat(64)+'&known=')}])assert.equal(policy.isAllowedRemoteRequest({url,method:'GET',webContentsId:0,...change},{}),false);
});
