'use strict';

const {createHash}=require('node:crypto');
const {buildUtmLink,UTM_RULE}=require('./utm.js');
const {ApiInputError}=require('../api/safety.js');
const {classifyCafe24Product}=require('../products/cafe24-catalog.js');
const {providerConfig,missingFields}=require('../google-owned-site/config.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS='id,rule_version,normalized_input,input_hash,landing_url,generated_url,product_id,campaign_id,creative_id,created_by,created_at,archived_at';

function uuid(value,code='INVALID_ID') {
  if(typeof value!=='string'||!UUID.test(value))throw new ApiInputError('유효한 UUID가 필요합니다.',400,code);
  return value.toLowerCase();
}
function previewLink(input) {
  // Translate only errors from this pure validator, never database error objects.
  try{return buildUtmLink(input);}catch(error){
    if(error.name==='ApiInputError'&&error.status===400)throw new ApiInputError(error.message,400,error.code);
    throw error;
  }
}
function hashInput(preview) {
  const sorted=Object.fromEntries(Object.entries(preview.normalized).sort(([a],[b])=>a.localeCompare(b,'en')));
  return createHash('sha256').update(JSON.stringify({ruleVersion:preview.ruleVersion,input:sorted})).digest('hex');
}
function checked(result) {if(result.error)throw new Error('MEASUREMENT_STORAGE_UNAVAILABLE');return result.data;}
function decodeCursor(after) {
  if(after===undefined||after===null||after==='')return null;
  try{
    if(typeof after!=='string'||after.length>300||!/^[A-Za-z0-9_-]+$/.test(after))throw new Error();
    const value=JSON.parse(Buffer.from(after,'base64url').toString('utf8'));
    if(!value||Object.keys(value).sort().join(',')!=='createdAt,id'||!UUID.test(value.id)||typeof value.id!=='string')throw new Error();
    if(typeof value.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.createdAt)||!Number.isFinite(Date.parse(value.createdAt)))throw new Error();
    return value;
  }catch{throw new ApiInputError('페이지 커서가 올바르지 않습니다.',400,'INVALID_CURSOR');}
}
async function listLinks({db,after,includeArchived=false}) {
  const cursor=decodeCursor(after);
  let query=db.from('measurement_links').select(COLUMNS).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(31);
  if(!includeArchived)query=query.is('archived_at',null);
  if(cursor)query=query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const rows=checked(await query)||[];const links=rows.slice(0,30);const last=links.at(-1);const hasMore=rows.length>30;
  return {links,hasMore,nextCursor:hasMore?Buffer.from(JSON.stringify({createdAt:last.created_at,id:last.id})).toString('base64url'):null};
}
// Read only the three Cafe24 eligibility sources; page each to avoid implicit API row caps.
async function allRows(db,table,columns,filters=[]) {
  const rows=[];
  for(let start=0;start<20000;start+=500){
    let q=db.from(table).select(columns);for(const [key,value] of filters)q=q.eq(key,value);
    q=q.order(table==='cafe24_products'?'external_product_no':'id',{ascending:true}).range(start,start+499);
    const page=checked(await q)||[];rows.push(...page);if(page.length<500)return rows;
  }
  throw new Error('PRODUCT_OPTIONS_LIMIT');
}
async function loadProducts({db}) {
  try{
    const [masters,links,catalog]=await Promise.all([
      allRows(db,'master_products','id,name,is_active',[['is_active',true]]),
      allRows(db,'channel_products','id,master_product_id,platform,external_product_id,is_active',[['platform','CAFE24'],['is_active',true]]),
      allRows(db,'cafe24_products','external_product_no,product_name,display,selling,raw_data'),
    ]);
    const selling=new Set(catalog.filter(item=>classifyCafe24Product(item).is_sellable).map(item=>String(item.external_product_no)));
    const eligible=new Set(links.filter(item=>item.platform==='CAFE24'&&item.is_active===true&&selling.has(String(item.external_product_id))).map(item=>item.master_product_id));
    return {available:true,items:masters.filter(item=>item.is_active===true&&eligible.has(item.id)).map(({id,name})=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'ko')),note:null};
  }catch{return {available:false,items:[],note:'상품 목록을 확인할 수 없습니다. 상품 선택 없이 링크를 저장할 수 있습니다.'};}
}
async function saveLink({db,input,createdBy}) {
  const creator=uuid(createdBy);const preview=previewLink(input);const normalized=preview.normalized;
  if(normalized.productId){
    const products=await loadProducts({db});
    if(!products.available)throw new ApiInputError('상품 상태를 확인할 수 없습니다. 상품 선택을 해제하거나 다시 시도해주세요.',503,'PRODUCTS_UNAVAILABLE');
    if(!products.items.some(item=>item.id===normalized.productId))throw new ApiInputError('판매 중인 연결 상품을 선택해주세요.',400,'INVALID_PRODUCT_ID');
  }
  const hash=hashInput(preview);
  const result=await db.from('measurement_links').insert({rule_version:preview.ruleVersion,normalized_input:normalized,input_hash:hash,landing_url:normalized.landingUrl,generated_url:preview.url,product_id:normalized.productId,campaign_id:normalized.campaignId,creative_id:normalized.creativeId,created_by:creator}).select(COLUMNS).single();
  if(result.error?.code==='23505'){
    const link=checked(await db.from('measurement_links').select(COLUMNS).eq('input_hash',hash).single());
    if(!link)throw new Error('MEASUREMENT_STORAGE_UNAVAILABLE');
    return {link,duplicate:true,restoreAvailable:Boolean(link.archived_at)&&link.created_by===creator};
  }
  const link=checked(result);if(!link)throw new Error('MEASUREMENT_STORAGE_UNAVAILABLE');
  return {link,duplicate:false,restoreAvailable:false};
}
async function setArchived({db,id,createdBy,archived}) {
  const rowId=uuid(id);const creator=uuid(createdBy);
  const link=checked(await db.from('measurement_links').update({archived_at:archived?new Date().toISOString():null}).eq('id',rowId).eq('created_by',creator).select(COLUMNS).maybeSingle());
  if(!link)throw new ApiInputError('저장된 링크를 찾을 수 없습니다.',404,'LINK_NOT_FOUND');
  return {link};
}
function readiness(env=process.env) {
  const config=providerConfig('GA4',env);
  return {ga4:!config.enabled||missingFields('GA4',config).length?'SETUP_REQUIRED':'VERIFY_REQUIRED',note:'UTM 링크 저장은 구매·환불 추적 검증 완료를 의미하지 않습니다.'};
}
module.exports={UTM_RULE,previewLink,hashInput,listLinks,loadProducts,saveLink,setArchived,readiness};
