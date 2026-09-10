'use strict';
const {createInventoryReader}=require('../dashboard/inventory-reader.js');
function projectRocket(watched,current,now=new Date()) {
 const byId=new Map(current.map(r=>[String(r.vendor_item_id),r]));
 return watched.map(w=>{
  const r=byId.get(String(w.vendor_item_id));
  const quantity=Number.isInteger(r?.total_orderable_quantity)&&r.total_orderable_quantity>=0?r.total_orderable_quantity:null;
  const updatedAt=typeof r?.snapshot_at==='string'&&Number.isFinite(Date.parse(r.snapshot_at))?r.snapshot_at:null;
  const stale=!updatedAt||now.getTime()-Date.parse(updatedAt)>6*3600000;
  // The source mapper historically defaulted missing sales to zero. Check raw
  // presence first so an absent API field is not treated as a no-sales period.
  const rawSales=r?.raw_data?.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS??r?.raw_data?.salesLast30Days;
  const salesSource=r?.raw_data?rawSales:r?.sales_last_30_days;
  const sales30=salesSource!==null&&salesSource!==undefined&&salesSource!==''&&Number.isSafeInteger(Number(salesSource))&&Number(salesSource)>=0?Number(salesSource):null;
  return {id:String(w.vendor_item_id),name:String(w.name).slice(0,200),quantity,sales30,updatedAt,stale,state:quantity===null?'UNKNOWN':quantity===0?'OUT_OF_STOCK':'IN_STOCK'};
 }).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
async function loadRocket({db}) {
 const read=createInventoryReader({db});
 const watched=await read('moaon_rocket_watch','vendor_item_id,name','vendor_item_id');
 const current=await read('coupang_rg_inventory','vendor_item_id,total_orderable_quantity,sales_last_30_days,raw_data,snapshot_at','vendor_item_id',watched.map(r=>r.vendor_item_id));
 return projectRocket(watched,current);
}
module.exports={loadRocket,projectRocket};
