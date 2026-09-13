'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createInsightBudget} = require('../lib/ai/insight-budget');
test('budget requires confirmed account pricing and rounds reservation upward', async () => {
  const calls=[]; const store={reserve:async x=>(calls.push(x),{allowed:true}),settle:async x=>(calls.push(x),x)};
  assert.equal((await createInsightBudget({store}).reserve({maxCostKrw:1})).reason,'SETUP_REQUIRED');
  const budget=createInsightBudget({store,providerAccountId:'account',pricingVersion:'verified-v1'});
  assert.equal((await budget.reserve({maxCostKrw:30001})).allowed,false);
  await budget.reserve({maxCostKrw:1.01}); assert.equal(calls[0].maxCostKrw,2);
  await budget.settle({status:'UNKNOWN',actualCostKrw:0}); assert.equal(calls[1].actualCostKrw,null);
  await budget.settle({status:'FAILED',actualCostKrw:null}); assert.equal(calls[2].actualCostKrw,null);
  await budget.settle({status:'SUCCEEDED',actualCostKrw:0.1}); assert.equal(calls[3].actualCostKrw,1);
});
test('store preserves billable provider token evidence and drops unrelated usage fields',async()=>{
 const {createInsightStore}=require('../lib/ai/insight-store'); let recorded;
 const store=createInsightStore({db:{from(){},async rpc(name,args){recorded={name,args};return {data:{settled:true},error:null};}}});
 const id='11111111-1111-4111-8111-111111111111';
 await store.settle({tenantId:id,requestId:id,status:'UNKNOWN',usage:{promptTokens:10,completionTokens:20,totalTokens:30,rawPrompt:'do not store',inputTokens:-1}});
 assert.deepEqual(recorded.args.p_usage,{promptTokens:10,completionTokens:20,totalTokens:30});
 assert.equal(recorded.args.p_actual_cost_krw,null);
});
