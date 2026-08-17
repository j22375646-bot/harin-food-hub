'use strict';

const crypto=require('node:crypto');
const client=require('./food-safety-client.js');
const utils=require('./candidate-utils.js');
const SERVICE_ID='I0490';
const GUIDE_URL='https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&svc_no=I0490';

function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  const productName=utils.cleanText(row.PRDTNM,180)||'회수 대상 식품',reportNo=utils.cleanText(row.PRDLST_REPORT_NO,80),recallSequence=utils.cleanText(row.RTRVLDSUSE_SEQ,80);
  const datedId=[reportNo,utils.cleanText(row.CRET_DTM,40)].filter(Boolean).join(':');
  const externalId=recallSequence||datedId||crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
  const sourceUrl=`${GUIDE_URL}&recallNo=${encodeURIComponent(externalId)}`;
  const reason=utils.cleanText(row.RTRVLPRVNS,1800),method=utils.cleanText(row.RTRVLPLANDOC_RTRVLMTHD,1000),grade=utils.cleanText(row.RTRVL_GRDCD_NM,80);
  const candidate={provider:'FOOD_SAFETY_RECALL',evidence_kind:'RECALL_NOTICE',title:`회수·판매중지 · ${productName}`,summary:[grade&&`회수등급 ${grade}`,reason&&`사유 ${reason}`,method&&`처리 ${method}`].filter(Boolean).join(' · ').slice(0,4000)||'식품안전나라 공식 회수정보',source_url:sourceUrl,source_name:'식품안전나라',source_date:utils.dateValue(row.CRET_DTM),image_url:utils.safeUrl(row.IMG_FILE_PATH),external_id:externalId,fetched_at:fetchedAt,metadata:{product_name:productName,report_no:reportNo,manufacturer:utils.cleanText(row.BSSHNM,160),recall_reason:reason,recall_grade:grade,recall_method:method,barcode:utils.cleanText(row.BRCDNO,100),unit:utils.cleanText(row.FRMLCUNIT,160),manufactured_at:utils.dateValue(row.MNFDT),distribution_limit:utils.cleanText(row.DISTBTMLMT,120),product_type:utils.cleanText(row.PRDLST_TYPE,120),recall_sequence:recallSequence}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function probe({config,reportNumbers=[],fetchImpl=fetch,now=new Date()}){
  const reports=[...new Set(reportNumbers.map(value=>utils.cleanText(value,80)).filter(Boolean))].slice(0,5);
  if(!reports.length)return {provider:'FOOD_SAFETY_RECALL',status:'NO_DATA',reason:'REPORT_NUMBER_REQUIRED',candidates:[],totalCount:0,sourceTimestamp:new Date(now).toISOString(),errors:[]};
  const settled=await Promise.allSettled(reports.map(reportNo=>client.fetchService({apiKey:config.apiKey,serviceId:SERVICE_ID,end:20,filter:{key:'PRDLST_REPORT_NO',value:reportNo},fetchImpl})));
  const rows=[],errors=[];let totalCount=0;
  settled.forEach((item,index)=>{if(item.status==='fulfilled'){rows.push(...item.value.rows);totalCount+=item.value.totalCount;}else errors.push({report_no:reports[index],code:item.reason?.code||'FOOD_RECALL_READ_FAILED',message:item.reason?.message||'회수정보를 읽지 못했습니다.'});});
  if(!rows.length&&errors.length)throw settled.find(item=>item.status==='rejected').reason;
  const fetchedAt=new Date(now).toISOString(),candidates=rows.map(row=>normalizeRow(row,fetchedAt));
  return {provider:'FOOD_SAFETY_RECALL',status:candidates.length?'SUCCESS':'NO_DATA',candidates,totalCount,sourceTimestamp:fetchedAt,errors};
}

module.exports={SERVICE_ID,GUIDE_URL,normalizeRow,probe};
