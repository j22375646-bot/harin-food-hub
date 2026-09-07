'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const auth=require('../lib/dashboard-auth.js');const supabase=require('../lib/cafe24/supabase.js');
const filename=path.resolve(__dirname,'../app/api/system/measurement/route.js');
const input={landingUrl:'https://shop.example/p',source:'naver',medium:'cpc',campaign:'summer',campaignId:'s1'};
function request(body,headers={}){return new Request('https://hub.example/api/system/measurement',{method:'POST',headers:{'content-type':'application/json',origin:'https://hub.example',...headers},body:typeof body==='string'?body:JSON.stringify(body)});}
test('measurement route exists',()=>assert.ok(fs.existsSync(filename)));
test('OWNER, CSRF, validation, preview purity, server creator and generic errors',async t=>{
 const route=await import(pathToFileURL(filename));const originalAuth=auth.validateSession,originalDb=supabase.getSupabase;let session=null,dbCalls=0;
 auth.validateSession=async()=>session;supabase.getSupabase=()=>{dbCalls++;throw new Error('secret database credentials');};
 t.after(()=>{auth.validateSession=originalAuth;supabase.getSupabase=originalDb;});
 const privateResponse=response=>assert.match(response.headers.get('cache-control'),/private, no-store/);
 for(const role of [null,'VIEWER','OPERATOR']){session=role?{role,userId:'11111111-1111-4111-8111-111111111111'}:null;for(const action of ['PREVIEW','SAVE_LINK','ARCHIVE_LINK','RESTORE_LINK']){const res=await route.POST(request({action,input}));assert.equal(res.status,role?403:401);privateResponse(res);}const res=await route.GET(new Request('https://hub.example/api/system/measurement'));assert.equal(res.status,role?403:401);privateResponse(res);}
 session={role:'OWNER',userId:'11111111-1111-4111-8111-111111111111'};
 for(const [body,headers,status] of [[{action:'PREVIEW',input},{origin:'https://evil.example'},403],[{action:'PREVIEW',input},{origin:''},403],['{',{},400],[[],{},400],[{action:'BOGUS'}, {},400],[{action:'ARCHIVE_LINK',id:'bad'}, {},400],[{action:'PREVIEW',input:{...input,landingUrl:'http://bad'}},{},400],[{action:'PREVIEW',input},{'content-type':'text/plain'},415],[{action:'PREVIEW',input},{'content-length':'100000'},413],[{action:'PREVIEW',input},{'sec-fetch-site':'cross-site'},403]]){const res=await route.POST(request(body,headers));assert.equal(res.status,status);privateResponse(res);}
 const preview=await route.POST(request({action:'PREVIEW',input}));assert.equal(preview.status,200);assert.match((await preview.json()).preview.url,/utm_id=s1/);assert.equal(dbCalls,0);
 const failed=await route.POST(request({action:'SAVE_LINK',input}));assert.equal(failed.status,500);assert.doesNotMatch(JSON.stringify(await failed.json()),/secret/);privateResponse(failed);
 let saved;supabase.getSupabase=()=>({from(table){assert.equal(table,'measurement_links');const q={insert(value){saved=value;return q;},select(){return q;},single:async()=>({data:{id:'22222222-2222-4222-8222-222222222222',...saved}})};return q;}});
 const savedRes=await route.POST(request({action:'SAVE_LINK',input,created_by:'evil',generated_url:'evil'}));assert.equal(savedRes.status,200);assert.equal(saved.created_by,session.userId);assert.match(saved.generated_url,/https:\/\/shop.example/);
 const readCalls=[];supabase.getSupabase=()=>({from(table){readCalls.push(table);const q={};for(const op of ['select','eq','is','or','order','range','limit'])q[op]=()=>q;q.then=resolve=>Promise.resolve(table==='measurement_links'?{data:[]}:{error:{message:'private provider details'}}).then(resolve);return q;}});
 const get=await route.GET(new Request('https://hub.example/api/system/measurement'));assert.equal(get.status,200);privateResponse(get);const ledger=await get.json();assert.equal(ledger.products.available,false);assert.equal(ledger.hasMore,false);assert.equal(ledger.nextCursor,null);assert.equal(ledger.rule.version,'utm-v1');assert.doesNotMatch(JSON.stringify(ledger),/private provider/);assert.deepEqual(readCalls,['measurement_links','master_products','channel_products','cafe24_products']);
 for(const query of ['includeArchived=garbage','after=bad!','after=a&after=b','limit=1000']){const res=await route.GET(new Request('https://hub.example/api/system/measurement?'+query));assert.equal(res.status,400);privateResponse(res);}
 auth.validateSession=async()=>{throw new Error('revoked session storage failure');};const revoked=await route.GET(new Request('https://hub.example/api/system/measurement'));assert.equal(revoked.status,401);privateResponse(revoked);
});
