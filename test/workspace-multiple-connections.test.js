'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadWorkspaceInventory}=require('../lib/dashboard/workspace-inventory-loader.js');
const {sources,database}=require('../desktop/test/fixtures/inventory.cjs');
test('multiple provider connections keep other products readable without choosing or summing',async()=>{
 for(const platform of ['CAFE24','NAVER','COUPANG']){
  const data=sources(),original=data.channel_products.find(r=>r.platform===platform);
  data.channel_products.push({...original,id:'extra',external_product_id:'different',external_product_name:'추가 연결',is_active:false});
  const result=await loadWorkspaceInventory({db:database(data)});assert.equal(result.items.length,2);
  for(const c of result.items[0].channels.filter(r=>r.platform===platform)){assert.equal(c.state,'UNKNOWN');assert.equal(c.quantity,null);assert.equal(c.product,null);assert.equal(c.externalId,null);assert.equal(c.mapping.count,2);assert.equal(c.mapping.entries.find(r=>r.id==='extra').active,false);}
  assert.equal(result.items[1].channels[1].quantity,0);
 }
});
test('candidate lists disclose full count while projecting only 20 safe entries',async()=>{
 const data=sources();for(let i=0;i<24;i++)data.channel_products.push({id:'extra-'+i,master_product_id:'product-1',platform:'NAVER',external_product_id:'ad-'+i,raw_data:{secret:'PRIVATE'}});
 const result=await loadWorkspaceInventory({db:database(data)}),mapping=result.items[0].channels[1].mapping;
 assert.equal(mapping.count,25);assert.equal(mapping.entries.length,20);assert.ok(mapping.entries.every(r=>r.reference===true));assert.doesNotMatch(JSON.stringify(mapping),/PRIVATE|raw_data/);
});
