'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('custom market runtime environment reaches both control runtime and Gemini configuration',()=>{
 const filename=path.join(__dirname,'../lib/tenancy/workspace-market-ai-runtime.js');
 let captured,geminiEnv;
 const sandbox={module:{exports:{}},process:{env:{SOURCE:'process-only'}},require(name){
  if(name==='./business-list-runtime')return {createBusinessListRuntime:options=>{captured=options;return options;}};
  if(name==='../ai/gemini-client')return {createGeminiClient:({env})=>{geminiEnv=env;return {configuration:()=>({})};}};
  if(name==='./dashboard-identity')return {createDashboardIdentityVerifier:()=>()=>{}};
  if(name==='./workspace-finance-runtime')return {createFinanceContextResolver:()=>()=>{}};
  return require(path.resolve(path.dirname(filename),name));
 }};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename});
 const env={SOURCE:'custom',GEMINI_FREE_PROJECT_ID:'custom-project'};
 sandbox.module.exports.createMarketAiRuntime({env,getDb:()=>({})});
 assert.equal(captured.env,env);
 captured.createService({database:{},identityDb:{},authAdmin:{}});
 assert.equal(geminiEnv,env);
});
