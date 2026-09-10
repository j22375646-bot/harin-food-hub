const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectRocket}=require('../lib/stock/rocket.js');
const {loadWorkspaceInventory}=require('../lib/dashboard/workspace-inventory-loader.js');
const {sources,database}=require('../desktop/test/fixtures/inventory.cjs');
const {saveProductChoice}=require('../lib/stock/product-choice.js');
test('choice save validates master and commerce source before persisting',async()=>{
 let writes=0,saved;const row={id:'link',master_product_id:'master',platform:'NAVER',raw_data:{source_type:'NAVER_COMMERCE_PRODUCT'}};
 const db={from:table=>table==='channel_products'?{select(){return this;},eq(){return this;},async maybeSingle(){return {data:row};}}:{async upsert(value){writes++;saved=value;return {};}}};
 const value={masterId:'master',linkId:'link',platform:'NAVER'};
 await saveProductChoice({db,tenantId:'tenant',value});assert.equal(writes,1);assert.equal(saved.tenant_id,'tenant');assert.equal(saved.link_id,'link');
 await assert.rejects(saveProductChoice({db,tenantId:'tenant',value:{...value,masterId:'other'}}),/INVALID_CHOICE/);
 row.raw_data.source_type='AD_GROUP';await assert.rejects(saveProductChoice({db,tenantId:'tenant',value}),/INVALID_CHOICE/);assert.equal(writes,1);
});
test('watched Rocket options remain sold out; missing and stale never become fresh zero',()=>{
 const watched=[{vendor_item_id:'a',name:'가'},{vendor_item_id:'b',name:'나'}];
 const now=new Date('2026-09-11T00:00:00Z');
 const result=projectRocket(watched,[{vendor_item_id:'a',total_orderable_quantity:0,snapshot_at:now.toISOString()},{vendor_item_id:'unwatched',total_orderable_quantity:0}],now);
 assert.equal(result.length,2);assert.equal(result[0].state,'OUT_OF_STOCK');assert.equal(result[0].stale,false);
 assert.equal(result[1].quantity,null);assert.equal(result[1].state,'UNKNOWN');assert.equal(result[1].stale,true);
 assert.equal(projectRocket(watched,[{vendor_item_id:'a',total_orderable_quantity:0,snapshot_at:'2020-01-01'}],now)[0].stale,true);
});
test('saved choice resolves one channel without combining candidates or crossing tenant',async()=>{
 const data=sources();data.channel_products.push({id:'n3',master_product_id:'product-2',platform:'NAVER',external_product_id:'chosen',updated_at:new Date().toISOString(),raw_data:{source_type:'NAVER_COMMERCE_PRODUCT',stockQuantity:17}});
 data.moaon_product_choices=[{id:'choice1',tenant_id:'a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',master_id:'product-2',platform:'NAVER',link_id:'n3'}];
 const r=await loadWorkspaceInventory({db:database(data)}),naver=r.items[1].channels.find(c=>c.platform==='NAVER');
 assert.equal(naver.quantity,17);assert.equal(naver.externalId,'chosen');assert.equal(naver.mapping,undefined);assert.equal(naver.alternatives.count,2);
 data.moaon_product_choices[0].tenant_id='different';const other=await loadWorkspaceInventory({db:database(data)});assert.equal(other.items[1].channels[1].quantity,null);
});
