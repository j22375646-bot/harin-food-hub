'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildWorkspaceProductDetails:build}=require('../lib/products/workspace-product-details.js');
const now=new Date('2026-09-10T12:00:00Z');
test('catalog price uses the source product, not an unrelated mapping fallback',()=>{
 const input={platform:'CAFE24',link:{external_product_name:'연결명',selling_price:999},cafeProduct:{product_name:'원본명',price:'21000',updated_at:now.toISOString()},now};
 assert.deepEqual(build(input),{name:'원본명',basis:'CAFE24_CATALOG',min:21000,max:21000,updatedAt:now.toISOString(),stale:false});
 for(const value of [null,undefined,0,-1,'',true,Infinity,'missing'])assert.equal(build({...input,cafeProduct:{price:value}}).min,null);
});
test('Naver advertisement references never expose a product price',()=>{
 assert.equal(build({platform:'NAVER',link:{selling_price:999,raw_data:{source_type:'AD_GROUP'}}}).min,null);
 assert.equal(build({platform:'NAVER',link:{selling_price:19900,raw_data:{source_type:'NAVER_COMMERCE_PRODUCT'}}}).min,19900);
});
test('option ranges require every price and use the oldest source time',()=>{
 const input={platform:'COUPANG',link:{external_product_name:'연결 옵션'},options:[{sale_price:20000,updated_at:'2020-01-01T00:00:00Z'},{sale_price:25000,updated_at:now.toISOString()}],now};
 const p=build(input);assert.equal(p.min,20000);assert.equal(p.max,25000);assert.equal(p.stale,true);assert.equal(p.updatedAt,'2020-01-01T00:00:00.000Z');
 assert.equal(build({...input,options:[...input.options,{sale_price:null}]}).min,null);assert.equal(build({...input,options:[]}).max,null);
});
test('loader projects only product metadata while preserving channel identities',async()=>{
 const {sources,database}=require('../desktop/test/fixtures/inventory.cjs');
 const result=await require('../lib/dashboard/workspace-inventory-loader.js').loadWorkspaceInventory({db:database(sources())});const c=result.items[0].channels;
 assert.equal(c[0].product.name,'하린 김치 원본상품');assert.equal(c[0].product.min,21000);assert.equal(c[1].product.basis,'REFERENCE');assert.equal(c[1].product.min,null);assert.equal(c[2].product.max,25000);assert.deepEqual(c[2].product,c[3].product);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|raw_data/);
 const lower=sources();lower.channel_products[3].raw_data.source_type='naver_commerce_product';lower.channel_products[3].selling_price=12000;const adapted=await require('../lib/dashboard/workspace-inventory-loader.js').loadWorkspaceInventory({db:database(lower)});assert.equal(adapted.items[1].channels[1].state,'OUT_OF_STOCK');assert.equal(adapted.items[1].channels[1].product.min,12000);
});
