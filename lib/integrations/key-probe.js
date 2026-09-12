'use strict';
const keys=require('./managed-keys.js');
async function probe(provider,{db=require('../cafe24/supabase.js').getSupabase(),env=process.env,adResult=null}={}){
 if(!keys.definitions[provider])throw keys.fail('KEYS_INVALID');
 const row=await db.from('moaon_managed_keys').select('revision,envelope').eq('tenant_id',keys.TENANT).eq('provider',provider).maybeSingle();if(row.error)throw keys.fail();
 const revision=row.data?.revision||0,fields=keys.decode(provider,row.data,env),resolved={...env,...Object.fromEntries(Object.entries(keys.definitions[provider].fields).map(([k,v])=>[v,fields[k]]))};
 const checks=[];
 const check=async(label,work)=>{try{await work();checks.push({label,status:'CONNECTED'});}catch(error){checks.push({label,status:'CHECK_FAILED',httpStatus:Number.isInteger(error.status)?error.status:null});}};
 await keys.withEnvironment(provider,resolved,async()=>{
  if(provider==='COUPANG')await check('상품 조회',()=>require('../coupang/client.js').request('GET','/v2/providers/seller_api/apis/api/v1/marketplace/seller-products',{vendorId:resolved.COUPANG_VENDOR_ID,maxPerPage:1},{maxAttempts:1,timeout:20000}));
  if(provider==='NAVER'){
   await check('커머스 상품 조회',()=>require('../naver-commerce/client.js').request('POST','/v1/products/search',{body:{page:1,size:1,orderType:'MOD_DATE'},signal:AbortSignal.timeout(20000)}));
   if(adResult?.revision===revision&&['CONNECTED','CHECK_FAILED'].includes(adResult.check?.status))checks.push(adResult.check);
   else checks.push({label:'광고 캠페인 조회',status:'CHECK_FAILED',httpStatus:null});
  }
  if(provider==='EPOST')await check('계약 접수국 조회',()=>require('../epost/client.js').listOffices({env:resolved}));
  if(provider==='CAFE24')await check('상품 조회',()=>require('../cafe24/client.js').adminGet(require('../cafe24/config.js').getConfig(),'/products',{limit:1}));
 });
 const result={status:checks.every(c=>c.status==='CONNECTED')?'CONNECTED':'CHECK_FAILED',checks,checkedAt:new Date().toISOString(),revision};
 const saved=await db.from('moaon_key_checks').upsert({tenant_id:keys.TENANT,provider,revision,result,checked_at:result.checkedAt},{onConflict:'tenant_id,provider'});if(saved.error)throw keys.fail();
 return result;
}
async function probeNaverAds({db,env=process.env}={}){
 const row=await db.from('moaon_managed_keys').select('revision,envelope').eq('tenant_id',keys.TENANT).eq('provider','NAVER').maybeSingle();if(row.error)throw keys.fail();
 const fields=keys.decode('NAVER',row.data,env),resolved={...env,...Object.fromEntries(Object.entries(keys.definitions.NAVER.fields).map(([k,v])=>[v,fields[k]]))};
 let check={label:'광고 캠페인 조회',status:'CONNECTED'};
 try{await keys.withEnvironment('NAVER',resolved,()=>require('../naver/client.js').request('GET','/ncc/campaigns'));}catch(error){check={label:'광고 캠페인 조회',status:'CHECK_FAILED',httpStatus:Number.isInteger(error.status)?error.status:null};}
 return {revision:row.data?.revision||0,check};
}
module.exports={probe,probeNaverAds};
