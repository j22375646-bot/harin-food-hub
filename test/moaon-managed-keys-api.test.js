'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHandler}=require('../lib/integrations/key-request.js'),auth=require('../lib/dashboard-auth.js');
const url='https://example.invalid/api/moaon/connections';
function request(body,headers={}){return new Request(url,{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json',Cookie:auth.COOKIE_NAME+'=synthetic-session',...headers},body:JSON.stringify(body)});}
test('raw key reveal requires both session and database owner verification; no store',async()=>{
 let reads=0,deny=false;const db={rpc:async()=>{reads++;return deny?{error:{message:'KEYS_AUTH_REQUIRED'}}:{data:null};}},handler=createHandler({database:()=>db,validate:async()=>({role:'OWNER',userId:'actor',id:'session'}),env:{COUPANG_VENDOR_ID:'synthetic',COUPANG_ACCESS_KEY:'synthetic-access',COUPANG_SECRET_KEY:'synthetic-secret'}});
 let response=await handler(request({action:'REVEAL',provider:'COUPANG'},{Origin:'https://evil.invalid'}));assert.equal(response.status,403);assert.equal(reads,0);
 response=await handler(request({action:'REVEAL',provider:'COUPANG'}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).fields.secretKey,'synthetic-secret');
 deny=true;response=await handler(request({action:'REVEAL',provider:'COUPANG'}));assert.equal(response.status,401);assert.doesNotMatch(await response.text(),/synthetic-secret/);
 const noSession=createHandler({database:()=>db,validate:async()=>null});response=await noSession(request({action:'REVEAL',provider:'COUPANG'}));assert.equal(response.status,401);
});
test('disabled storage cannot claim save success or dispatch platform writes',async()=>{
 const handler=createHandler({database:()=>({}),validate:async()=>({role:'OWNER'}),env:{}});
 const response=await handler(request({action:'SAVE',provider:'COUPANG',revision:0,fields:{vendorId:'synthetic',accessKey:'synthetic',secretKey:'synthetic'},expiresAt:null}));assert.equal(response.status,503);assert.equal((await response.json()).code,'KEYS_SETUP_REQUIRED');
});
