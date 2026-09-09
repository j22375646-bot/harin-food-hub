'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkspaceFinanceSummary}=require('../lib/tenancy/workspace-finance-summary.js');
const healthyEvidence={
 pacing:{month:'2026-09',status:'READY',counts:{CAFE24:1,NAVER:1,COUPANG:1,COUPANG_RG:1},issues:[]},
 dataHealth:{channels:[{platform:'CAFE24',status:'READY'},{platform:'NAVER',status:'READY'},{platform:'COUPANG',status:'READY'}]}
};

test('summary projects only the three approved metrics and marks incomplete sales partial',()=>{
 const summary=buildWorkspaceFinanceSummary({
  generatedAt:'2026-09-09T03:04:05.000Z',...healthyEvidence,pacing:{...healthyEvidence.pacing,status:'PARTIAL'},secretRows:[{id:1}]
 },{
  metrics:{current:{value:1200,status:'READY'},profit:{value:300,status:'READY'},balance:{value:900,status:'PARTIAL'}},
  secretModel:{token:'no'}
 });
 assert.deepEqual(summary,{month:'2026-09',generatedAt:'2026-09-09T03:04:05.000Z',metrics:{sales:{value:1200,status:'PARTIAL'},profit:{value:300,status:'PARTIAL'},balance:{value:900,status:'PARTIAL'}}});
 assert.doesNotMatch(JSON.stringify(summary),/secret|token|source|reason/i);
});

test('summary uses the loader KST month at a UTC month boundary',()=>{
 const summary=buildWorkspaceFinanceSummary({generatedAt:'2026-08-31T15:30:00.000Z',...healthyEvidence},{metrics:{current:{value:1},profit:{value:1,status:'READY'},balance:{value:1,status:'PARTIAL'}}});
 assert.equal(summary.month,'2026-09');
});

test('summary preserves zero and negative numbers but normalizes invalid values to blocked null',()=>{
 const summary=buildWorkspaceFinanceSummary({generatedAt:'2026-09-09T00:00:00.000Z',...healthyEvidence},{metrics:{current:{value:0,status:'READY'},profit:{value:-5,status:'READY'},balance:{value:Infinity,status:'PARTIAL'}}});
 assert.deepEqual(summary.metrics,{sales:{value:0,status:'READY'},profit:{value:-5,status:'READY'},balance:{value:null,status:'BLOCKED'}});
});

test('stale relevant collection evidence downgrades finite sales and profit',()=>{
 const data={generatedAt:'2026-09-09T00:00:00.000Z',...healthyEvidence,dataHealth:{channels:[{platform:'CAFE24',status:'READY'},{platform:'NAVER',status:'STALE'},{platform:'COUPANG',status:'READY'}]}};
 const summary=buildWorkspaceFinanceSummary(data,{metrics:{current:{value:500,status:'READY'},profit:{value:100,status:'READY'},balance:{value:50,status:'PARTIAL'}}});
 assert.deepEqual(summary.metrics,{sales:{value:500,status:'PARTIAL'},profit:{value:100,status:'PARTIAL'},balance:{value:50,status:'PARTIAL'}});
});

test('uncollected empty sources never become confirmed zero actuals',()=>{
 const data={generatedAt:'2026-09-09T00:00:00.000Z',pacing:{month:'2026-09',status:'READY',counts:{CAFE24:0,NAVER:0,COUPANG:0,COUPANG_RG:0},issues:[]},dataHealth:{channels:[{platform:'CAFE24',status:'WAITING'},{platform:'NAVER',status:'FAILED'},{platform:'COUPANG',status:'WAITING'}]}};
 const summary=buildWorkspaceFinanceSummary(data,{metrics:{current:{value:0,status:'READY'},profit:{value:0,status:'READY'},balance:{value:0,status:'PARTIAL'}}});
 assert.deepEqual(summary.metrics,{sales:{value:null,status:'BLOCKED'},profit:{value:null,status:'BLOCKED'},balance:{value:null,status:'BLOCKED'}});
});
