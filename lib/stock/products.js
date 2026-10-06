'use strict';
const {createInventoryReader}=require('../dashboard/inventory-reader.js');
const {classifyCafe24Product}=require('../products/cafe24-catalog.js');
const HARIN='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
async function loadStockProducts({db}){
 const rows=await createInventoryReader({db})('cafe24_products','external_product_no,product_name,selling,display,raw_data,updated_at','external_product_no',null,5000);
 return rows.filter(r=>classifyCafe24Product(r).status==='SELLING').map(r=>({productNo:String(r.external_product_no),name:String(r.product_name||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,200),updatedAt:r.updated_at||null})).filter(r=>/^\d{1,20}$/.test(r.productNo)&&r.name).sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.productNo.localeCompare(b.productNo));
}
module.exports={HARIN,loadStockProducts};
