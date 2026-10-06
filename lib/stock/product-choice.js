'use strict';
const {isNaverCommerceProduct}=require('../products/operations-center.js');
async function saveProductChoice({db,tenantId,value}) {
 if(!['CAFE24','NAVER','COUPANG'].includes(value.platform)||!['masterId','linkId'].every(k=>typeof value[k]==='string'&&value[k].length>0&&value[k].length<=80))throw Error('INVALID_CHOICE');
 const result=await db.from('channel_products').select('id,master_product_id,platform,raw_data').eq('id',value.linkId).maybeSingle();
 const row=result.data;
 if(result.error)throw Error('DB');
 if(!row||String(row.master_product_id)!==value.masterId||row.platform!==value.platform||(row.platform==='NAVER'&&!isNaverCommerceProduct(row)))throw Error('INVALID_CHOICE');
 const saved=await db.from('moaon_product_choices').upsert({tenant_id:tenantId,master_id:value.masterId,platform:value.platform,link_id:value.linkId,updated_at:new Date().toISOString()},{onConflict:'tenant_id,master_id,platform'});
 if(saved.error)throw Error('DB');
}
module.exports={saveProductChoice};
