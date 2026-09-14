'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime');
const {createDashboardIdentityVerifier}=require('./dashboard-identity');
const {createFinanceContextResolver}=require('./workspace-finance-runtime');
const {guardMarketAiRequest,createMarketAiRequest}=require('./workspace-market-ai-request');
const {createGeminiClient}=require('../ai/gemini-client');
const {createPublicMarketStore}=require('../ai/public-market-store');
const {createPublicMarketAiService}=require('../ai/public-market-service');
const {createPublicMarketLoader}=require('../ai/public-market-loader');
const {environment}=require('../integrations/managed-keys');
function createMarketAiRuntime({getDb,env=process.env}={}){
 if(typeof getDb!=='function')throw TypeError('Trusted DB required');
 const configuredClient=async()=>{const configured=await environment('GEMINI',env,getDb());return {configured,client:createGeminiClient({env:configured})};};
 return createBusinessListRuntime({env,guardRequest:guardMarketAiRequest,createService:({database,identityDb,authAdmin})=>createMarketAiRequest({
  resolveContext:createFinanceContextResolver({database,verifySession:createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})}),
  configuration:async()=> (await configuredClient()).client.configuration(),
  createService:async({assertCurrentContext})=>{const {configured,client}=await configuredClient();await assertCurrentContext();return createPublicMarketAiService({store:createPublicMarketStore({db:getDb()}),...client,accountId:configured.GEMINI_FREE_PROJECT_ID,loadSnapshot:createPublicMarketLoader(),assertCurrentContext});}
 })});
}
module.exports={createMarketAiRuntime};
