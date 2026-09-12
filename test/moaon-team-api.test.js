'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../lib/team/request.js'),auth=require('../lib/dashboard-auth.js');
test('team API binds actor to validated session and rejects foreign origins and spoofed actors',async()=>{
 const calls=[],session={id:'session',userId:'actor',role:'OWNER'};
 const handler=createHandler({database:()=>({rpc:async(name,args)=>{calls.push(args);return {data:{saved:true}};}}),validate:async()=>session});
 const url='https://harin-cafe24-sync.vercel.app/api/moaon/team',headers={cookie:auth.COOKIE_NAME+'=fixture',origin:'https://harin-cafe24-sync.vercel.app','content-type':'application/json'};
 assert.equal((await handler(new Request(url))).status,401);
 assert.equal((await handler(new Request(url,{method:'POST',headers:{...headers,origin:'https://other.invalid'},body:'{}'}))).status,403);
 assert.equal((await handler(new Request(url,{method:'POST',headers,body:JSON.stringify({action:'PROFILE',name:'Test',title:'',color:'blue',notifications:true,revision:1,userId:'forged'})}))).status,400);
 assert.equal(calls.length,0);
 assert.equal((await handler(new Request(url,{headers}))).status,200);
 assert.equal(calls[0].p_actor,'actor');assert.equal(calls[0].p_session,'session');assert.equal(calls[0].p_hash,auth.tokenHash('fixture'));
});
