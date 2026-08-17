'use strict';

const crypto=require('node:crypto');
const utils=require('../public-evidence/candidate-utils.js');
const BASE_URL='https://api.nal.usda.gov/fdc/v1';
const GUIDE_URL='https://fdc.nal.usda.gov/api-guide/';

class UsdaApiError extends Error{constructor(message,status=502,code='USDA_FDC_READ_FAILED'){super(message);this.name='UsdaApiError';this.status=status;this.code=code;}}
const WANTED=/energy|protein|total lipid|carbohydrate|sugars|sodium|cholesterol|saturated|trans fat/iu;

function requestUrl({apiKey,query,pageSize=10}){const url=new URL(`${BASE_URL}/foods/search`);url.searchParams.set('api_key',apiKey);url.searchParams.set('query',query);url.searchParams.set('pageSize',String(Math.min(25,Math.max(1,Number(pageSize)||10))));return url.toString();}
function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  fetchedAt=new Date(fetchedAt).toISOString();
  const id=utils.cleanText(row.fdcId,60)||crypto.createHash('sha256').update(JSON.stringify(row).slice(0,2000)).digest('hex'),description=utils.cleanText(row.description,240)||'식품명 확인 필요';
  const nutrients=(Array.isArray(row.foodNutrients)?row.foodNutrients:[]).map(item=>({name:utils.cleanText(item.nutrientName||item.name,120),value:item.value??item.amount??null,unit:utils.cleanText(item.unitName||item.unit,30)})).filter(item=>item.name&&item.value!=null&&WANTED.test(item.name)).slice(0,12);
  const shown=nutrients.slice(0,6).map(item=>`${item.name} ${item.value}${item.unit}`),sourceUrl=`https://fdc.nal.usda.gov/fdc-app.html#/food-details/${encodeURIComponent(id)}/nutrients`;
  const candidate={provider:'USDA_FDC',evidence_kind:'INTERNATIONAL_NUTRIENT_CROSSCHECK',title:`${description} · 해외 영양 비교`,summary:[utils.cleanText(row.brandOwner||row.brandName,180)&&`브랜드 ${utils.cleanText(row.brandOwner||row.brandName,180)}`,...shown,'미국 자료의 비교 참고값이며 국내 제품 표시값이 아닙니다.'].filter(Boolean).join(' · ').slice(0,4000),source_url:sourceUrl,source_name:'USDA FoodData Central',source_date:utils.dateValue(row.publishedDate||row.modifiedDate||row.availableDate),image_url:null,external_id:id,fetched_at:fetchedAt,metadata:{fdc_id:id,description,data_type:utils.cleanText(row.dataType,80),brand_owner:utils.cleanText(row.brandOwner||row.brandName,180),ingredients:utils.cleanText(row.ingredients,1200),serving_size:row.servingSize==null?null:Number(row.servingSize),serving_unit:utils.cleanText(row.servingSizeUnit,40),nutrients}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}
async function probe({config,query,fetchImpl=fetch,now=new Date()}){
  const value=utils.cleanText(query,140);if(!value){const error=new Error('USDA에서 비교할 영문 식품명을 입력해주세요.');error.code='USDA_FDC_QUERY_REQUIRED';error.status=400;throw error;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetchImpl(requestUrl({apiKey:config.apiKey,query:value}),{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'}),payload=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===403)throw new UsdaApiError('USDA FoodData Central API 키를 다시 확인해주세요.',412,'USDA_FDC_CONFIG_INVALID');if(response.status===429)throw new UsdaApiError('USDA 호출 한도를 확인해주세요. 이전 저장 근거는 유지됩니다.',429,'USDA_FDC_QUOTA_EXHAUSTED');throw new UsdaApiError(`USDA 자료 읽기에 실패했습니다. (${response.status})`,response.status);}
    const rows=Array.isArray(payload.foods)?payload.foods:[],fetchedAt=new Date(now).toISOString();return {provider:'USDA_FDC',status:rows.length?'SUCCESS':'NO_DATA',candidates:rows.slice(0,10).map(row=>normalizeRow(row,fetchedAt)),totalCount:Number(payload.totalHits)||rows.length,sourceTimestamp:fetchedAt};
  }catch(error){if(error instanceof UsdaApiError)throw error;if(controller.signal.aborted)throw new UsdaApiError('USDA 응답 시간이 길어 중단했습니다.',504,'USDA_FDC_TIMEOUT');throw new UsdaApiError('USDA 자료를 읽지 못했습니다. 잠시 뒤 다시 확인해주세요.');}finally{clearTimeout(timer);}
}

module.exports={BASE_URL,GUIDE_URL,UsdaApiError,requestUrl,normalizeRow,probe};
