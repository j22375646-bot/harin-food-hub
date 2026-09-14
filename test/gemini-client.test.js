'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createGeminiClient,configuration,buildRequestBody,MODEL,CONFIRMATION_MAX_AGE}=require('../lib/ai/gemini-client');
const {buildPublicMarketSnapshot}=require('../lib/ai/public-market-snapshot');
const NOW=Date.parse('2026-09-14T12:00:00Z');
const env={MOAON_MARKET_AI_ENABLED:'true',GEMINI_API_KEY:'secret-never-return',GEMINI_MODEL:MODEL,GEMINI_FREE_PROJECT_ID:'public-market-test',GEMINI_FREE_TIER_CONFIRMED:'true',GEMINI_DATA_POLICY_CONFIRMED:'true',GEMINI_FREE_PROJECT_CONFIRMED_AT:'2026-09-14T00:00:00Z'};
function args(){return {kind:'TREND_EXPLANATION',snapshot:buildPublicMarketSnapshot({now:NOW,approvedPublicSources:[{kind:'NAVER_SEARCH_TREND',id:'naver-search-trend',url:'https://datalab.naver.com/keyword/trendSearch.naver',observedAt:'2026-09-14T00:00:00Z',period:{start:'2026-09-12',end:'2026-09-13'},points:[{date:'2026-09-12',ratio:50},{date:'2026-09-13',ratio:80}]}]})};}
function response(overrides={}){return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"cards":[],"answer":"확인 필요","nextChecks":[]}' }]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,totalTokenCount:120},...overrides}));}
function client(fetchImpl,customEnv=env){return createGeminiClient({env:customEnv,now:()=>NOW,fetchImpl});}
test('Gemini defaults OFF; explicit model/project/current free/data confirmations required',async()=>{
 assert.equal(configuration({}).status,'DISABLED');
 for(const key of Object.keys(env).filter(key=>key!=='MOAON_MARKET_AI_ENABLED'))assert.equal(configuration({...env,[key]:''},NOW).ready,false,key);
 for(const value of [new Date(NOW+1).toISOString(),new Date(NOW-CONFIRMATION_MAX_AGE).toISOString(),'invalid'])assert.equal(configuration({...env,GEMINI_FREE_PROJECT_CONFIRMED_AT:value},NOW).ready,false);
 assert.equal(configuration({...env,GEMINI_MODEL:'gemini-2.5-pro'},NOW).ready,false);
 assert.equal(configuration(env,NOW).ready,true);assert.equal(configuration(env,NOW).dailyLimit,20);
 assert.equal(JSON.stringify(configuration(env,NOW)).includes(env.GEMINI_API_KEY),false);
 let calls=0;await assert.rejects(client(()=>calls++,{}).generate(args()),{code:'DISABLED'});assert.equal(calls,0);
});
test('Gemini fixed endpoint, header auth, structured JSON, limits and no tools/history',async()=>{
 let calls=0;const result=await client(async(url,init)=>{calls++;assert.equal(url,`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`);assert.equal(init.headers['x-goog-api-key'],env.GEMINI_API_KEY);assert.equal(init.redirect,'error');const body=JSON.parse(init.body);assert.equal(body.generationConfig.maxOutputTokens,1500);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(body.generationConfig.responseJsonSchema);assert.equal(body.tools,undefined);assert.equal(body.contents.length,1);assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'minimal');return response();}).generate(args());
 assert.equal(calls,1);assert.equal(result.model,MODEL);assert.equal(result.usage.totalTokens,120);
});
test('reject arbitrary arguments and internal data before any outgoing call',async()=>{
 let calls=0;const provider=client(async()=>{calls++;return response();});
 for(const key of ['query','question','history','internalData','model','tools'])await assert.rejects(provider.generate({...args(),[key]:'internal-sentinel'}),{code:'DATA_POLICY_BLOCKED'});
 for(const dataClass of ['INTERNAL_AGGREGATE','ORDER_LEDGER'])await assert.rejects(provider.generate({...args(),snapshot:{...args().snapshot,dataClass}}));
 await assert.rejects(provider.generate({...args(),kind:'FREE_QUESTION'}),{code:'DATA_POLICY_BLOCKED'});assert.equal(calls,0);
});
test('injected snapshot fields never cross public exporter boundary',()=>{
 const input=args();input.snapshot.internalData={revenue:123456,question:'internal-sentinel'};input.snapshot.history=['internal-sentinel'];
 input.snapshot.metrics.firstIndex.definition='internal-sentinel';input.snapshot.exclusions=['internal-sentinel'];const outgoing=JSON.stringify(buildRequestBody(input,NOW));assert.equal(outgoing.includes('internal-sentinel'),false);assert.equal(outgoing.includes('123456'),false);assert.ok(Buffer.byteLength(outgoing)<=24*1024);
});
test('429, auth and unavailable errors have no retries, paid fallback, body or key leaks',async()=>{
 for(const [status,code] of [[401,'SETUP_REQUIRED'],[403,'SETUP_REQUIRED'],[429,'QUOTA_BLOCKED'],[500,'UNAVAILABLE']]){let calls=0;await assert.rejects(client(async()=>{calls++;return new Response(env.GEMINI_API_KEY,{status});}).generate(args()),error=>error.code===code&&!error.message.includes('secret'));assert.equal(calls,1);}
 let calls=0;await assert.rejects(client(async()=>{calls++;return response();},{...env,GEMINI_MODEL:'paid-model'}).generate(args()),{code:'SETUP_REQUIRED'});assert.equal(calls,0);
});
test('malformed, oversized, blocked, truncated and tool output fail closed',async()=>{
 for(const value of ['bad json','null','x'.repeat(128*1024+1)])await assert.rejects(client(async()=>new Response(value)).generate(args()),{code:'INVALID_OUTPUT'});
 for(const candidates of [[],[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}],[{finishReason:'STOP',content:{parts:[{functionCall:{name:'execute'}}]}}],[{finishReason:'STOP',content:{parts:[{text:'[]'}]}}]])await assert.rejects(client(async()=>response({candidates})).generate(args()),{code:'INVALID_OUTPUT'});
 await assert.rejects(client(async()=>response({promptFeedback:{blockReason:'SAFETY'}})).generate(args()),{code:'INVALID_OUTPUT'});
 await assert.rejects(client(async()=>new Response('{}',{headers:{'content-length':String(128*1024+1)}})).generate(args()),{code:'INVALID_OUTPUT'});
});
test('absolute deadlines and active cancellation settle even if fetch ignores abort',async()=>{
 await assert.rejects(client(()=>new Promise(()=>{})).generate({...args(),deadlineAt:NOW+10}),{code:'TIMEOUT'});
 await assert.rejects(client(()=>new Promise(()=>{})).generate({...args(),deadlineAt:0}),{code:'TIMEOUT'});
 const controller=new AbortController();const result=client(()=>new Promise(()=>{})).generate({...args(),signal:controller.signal});controller.abort();await assert.rejects(result,{code:'TIMEOUT'});
});

test('Gemini text thought signature is metadata only and never enters output',async()=>{const result=await client(async()=>response({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"cards":[],"answer":"확인 필요","nextChecks":[]}',thoughtSignature:'opaque-provider-signature'}]}}]})).generate(args());assert.equal(result.output.answer,'확인 필요');assert.equal(JSON.stringify(result).includes('opaque-provider-signature'),false);});
