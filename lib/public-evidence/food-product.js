'use strict';

const crypto=require('node:crypto');
const client=require('./food-safety-client.js');
const utils=require('./candidate-utils.js');
const SERVICE_ID='C002';
const GUIDE_URL='https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&svc_no=C002';

function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  const productName=utils.cleanText(row.PRDLST_NM,180)||'이름 없는 식품',reportNo=utils.cleanText(row.PRDLST_REPORT_NO,80);
  const manufacturer=utils.cleanText(row.BSSH_NM,160),foodType=utils.cleanText(row.PRDLST_DCNM,160),ingredients=utils.cleanText(row.RAWMTRL_NM,1800);
  const externalId=reportNo||crypto.createHash('sha256').update(`${productName}\n${manufacturer}\n${ingredients}`).digest('hex');
  const sourceUrl=`${GUIDE_URL}&reportNo=${encodeURIComponent(externalId)}`;
  const summary=[manufacturer&&`제조원 ${manufacturer}`,foodType&&`식품유형 ${foodType}`,ingredients&&`원재료 ${ingredients}`].filter(Boolean).join(' · ')||'식품안전나라 품목제조보고 자료';
  const candidate={provider:'FOOD_SAFETY_PRODUCT',evidence_kind:'PRODUCT_REPORT',title:`${productName} · 품목제조보고`,summary:summary.slice(0,4000),source_url:sourceUrl,source_name:'식품안전나라',source_date:utils.dateValue(row.CHNG_DT||row.PRMS_DT),image_url:null,external_id:externalId,fetched_at:fetchedAt,metadata:{product_name:productName,report_no:reportNo,manufacturer,food_type:foodType,ingredients,permission_date:utils.dateValue(row.PRMS_DT),changed_at:utils.dateValue(row.CHNG_DT),license_no:utils.cleanText(row.LCNS_NO,80)}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function probe({config,query,fetchImpl=fetch,now=new Date()}){
  const value=utils.cleanText(query,100);if(!value){const error=new Error('조회할 상품 이름을 입력해주세요.');error.code='FOOD_PRODUCT_QUERY_REQUIRED';error.status=400;throw error;}
  const result=await client.fetchService({apiKey:config.apiKey,serviceId:SERVICE_ID,end:20,filter:{key:'PRDLST_NM',value},fetchImpl});
  const fetchedAt=new Date(now).toISOString(),candidates=result.rows.map(row=>normalizeRow(row,fetchedAt));
  return {provider:'FOOD_SAFETY_PRODUCT',status:candidates.length?'SUCCESS':'NO_DATA',candidates,totalCount:result.totalCount,sourceTimestamp:result.sourceTimestamp};
}

module.exports={SERVICE_ID,GUIDE_URL,normalizeRow,probe};
