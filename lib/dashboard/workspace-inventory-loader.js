'use strict';
const {cafe24Inventory,naverQuantity,stockState,isStale}=require('../inventory/unified-center.js');
const {isNaverCommerceProduct}=require('../products/operations-center.js');
const {buildWorkspaceProductDetails}=require('../products/workspace-product-details.js');
const {createInventoryReader}=require('./inventory-reader.js');
const {classifyCafe24Product}=require('../products/cafe24-catalog.js');
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const quantity=value=>value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0?null:Number(value);
async function loadWorkspaceInventory({db,now=()=>new Date()}={}){
 const at=now(),read=createInventoryReader({db});
 // Child sets must be complete: a partial option list must never become a stock total.
 const masters=await read('master_products','id,name,is_active','id',null,1000);
 const active=masters.filter(r=>r.is_active!==false);
 const links=await read('channel_products','id,master_product_id,platform,external_product_id,external_product_name,selling_price,is_active,raw_data,updated_at','master_product_id',active.map(r=>r.id),5000,'id');
 const choices=await read('moaon_product_choices','id,tenant_id,master_id,platform,link_id','tenant_id',['a3452bca-e259-40ed-a93d-b8bcc5c1b9e0'],5000,'id');
 const forPlatform=p=>links.filter(r=>r.platform===p).map(r=>r.external_product_id).filter(v=>v!=null);
 const [cafe,options]=await Promise.all([
  read('cafe24_products','external_product_no,product_name,price,selling,display,raw_data,updated_at','external_product_no',forPlatform('CAFE24')),
  read('coupang_product_items','vendor_item_id,seller_product_id,sale_price,updated_at','seller_product_id',forPlatform('COUPANG'),5000,'vendor_item_id')
 ]);
 const vendors=options.map(r=>r.vendor_item_id);
 const [market,rocket]=await Promise.all([
  read('coupang_item_inventory','vendor_item_id,quantity,checked_at','vendor_item_id',vendors),
  read('coupang_rg_inventory','vendor_item_id,total_orderable_quantity,snapshot_at','vendor_item_id',vendors)
 ]);
 const make=(platform,family,qty,date,{missing=false,reference=false,unmanaged=false,stopped=false,detail=''}={})=>{
  const updatedAt=iso(date),stale=!missing&&!reference&&isStale(updatedAt,at.getTime(),6);
  return {platform,family,quantity:qty,updatedAt,stale,state:stockState(qty,{missing,reference,stale}),unmanaged,stopped,detail};
 };
 const items=active.map(master=>{
  if(master.id==null||typeof master.name!=='string')throw Error('Invalid product');
  const own=links.filter(r=>String(r.master_product_id)===String(master.id));
  const allLinks=p=>own.filter(r=>r.platform===p);
  const matches=p=>{const all=allLinks(p),choice=choices.find(c=>c.master_id===String(master.id)&&c.platform===p);const selected=all.find(r=>String(r.id)===choice?.link_id);return selected?[selected]:all;};
  const link=p=>{const rows=matches(p);return rows.length===1?rows[0]:undefined;};
  const c=link('CAFE24'),n=link('NAVER'),cp=link('COUPANG');
  const source=cafe.find(r=>String(r.external_product_no)===String(c?.external_product_id));
  if(source&&classifyCafe24Product(source).excluded)return null;
  const ci=source?cafe24Inventory(source):{quantity:null,unmanaged:false};
  const commerce=isNaverCommerceProduct(n);
  const channels=[
   make('CAFE24','STORE',ci.quantity,source?.updated_at,{missing:!c,reference:ci.unmanaged,unmanaged:ci.unmanaged,stopped:c?.is_active===false||Boolean(source&&classifyCafe24Product(source).status==='STOPPED'),detail:ci.unmanaged?'재고관리 안 함 · 수량으로 품절을 판단하지 않습니다.':'Cafe24 저장 수량'}),
   make('NAVER','STORE',commerce?naverQuantity(n):null,n?.raw_data?.updatedAt||n?.raw_data?.updated_at||n?.updated_at,{missing:!n,reference:Boolean(n&&!commerce),stopped:n?.is_active===false,detail:commerce?'스마트스토어 저장 수량':n?'광고그룹 연결은 재고 자료가 아닙니다.':'커머스 상품 연결 필요'})
  ];
  const expected=options.filter(r=>String(r.seller_product_id)===String(cp?.external_product_id));
  for(const [family,rows,field,time] of [['MARKETPLACE',market,'quantity','checked_at'],['ROCKET_GROWTH',rocket,'total_orderable_quantity','snapshot_at']]){
   const matched=expected.map(option=>rows.find(r=>String(r.vendor_item_id)===String(option.vendor_item_id)));
   const complete=matched.length>0&&matched.every(r=>r&&quantity(r[field])!==null);
   const qty=complete?matched.reduce((sum,r)=>sum+quantity(r[field]),0):null;
   const dates=matched.map(r=>iso(r?.[time]));
   // Oldest option controls freshness; a newer option cannot conceal stale stock.
   const date=dates.length&&dates.every(Boolean)?dates.sort()[0]:null;
   channels.push(make('COUPANG',family,qty,date,{missing:!cp,stopped:cp?.is_active===false,detail:complete?'연결 옵션 전체의 저장 수량':'연결 옵션의 수량이 모두 확인되지 않았습니다.'}));
  }
  for(const channel of channels){
   const all=allLinks(channel.platform);if(all.length>1)channel.alternatives={count:all.length,entries:all.slice(0,20).map(row=>({id:String(row.id),externalId:row.external_product_id==null?null:String(row.external_product_id).slice(0,160),name:typeof row.external_product_name==='string'?row.external_product_name.slice(0,200):null,active:typeof row.is_active==='boolean'?row.is_active:null,reference:channel.platform==='NAVER'&&!isNaverCommerceProduct(row)}))};
   const candidates=matches(channel.platform);
   if(candidates.length>1){Object.assign(channel,{state:'UNKNOWN',quantity:null,updatedAt:null,stale:false,stopped:false,unmanaged:false,externalId:null,product:null,detail:'여러 연결 중 사용할 상품을 확인해야 합니다. 수량과 가격은 합산하지 않습니다.',mapping:{count:candidates.length,entries:candidates.slice(0,20).map(row=>({id:String(row.id),externalId:row.external_product_id==null?null:String(row.external_product_id).slice(0,160),name:typeof row.external_product_name==='string'?row.external_product_name.slice(0,200):null,active:typeof row.is_active==='boolean'?row.is_active:null,reference:channel.platform==='NAVER'&&!isNaverCommerceProduct(row)}))}});continue;}
   const mapped=({CAFE24:c,NAVER:n,COUPANG:cp})[channel.platform];channel.externalId=mapped?.external_product_id==null?null:String(mapped.external_product_id).slice(0,160);channel.product=buildWorkspaceProductDetails({platform:channel.platform,link:mapped,cafeProduct:source,options:expected,now:at});}
  return {id:String(master.id),name:master.name.slice(0,200),channels};
 }).filter(Boolean);
 return {status:'READY',writePolicy:'READ_ONLY',generatedAt:at.toISOString(),truncated:false,items};
}
module.exports={loadWorkspaceInventory};
