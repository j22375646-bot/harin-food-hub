'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const storePath='../lib/measurement/store.js';
const input={landingUrl:'https://shop.example/p',source:'NAVER',medium:'CPC',campaign:'summer',campaignId:'s1'};
const owner='11111111-1111-4111-8111-111111111111';
const row={id:'22222222-2222-4222-8222-222222222222',created_at:'2026-09-07T00:00:00.123456+00:00',created_by:owner,archived_at:null};
function dbWith(results){const calls=[];return {calls,from(table){const call={table,steps:[]};calls.push(call);const q={};for(const op of ['select','insert','update','eq','is','not','or','order','limit','range','in','single','maybeSingle'])q[op]=(...args)=>{call.steps.push([op,...args]);return q;};q.then=(resolve,reject)=>Promise.resolve(typeof results==='function'?results(call):results[table]||{data:[],error:null}).then(resolve,reject);return q;}};}
test('measurement store exists',()=>assert.equal(fs.existsSync(require('node:path').resolve(__dirname,storePath)),true));
test('save hashes normalized input, trusts server URL and preserves unique-race existing archive',async()=>{
 const s=require(storePath);let inserts=0;const existing={...row,archived_at:'2026-09-07T01:00:00Z'};
 const db=dbWith(c=>c.steps.some(x=>x[0]==='insert')?(inserts++,{error:{code:'23505'}}):{data:existing});
 const result=await s.saveLink({db,input:{...input,generated_url:'https://evil',input_hash:'evil'},createdBy:owner});
 assert.equal(result.duplicate,true);assert.equal(result.restoreAvailable,true);assert.equal(result.link.archived_at,existing.archived_at);
 assert.equal(inserts,1);const saved=db.calls[0].steps.find(x=>x[0]==='insert')[1];
 assert.match(saved.input_hash,/^[a-f0-9]{64}$/);assert.match(saved.generated_url,/utm_source=naver/);assert.equal(saved.created_by,owner);
 assert.equal(saved.input_hash,s.hashInput(s.previewLink(input)));assert.equal(db.calls.length,2);
});
test('list uses 31-row stable descending cursor, preserves microseconds and excludes archives',async()=>{
 const s=require(storePath);const rows=Array.from({length:31},()=>({...row}));const db=dbWith({measurement_links:{data:rows}});
 const result=await s.listLinks({db});assert.equal(result.links.length,30);assert.equal(result.hasMore,true);assert.ok(result.nextCursor);
 await s.listLinks({db,after:result.nextCursor,includeArchived:true});
 assert.ok(db.calls[0].steps.some(x=>x[0]==='is'&&x[1]==='archived_at'));
 assert.deepEqual(db.calls[0].steps.filter(x=>x[0]==='order').map(x=>x[1]),['created_at','id']);
 assert.ok(db.calls[0].steps.some(x=>x[0]==='limit'&&x[1]===31));
 assert.match(db.calls[1].steps.find(x=>x[0]==='or')[1],/123456\+00:00/);
 const before=db.calls.length;await assert.rejects(()=>s.listLinks({db,after:Buffer.from(JSON.stringify({createdAt:'x),id.gt.0',id:row.id})).toString('base64url')}),{code:'INVALID_CURSOR'});assert.equal(db.calls.length,before);
});
test('save without product skips product queries; explicit products enforce active selling CAFE24 eligibility',async()=>{
 const s=require(storePath);const db=dbWith({measurement_links:{data:row}});await s.saveLink({db,input,createdBy:owner});assert.deepEqual(db.calls.map(c=>c.table),['measurement_links']);
 const unavailable=dbWith(()=>({error:{message:'secret'}}));assert.equal((await s.loadProducts({db:unavailable})).available,false);
 await assert.rejects(()=>s.saveLink({db:unavailable,input:{...input,productId:owner},createdBy:owner}),{code:'PRODUCTS_UNAVAILABLE'});
 const productDb=dbWith({master_products:{data:[{id:owner,name:'food',is_active:true}]},channel_products:{data:[{master_product_id:owner,platform:'CAFE24',external_product_id:'10',is_active:false}]},cafe24_products:{data:[{external_product_no:10,product_name:'food',selling:'T',display:'T',raw_data:{}}]}});
 assert.deepEqual((await s.loadProducts({db:productDb})).items,[]);
 await assert.rejects(()=>s.saveLink({db:productDb,input:{...input,productId:owner},createdBy:owner}),{code:'INVALID_PRODUCT_ID'});
});
test('archive and restore only owned UUID rows and never delete',async()=>{
 const s=require(storePath);const db=dbWith({measurement_links:{data:row}});
 await s.setArchived({db,id:row.id,createdBy:owner,archived:true});await s.setArchived({db,id:row.id,createdBy:owner,archived:false});
 assert.ok(db.calls.every(c=>c.steps.some(x=>x[0]==='eq'&&x[1]==='created_by'&&x[2]===owner)));
 assert.equal(db.calls[1].steps.find(x=>x[0]==='update')[1].archived_at,null);
 await assert.rejects(()=>s.setArchived({db,id:'bad',createdBy:owner,archived:true}),{code:'INVALID_ID'});
 await assert.rejects(()=>s.setArchived({db:dbWith({measurement_links:{data:null}}),id:row.id,createdBy:owner,archived:true}),{status:404});
});
test('GA4 readiness exposes no secrets or tracking success',()=>{
 const s=require(storePath);assert.equal(s.readiness({}).ga4,'SETUP_REQUIRED');const r=s.readiness({HUB_OWNED_SITE_URL:'https://shop.example',GOOGLE_GA4_PROPERTY_ID:'secret-id',GOOGLE_SERVICE_ACCOUNT_EMAIL:'secret-email',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'secret-key'});assert.equal(r.ga4,'VERIFY_REQUIRED');assert.doesNotMatch(JSON.stringify(r),/secret/);assert.match(r.note,/구매.*환불/);
});
test('migration restricts both tables to service role with unique hash, bounded fields and retained history',()=>{
 const sql=fs.readFileSync(require('node:path').resolve(__dirname,'../supabase/migrations/20260907072132_measurement_links.sql'),'utf8');
 for(const table of ['measurement_links','measurement_rule_versions']){assert.match(sql,new RegExp(`alter table public.${table} enable row level security`,'i'));assert.match(sql,new RegExp(`revoke all on table public.${table} from public, anon, authenticated`,'i'));}
 assert.match(sql,/input_hash text not null unique/);assert.match(sql,/\^\[0-9a-f\]\{64\}\$/);assert.match(sql,/generated_url\) between 1 and 32768/);assert.match(sql,/created_at desc, id desc/);assert.match(sql,/insert into public.measurement_rule_versions/);assert.doesNotMatch(sql,/create policy|on delete cascade|\bdelete from\b|\bdrop\b/i);
});
test('product options include only sellable active master links and propagate all storage errors',async()=>{
 const s=require(storePath);const masters=['a','b','c','d','e'].map(id=>({id,name:id,is_active:true}));
 const db=dbWith({master_products:{data:masters},channel_products:{data:masters.map((m,i)=>({master_product_id:m.id,platform:'CAFE24',external_product_id:String(i),is_active:i!==4}))},cafe24_products:{data:masters.map((m,i)=>({external_product_no:String(i),product_name:i===3?'사은품':'food',selling:i===1?'F':'T',display:'T',raw_data:{sold_out:i===2?'T':'F'}}))}});
 assert.deepEqual((await s.loadProducts({db})).items,[{id:'a',name:'a'}]);
 assert.ok(db.calls.find(c=>c.table==='channel_products').steps.some(x=>x[0]==='eq'&&x[1]==='is_active'&&x[2]===true));
 for(const code of ['23503','42501']){await assert.rejects(()=>s.saveLink({db:dbWith(()=>({error:{code,message:'secret'}})),input,createdBy:owner}),/MEASUREMENT_STORAGE_UNAVAILABLE/);}
 const failure=dbWith(()=>({error:{message:'secret'}}));await assert.rejects(()=>s.listLinks({db:failure}),/MEASUREMENT_STORAGE_UNAVAILABLE/);
});
test('concurrent duplicate insert preserves first saved creator and never upserts',async()=>{
 const s=require(storePath);let stored=null;const db=dbWith(c=>{const insert=c.steps.find(x=>x[0]==='insert');if(insert){if(stored)return {error:{code:'23505'}};stored={...row,...insert[1]};return {data:stored};}return {data:stored};});
 const results=await Promise.all([s.saveLink({db,input,createdBy:owner}),s.saveLink({db,input:{...input,source:' naver '},createdBy:row.id})]);assert.equal(results.filter(r=>r.duplicate).length,1);assert.ok(results.every(r=>r.link.created_by===owner));assert.equal(db.calls.length,3);
});
test('product option reads page beyond first API page and expose truncation as unavailable',async()=>{
 const s=require(storePath);const db=dbWith(c=>{const start=c.steps.find(x=>x[0]==='range')[1];return {data:c.table==='master_products'&&start===0?Array.from({length:500},(_,i)=>({id:String(i),is_active:true,name:'food'})):[]};});
 assert.equal((await s.loadProducts({db})).available,true);assert.ok(db.calls.some(c=>c.table==='master_products'&&c.steps.some(x=>x[0]==='range'&&x[1]===500)));
});
