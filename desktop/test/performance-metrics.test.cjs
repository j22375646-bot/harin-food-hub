'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarize,splitTiming}=require('./performance-metrics.cjs');
test('p95 uses nearest rank, preserves samples, and rejects incomplete timings',()=>{
 const values=[10,3,2,8,5,6,7,4,9,1];
 assert.deepEqual(summarize(values),{count:10,min:1,median:5.5,p95:10,max:10});
 assert.equal(values[0],10);assert.throws(()=>summarize([NaN]));assert.throws(()=>summarize([]));
});
test('network wait does not count toward shell readiness',()=>{
 assert.deepEqual(splitTiming({shellReadyMs:200,probeStartMs:300,probeEndMs:10300}),{shellReadyMs:200,probeMs:10000});
 assert.throws(()=>splitTiming({shellReadyMs:200,probeStartMs:300,probeEndMs:100}));
});
