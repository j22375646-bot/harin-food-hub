'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {encodeTargets,parseTargets,projectFeed,TENANT}=require('../shipping-progress-contract.cjs');
const a='HR-C24-AAAAAAAA',b='HR-CP-BBBBBBBB',req='12345678-1234-4234-8234-123456789012',at='2026-10-24T06:00:00.000Z';
const targets=[{hubOrderId:a},{hubOrderId:b,shipmentId:'123456789'}];
const row=(hubOrderId=a)=>({hubOrderId,platform:hubOrderId===a?'CAFE24':'COUPANG',phase:'REGISTER',status:'PENDING',requestId:req,createdAt:at,updatedAt:at,nextAttemptAt:null});
const payload=()=>({ok:true,contract:1,tenantId:TENANT,scopeKey:'a'.repeat(64),checkedAt:at,partial:false,items:[row(),row(b)]});
test('progress targets are bounded, canonical and never accept renderer identity fields',()=>{
 assert.deepEqual(parseTargets(encodeTargets(targets)),targets);
 for(const input of ['',a+','+a,b,b+':bad',a+':123',Array(21).fill(a).join(','),'HR-NV-AAAAAAAA'])assert.throws(()=>parseTargets(input));
 assert.throws(()=>encodeTargets([{hubOrderId:a,tenantId:TENANT}]));
});
test('feed projects only matched order states and stable server timestamps',()=>{
 const p=payload();p.items[0].receiver='PRIVATE';p.secret='PRIVATE';
 const r=projectFeed(p,targets);assert.equal(r.items[0].updatedAt,at);assert.equal(r.items[0].receiver,undefined);assert.equal(r.secret,undefined);
 for(const mutate of [p=>p.partial=true,p=>p.tenantId='other',p=>p.items.pop(),p=>p.items[1]=row(),p=>p.items[0].updatedAt='bad',p=>p.items[0].status='__proto__',p=>p.items[0].platform='COUPANG',p=>p.items[0].status='REGISTERED'&&(p.items[0].phase='ISSUE')]){const p=payload();mutate(p);assert.throws(()=>projectFeed(p,targets));}
});
