'use strict';

const crypto=require('node:crypto');
const client=require('./data-go-client.js');
const utils=require('../public-evidence/candidate-utils.js');
const GUIDE_URL='https://www.data.go.kr/data/15127578/openapi.do';
const NUTRIENTS=Object.freeze({AMT_NUM1:['열량','kcal'],AMT_NUM3:['단백질','g'],AMT_NUM4:['지방','g'],AMT_NUM6:['탄수화물','g'],AMT_NUM7:['당류','g'],AMT_NUM13:['나트륨','mg'],AMT_NUM23:['콜레스테롤','mg'],AMT_NUM24:['포화지방','g'],AMT_NUM25:['트랜스지방','g']});

function value(row,key){return utils.cleanText(row[key]??row[key.toLowerCase()],80);}
function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  fetchedAt=new Date(fetchedAt).toISOString();
  const productName=value(row,'FOOD_NM_KR')||'이름 없는 식품',reportNo=value(row,'ITEM_REPORT_NO'),manufacturer=value(row,'MAKER_NM'),servingSize=value(row,'SERVING_SIZE'),servingAmount=value(row,'NUTRI_AMOUNT_SERVING');
  const nutrients=Object.fromEntries(Object.entries(NUTRIENTS).map(([key,[label,unit]])=>[key,{label,unit,value:value(row,key)||null}]));
  const shown=Object.values(nutrients).filter(item=>item.value!=null).slice(0,6).map(item=>`${item.label} ${item.value}${item.unit}`);
  const externalId=reportNo||crypto.createHash('sha256').update(`${productName}\n${manufacturer}\n${servingSize}`).digest('hex');
  const summary=[manufacturer&&`제조사 ${manufacturer}`,servingSize&&`1회 제공량 ${servingSize}`,servingAmount&&`영양성분 기준량 ${servingAmount}`,...shown].filter(Boolean).join(' · ')||'식약처 식품영양성분 자료';
  const sourceUrl=`${GUIDE_URL}?itemReportNo=${encodeURIComponent(externalId)}`;
  const candidate={provider:'MFDS_NUTRITION',evidence_kind:'PRODUCT_NUTRITION_REFERENCE',title:`${productName} · 국내 영양성분 참고`,summary:summary.slice(0,4000),source_url:sourceUrl,source_name:'식품의약품안전처 식품영양성분 DB',source_date:utils.dateValue(row.UPDATE_DATE||row.RESEARCH_YMD),image_url:null,external_id:externalId,fetched_at:fetchedAt,metadata:{product_name:productName,report_no:reportNo,manufacturer,serving_size:servingSize,nutrition_amount_serving:servingAmount,database_class:value(row,'DB_CLASS_NM'),food_category:value(row,'FOOD_CAT1_NM'),nutrients}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function probe({config,query,reportNumber,fetchImpl=fetch,now=new Date()}){
  const report=utils.cleanText(reportNumber,80),name=utils.cleanText(query,120);if(!report&&!name){const error=new Error('품목보고번호 또는 상품명을 입력해주세요.');error.code='MFDS_NUTRITION_QUERY_REQUIRED';error.status=400;throw error;}
  const filters=report?{ITEM_REPORT_NO:report}:{FOOD_NM_KR:name},result=await client.fetchNutrition({apiKey:config.apiKey,filters,fetchImpl}),fetchedAt=new Date(now).toISOString();
  return {provider:'MFDS_NUTRITION',status:result.rows.length?'SUCCESS':'NO_DATA',candidates:result.rows.slice(0,10).map(row=>normalizeRow(row,fetchedAt)),totalCount:result.totalCount,sourceTimestamp:result.sourceTimestamp};
}

module.exports={GUIDE_URL,NUTRIENTS,normalizeRow,probe};
