'use strict';
const {createInventoryReader}=require('../dashboard/inventory-reader.js');
const {HARIN}=require('./products.js');
const text=v=>String(v??'').trim();
async function loadSalesCatalog({db}){
 const read=createInventoryReader({db});
 const links=await read('channel_products','id,master_product_id,platform,external_product_id,external_product_name,raw_data','id');
 const cafes=links.filter(r=>r.platform==='CAFE24');
 const target=master=>{const ids=[...new Set(cafes.filter(r=>r.master_product_id===master).map(r=>text(r.external_product_id)))];return ids.length===1?ids[0]:null;};
 const byKey=new Map(),ambiguous=new Set();
 function add(platform,key,option,name,productNo){if(!key||!productNo)return;const id=JSON.stringify([platform,key,option]);if(ambiguous.has(id))return;const old=byKey.get(id);if(old&&old.productNo!==productNo){ambiguous.add(id);byKey.delete(id);return;}byKey.set(id,{platform,productKey:key,optionKey:option,name:text(name).slice(0,200),productNo});}
 const products=await read('cafe24_products','external_product_no,product_name','external_product_no');
 for(const p of products)add('CAFE24',text(p.external_product_no),'*',p.product_name,text(p.external_product_no));
 for(const c of cafes)add('CAFE24',text(c.external_product_id),'*',c.external_product_name,text(c.external_product_id));
 const naver=links.filter(r=>r.platform==='NAVER'&&r.raw_data?.source_type==='NAVER_COMMERCE_PRODUCT');
 for(const n of naver)for(const id of [...new Set([n.external_product_id,n.raw_data?.channelProductNo,n.raw_data?.originProductNo].map(text).filter(Boolean))])add('NAVER',id,'*',n.external_product_name,target(n.master_product_id));
 const cp=links.filter(r=>r.platform==='COUPANG');
 const options=await read('coupang_product_items','vendor_item_id,seller_product_id,item_name,raw_data','seller_product_id',cp.map(r=>r.external_product_id),5000,'vendor_item_id');
 for(const o of options){if(/ROCKET|RG/i.test(text(o.raw_data?.fulfillmentType)))continue;for(const c of cp.filter(c=>text(c.external_product_id)===text(o.seller_product_id)))add('COUPANG',text(o.vendor_item_id),'',o.item_name,target(c.master_product_id));}
 const base=[...byKey.values()];
 for(const [platform,table,product,option,key]of [['CAFE24','cafe24_order_items','external_product_no','option_name','external_item_id'],['NAVER','naver_commerce_order_items','product_id','option_name','product_order_id']]){
  const rows=await read(table,`${key},${product},${option},product_name`,product,base.filter(s=>s.platform===platform).map(s=>s.productKey),5000,key);
  for(const row of rows){const parent=base.find(s=>s.platform===platform&&s.productKey===text(row[product]));if(parent)add(platform,text(row[product]),text(row[option]),row.product_name,parent.productNo);}
 }
 return [...byKey.values()].filter(s=>s.productNo).map(s=>{
  if(s.platform!=='NAVER')return s;
  const groups=naver.map(n=>[...new Set([n.external_product_id,n.raw_data?.channelProductNo,n.raw_data?.originProductNo].map(text).filter(Boolean))]).filter(ids=>ids.includes(s.productKey));
  const aliases=[...new Set(groups.flat())].filter(id=>byKey.get(JSON.stringify(['NAVER',id,'*']))?.productNo===s.productNo);
  return {...s,aliasKeys:aliases};
 }).sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.optionKey.localeCompare(b.optionKey,'ko'));
}
async function seedSalesRules({db,productNo,unit,actor}){
 const sources=(await loadSalesCatalog({db})).filter(s=>s.productNo===productNo&&(s.optionKey==='*'||s.platform==='COUPANG'));
 if(!sources.some(s=>s.platform==='CAFE24'&&s.productKey===productNo))sources.push({platform:'CAFE24',productKey:productNo,optionKey:'*',name:'카페24 기본 연결'});
 for(const s of sources){const result=await db.from('moaon_stock_sales_rules').upsert({tenant_id:HARIN,platform:s.platform,product_key:s.productKey,option_key:s.optionKey,name:s.name,product_no:productNo,unit,factor:1,updated_by:actor},{onConflict:'tenant_id,platform,product_key,option_key',ignoreDuplicates:true});if(result.error)throw Error('DB');}
}
async function loadSalesWorkspace({db}){
 const [catalog,rules,ledger,errors]=await Promise.all([loadSalesCatalog({db}),db.from('moaon_stock_sales_rules').select('id,platform,product_key,option_key,name,product_no,unit,factor,enabled,starts_at').eq('tenant_id',HARIN).limit(5001),db.from('moaon_stock_order_ledger').select('platform,line_id,order_id,name,quantity,required,unit,state,reason,updated_at').eq('tenant_id',HARIN).order('updated_at',{ascending:false}).limit(100),db.from('moaon_stock_sync_errors').select('source,updated_at').order('updated_at',{ascending:false}).limit(10)]);
 if([rules,ledger,errors].some(r=>r.error)||rules.data.length>5000)throw Error('DB');
 return {catalog,rules:rules.data,ledger:ledger.data,errors:errors.data};
}
async function retrySalesOrders({db}){
 const rows=await db.from('moaon_stock_order_ledger').select('platform,line_id').eq('tenant_id',HARIN).eq('state','INSUFFICIENT').limit(100);
 if(rows.error)throw Error('DB');for(const row of rows.data){const result=await db.rpc('moaon_apply_stock_order',{p_platform:row.platform,p_line:row.line_id});if(result.error)throw Error('DB');}
}
async function saveSalesRule({db,value,actor}){
 if(!['CAFE24','NAVER','COUPANG'].includes(value.platform)||typeof value.productKey!=='string'||typeof value.optionKey!=='string'||typeof value.productNo!=='string'||!['개','KG','티백','박스'].includes(value.unit)||typeof value.enabled!=='boolean'||!Number.isFinite(value.factor)||value.factor<=0||value.factor>1e6||Math.abs(value.factor*1000-Math.round(value.factor*1000))>1e-6||value.unit!=='KG'&&!Number.isInteger(value.factor))throw Error('INVALID_RULE');
 const source=(await loadSalesCatalog({db})).find(s=>s.platform===value.platform&&s.productKey===value.productKey&&s.optionKey===value.optionKey);
 if(!source)throw Error('INVALID_RULE');
 const lots=await db.from('moaon_stock_lots').select('data').eq('tenant_id',HARIN).limit(5001);
 if(lots.error||!lots.data?.some(l=>l.data.productNo===value.productNo&&l.data.unit===value.unit))throw Error('INVALID_RULE');
 for(const productKey of source.aliasKeys?.length?source.aliasKeys:[value.productKey]){
  const result=await db.from('moaon_stock_sales_rules').upsert({tenant_id:HARIN,platform:value.platform,product_key:productKey,option_key:value.optionKey,name:source.name,product_no:value.productNo,unit:value.unit,factor:value.factor,enabled:value.enabled,updated_by:actor},{onConflict:'tenant_id,platform,product_key,option_key'});
  if(result.error)throw Error('DB');
 }
}
module.exports={loadSalesCatalog,seedSalesRules,saveSalesRule,loadSalesWorkspace,retrySalesOrders};
