'use strict';
function sources(){return {
 master_products:[{id:'product-1',name:'하린 김치 1kg',is_active:true},{id:'product-2',name:'하린 깍두기 2kg',is_active:true}],
 channel_products:[{id:'c1',master_product_id:'product-1',platform:'CAFE24',external_product_id:'11'},{id:'n1',master_product_id:'product-1',platform:'NAVER',external_product_id:'ad1',raw_data:{source_type:'AD_GROUP',secret:'PRIVATE'}},{id:'cp1',master_product_id:'product-1',platform:'COUPANG',external_product_id:'22'},{id:'n2',master_product_id:'product-2',platform:'NAVER',external_product_id:'n2',updated_at:new Date().toISOString(),raw_data:{source_type:'NAVER_COMMERCE_PRODUCT',stockQuantity:0}}],
 cafe24_products:[{external_product_no:'11',product_name:'하린 김치',display:true,selling:true,updated_at:new Date().toISOString(),raw_data:{use_inventory:false,quantity:0}}],
 coupang_product_items:[{seller_product_id:'22',vendor_item_id:'a'},{seller_product_id:'22',vendor_item_id:'b'}],
 coupang_item_inventory:[{vendor_item_id:'a',quantity:3,checked_at:new Date().toISOString()},{vendor_item_id:'b',quantity:2,checked_at:'2020-01-01T00:00:00Z'}],
 coupang_rg_inventory:[{vendor_item_id:'a',total_orderable_quantity:12,snapshot_at:new Date().toISOString()}]
};}
function database(data={},failure=null){const operations=[];return {operations,from(table){const q={},state={};for(const m of ['select','in','order','limit','gt','abortSignal'])q[m]=(...args)=>{operations.push([table,m,...args]);state[m]=args;return q;};q.then=(resolve,reject)=>{let rows=[...(data[table]||[])];if(state.in)rows=rows.filter(r=>state.in[1].includes(String(r[state.in[0]])));if(state.gt)rows=rows.filter(r=>r[state.gt[0]]>state.gt[1]);if(state.order)rows.sort((a,b)=>a[state.order[0]]<b[state.order[0]]?-1:a[state.order[0]]>b[state.order[0]]?1:0);if(state.limit)rows=rows.slice(0,state.limit[0]);return Promise.resolve({data:rows,error:table===failure?{message:'PRIVATE_SQL'}:null}).then(resolve,reject);};return q;}};}
module.exports={sources,database};
