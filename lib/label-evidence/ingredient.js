'use strict';

const crypto=require('node:crypto');
const client=require('../public-evidence/food-safety-client.js');
const utils=require('../public-evidence/candidate-utils.js');
const SERVICE_ID='I1020';
const GUIDE_URL='https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&svc_no=I1020';

function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  fetchedAt=new Date(fetchedAt).toISOString();
  const name=utils.cleanText(row.RPRSNT_RAWMTRL_NM,180)||utils.cleanText(row.RAWMTRL_NM,180)||'원재료명 확인 필요',scientific=utils.cleanText(row.SCNM,180),english=utils.cleanText(row.ENG_NM,180),condition=utils.cleanText(row.USE_CND_STDR_CN||row.USE_CND_NM,1600),externalId=utils.cleanText(row.RAWMTRL_CD||row.SEQ,100)||crypto.createHash('sha256').update(`${name}\n${scientific}\n${condition}`).digest('hex');
  const summary=[scientific&&`학명 ${scientific}`,english&&`영문명 ${english}`,utils.cleanText(row.MLSFC_NM,160)&&`분류 ${utils.cleanText(row.MLSFC_NM,160)}`,condition&&`사용조건 ${condition}`].filter(Boolean).join(' · ')||'식품안전나라 식품원재료 자료';
  const sourceUrl=`${GUIDE_URL}&ingredient=${encodeURIComponent(externalId)}`;
  const candidate={provider:'FOOD_SAFETY_INGREDIENT',evidence_kind:'INGREDIENT_USAGE_REFERENCE',title:`${name} · 원재료 사용정보`,summary:summary.slice(0,4000),source_url:sourceUrl,source_name:'식품안전나라 식품원재료 DB',source_date:utils.dateValue(row.CHNG_DT||row.REG_DT),image_url:null,external_id:externalId,fetched_at:fetchedAt,metadata:{ingredient_name:name,nicknames:utils.cleanText(row.RAWMTRL_NCKNM,500),scientific_name:scientific,english_name:english,classification:utils.cleanText(row.MLSFC_NM,160),region:utils.cleanText(row.REGN_CD_NM,160),use_condition:condition,use_condition_name:utils.cleanText(row.USE_CND_NM,300)}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function probe({config,query,fetchImpl=fetch,now=new Date()}){
  const value=utils.cleanText(query,100);if(!value){const error=new Error('확인할 대표 원재료명을 입력해주세요.');error.code='INGREDIENT_QUERY_REQUIRED';error.status=400;throw error;}
  const result=await client.fetchService({apiKey:config.apiKey,serviceId:SERVICE_ID,end:20,filter:{key:'RPRSNT_RAWMTRL_NM',value},fetchImpl}),fetchedAt=new Date(now).toISOString();
  return {provider:'FOOD_SAFETY_INGREDIENT',status:result.rows.length?'SUCCESS':'NO_DATA',candidates:result.rows.map(row=>normalizeRow(row,fetchedAt)),totalCount:result.totalCount,sourceTimestamp:result.sourceTimestamp};
}

module.exports={SERVICE_ID,GUIDE_URL,normalizeRow,probe};
