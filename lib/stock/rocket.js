'use strict';
const {createInventoryReader}=require('../dashboard/inventory-reader.js');
function projectRocket(watched,current,now=new Date()) {
 const byId=new Map(current.map(r=>[String(r.vendor_item_id),r]));
 return watched.map(w=>{
  const r=byId.get(String(w.vendor_item_id));
  const quantity=Number.isInteger(r?.total_orderable_quantity)&&r.total_orderable_quantity>=0?r.total_orderable_quantity:null;
  const updatedAt=typeof r?.snapshot_at==='string'&&Number.isFinite(Date.parse(r.snapshot_at))?r.snapshot_at:null;
  const stale=!updatedAt||now.getTime()-Date.parse(updatedAt)>6*3600000;
  return {id:String(w.vendor_item_id),name:String(w.name).slice(0,200),quantity,updatedAt,stale,state:quantity===null?'UNKNOWN':quantity===0?'OUT_OF_STOCK':'IN_STOCK'};
 }).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
async function loadRocket({db}) {
 const read=createInventoryReader({db});
 const watched=await read('moaon_rocket_watch','vendor_item_id,name','vendor_item_id');
 const current=await read('coupang_rg_inventory','vendor_item_id,total_orderable_quantity,snapshot_at','vendor_item_id',watched.map(r=>r.vendor_item_id));
 return projectRocket(watched,current);
}
module.exports={loadRocket,projectRocket};
