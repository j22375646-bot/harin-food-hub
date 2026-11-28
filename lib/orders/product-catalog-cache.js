'use strict';

// Product tables are read only to find order item images. They change rarely
// but were read in full (with raw_data) on every order list rebuild, about
// 1.6MB per call. Rows are reused per database client for a short time; a
// stale image is cosmetic and refreshes within PRODUCT_CATALOG_TTL_MS.
// Failed reads are never cached so a transient error heals on the next call.

const PRODUCT_CATALOG_TTL_MS=10*60*1000;
const cache=new WeakMap();

function queryFailure(error){
  return {rows:[],unavailable:true,error:{code:String(error?.code||'QUERY_ERROR'),message:'상품 사진 정보를 불러오지 못했습니다.'}};
}

async function isolatedQuery(query){
  try{
    const result=await query;
    if(result.error)throw result.error;
    return {rows:result.data||[],unavailable:false};
  }catch(error){return queryFailure(error);}
}

async function readCatalog(db){
  const [cafe24Products,channelProducts,coupangProducts,coupangProductItems]=await Promise.all([
    isolatedQuery(db.from('cafe24_products').select('external_product_no,raw_data').limit(5000)),
    isolatedQuery(db.from('channel_products').select('platform,external_product_id,external_product_name,master_product_id,raw_data').limit(10000)),
    isolatedQuery(db.from('coupang_products').select('seller_product_id,product_id,product_name,raw_data').limit(5000)),
    isolatedQuery(db.from('coupang_product_items').select('vendor_item_id,seller_product_id,item_name,raw_data').limit(10000))
  ]);
  return {cafe24Products,channelProducts,coupangProducts,coupangProductItems};
}

async function loadProductCatalogRows({db,now=new Date(),ttlMs=PRODUCT_CATALOG_TTL_MS}={}){
  const at=now.getTime();
  const cached=db&&typeof db==='object'?cache.get(db):null;
  if(cached&&at>=cached.at&&at-cached.at<ttlMs)return cached.rows;
  const rows=await readCatalog(db);
  if(db&&typeof db==='object'&&Object.values(rows).every(result=>!result.unavailable))cache.set(db,{at,rows});
  return rows;
}

module.exports={PRODUCT_CATALOG_TTL_MS,loadProductCatalogRows};
