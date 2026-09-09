'use strict';
const {isNaverCommerceProduct}=require('./operations-center.js');
const price=value=>!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>1e12?null:Number(value);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
function buildWorkspaceProductDetails({platform,link,cafeProduct,options=[],now=new Date()}={}){
 const sourceName=platform==='CAFE24'?cafeProduct?.product_name||link?.external_product_name:link?.external_product_name;
 let basis='UNKNOWN',values=[],dates=[];
 if(link&&platform==='CAFE24'){
  basis='CAFE24_CATALOG';values=[price(cafeProduct?.price)];dates=[iso(cafeProduct?.updated_at)];
 }else if(link&&platform==='NAVER'){
  if(isNaverCommerceProduct(link)){basis='NAVER_COMMERCE';values=[price(link.selling_price)];dates=[iso(link.updated_at)];}
  else basis='REFERENCE';
 }else if(link&&platform==='COUPANG'){
  basis='COUPANG_OPTIONS';values=options.map(r=>price(r.sale_price));dates=options.map(r=>iso(r.updated_at));
 }
 const known=values.length>0&&values.every(v=>v!==null);
 const updatedAt=dates.length&&dates.every(Boolean)?dates.sort()[0]:null;
 return {name:typeof sourceName==='string'?sourceName.slice(0,200):null,basis,min:known?Math.min(...values):null,max:known?Math.max(...values):null,updatedAt,stale:basis!=='REFERENCE'&&(!updatedAt||now.getTime()-Date.parse(updatedAt)>6*3600000)};
}
module.exports={buildWorkspaceProductDetails};
