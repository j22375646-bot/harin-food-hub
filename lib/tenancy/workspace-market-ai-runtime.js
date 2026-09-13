'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime');
const {createDashboardIdentityVerifier}=require('./dashboard-identity');
const {createFinanceContextResolver}=require('./workspace-finance-runtime');
const {guardMarketAiRequest,createMarketAiRequest}=require('./workspace-market-ai-request');
const {createGeminiClient}=require('../ai/gemini-client');
const {createPublicMarketStore}=require('../ai/public-market-store');
const {createPublicMarketAiService}=require('../ai/public-market-service');
const {createPublicMarketLoader}=require('../ai/public-market-loader');
function createMarketAiRuntime({getDb,env=process.env}={}){if(typeof getDb!=='function')throw TypeError('Trusted DB required');return createBusinessListRuntime({env,guardRequest:guardMarketAiRequest,createService:({database,identityDb,authAdmin})=>{const client=createGeminiClient({env});return createMarketAiRequest({resolveContext:createFinanceContextResolver({database,verifySession:createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})}),configuration:client.configuration,createService:({assertCurrentContext})=>createPublicMarketAiService({store:createPublicMarketStore({db:getDb()}),...client,accountId:env.GEMINI_FREE_PROJECT_ID,loadSnapshot:createPublicMarketLoader(),assertCurrentContext})});}});}
module.exports={createMarketAiRuntime};
