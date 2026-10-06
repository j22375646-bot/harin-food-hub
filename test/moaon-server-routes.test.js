'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {check,required}=require('../scripts/check-moaon-server-routes');
test('orders-only server build cannot be shipped to the installed Moaon app',()=>{
 assert.throws(()=>check({'/api/moaon/businesses/route':'businesses.js','/api/moaon/businesses/[tenantId]/orders/route':'orders.js'}),/cs.*inventory.*finance/);
});
test('complete emitted routes pass, missing CS blocks deployment',()=>{
 const manifest=Object.fromEntries(required.map(route=>[route+'/route','compiled.js']));
 assert.equal(check(manifest),20);
 delete manifest['/api/moaon/businesses/[tenantId]/cs/route'];assert.throws(()=>check(manifest),/cs/);
});
