'use strict';

const crypto=require('node:crypto');
const client=require('../public-evidence/food-safety-client.js');
const utils=require('../public-evidence/candidate-utils.js');
const SERVICE_ID='I0580';
const GUIDE_URL='https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&svc_no=I0580';

function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  fetchedAt=new Date(fetchedAt).toISOString();
  const business=utils.cleanText(row.BSSH_NM,180)||'업소명 확인 필요',licenseNo=utils.cleanText(row.LCNS_NO,80),designationNo=utils.cleanText(row.HACCP_APPN_NO,100),foodType=utils.cleanText(row.PRDLST_NM,180),status=utils.cleanText(row.CLSBIZ_DVS_CD_NM,100)||'상태 확인 필요';
  const externalId=designationNo||crypto.createHash('sha256').update(`${licenseNo}\n${business}\n${foodType}`).digest('hex'),summary=[`업소 ${business}`,foodType&&`지정 식품유형 ${foodType}`,`영업상태 ${status}`,row.CRTFC_ENDDT&&`인증 종료일 ${utils.dateValue(row.CRTFC_ENDDT)}`].filter(Boolean).join(' · ');
  const sourceUrl=`${GUIDE_URL}&designation=${encodeURIComponent(externalId)}`;
  const candidate={provider:'FOOD_SAFETY_HACCP',evidence_kind:'ESTABLISHMENT_HACCP_DESIGNATION',title:`${business} · HACCP 지정정보`,summary:`${summary} · 개별 판매상품 인증을 뜻하지 않으며 제조업소·식품유형 지정정보입니다.`,source_url:sourceUrl,source_name:'식품안전나라 HACCP 적용업소 지정 현황',source_date:utils.dateValue(row.CHNG_DT||row.HACCP_APPN_DT),image_url:null,external_id:externalId,fetched_at:fetchedAt,metadata:{business_name:business,license_no:licenseNo,designation_no:designationNo,industry:utils.cleanText(row.INDUTY_CD_NM,160),food_type:foodType,address:utils.cleanText(row.SITE_ADDR,500),designation_date:utils.dateValue(row.HACCP_APPN_DT),certificate_end_date:utils.dateValue(row.CRTFC_ENDDT),business_status:status,cancelled_at:utils.dateValue(row.ASGN_CANCL_DT)}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function probe({config,licenseNumber,fetchImpl=fetch,now=new Date()}){
  const value=utils.cleanText(licenseNumber,80);if(!value){const error=new Error('HACCP 지정업소를 확인할 영업 인허가번호가 필요합니다.');error.code='HACCP_LICENSE_NUMBER_REQUIRED';error.status=400;throw error;}
  const result=await client.fetchService({apiKey:config.apiKey,serviceId:SERVICE_ID,end:30,filter:{key:'LCNS_NO',value},fetchImpl}),fetchedAt=new Date(now).toISOString();
  return {provider:'FOOD_SAFETY_HACCP',status:result.rows.length?'SUCCESS':'NO_DATA',candidates:result.rows.map(row=>normalizeRow(row,fetchedAt)),totalCount:result.totalCount,sourceTimestamp:result.sourceTimestamp};
}

module.exports={SERVICE_ID,GUIDE_URL,normalizeRow,probe};
