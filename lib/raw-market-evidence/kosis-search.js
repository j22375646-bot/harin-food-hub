'use strict';

const utils=require('../public-evidence/candidate-utils.js');

const PROVIDER='KOSIS_SEARCH';
const BASE_URL='https://kosis.kr/openapi/statisticsSearch.do';
const GUIDE_URL='https://kosis.kr/openapi/devGuide/devGuide_0701List.do';

class KosisError extends Error{
  constructor(message,status=502,code='KOSIS_SEARCH_READ_FAILED'){super(message);this.name='KosisError';this.status=status;this.code=code;}
}

function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  const orgId=utils.cleanText(row.ORG_ID||row.orgId,40),orgName=utils.cleanText(row.ORG_NM||row.orgNm,180),tableId=utils.cleanText(row.TBL_ID||row.tblId,80),tableName=utils.cleanText(row.TBL_NM||row.tblNm,300),statId=utils.cleanText(row.STAT_ID||row.statId,80),statName=utils.cleanText(row.STAT_NM||row.statNm,300),start=utils.cleanText(row.STRT_PRD_DE||row.strtPrdDe,30),end=utils.cleanText(row.END_PRD_DE||row.endPrdDe,30),contents=utils.cleanText(row.CONTENTS||row.contents,900),link=utils.safeUrl(row.LINK_URL||row.linkUrl||row.TBL_VIEW_URL||row.tblViewUrl),sourceUrl=link&&new URL(link).hostname.toLowerCase().endsWith('kosis.kr')?link:`https://kosis.kr/statHtml/statHtml.do?orgId=${encodeURIComponent(orgId)}&tblId=${encodeURIComponent(tableId)}`;
  const summary=[orgName&&`작성기관 ${orgName}`,statName&&`조사 ${statName}`,(start||end)&&`수록기간 ${start||'확인 필요'}~${end||'확인 필요'}`,contents,'검색 결과는 관련 통계표 후보이며 선택 상품의 판매량이나 시장규모로 자동 확정하지 않습니다.'].filter(Boolean).join(' · ').slice(0,4000);
  const candidate={provider:PROVIDER,evidence_kind:'OFFICIAL_MARKET_STATISTICS_TABLE',title:tableName||'KOSIS 공식 통계표',summary,source_url:sourceUrl,source_name:'KOSIS 국가통계포털',source_date:null,image_url:null,external_id:`${orgId}:${tableId||statId}`,fetched_at:new Date(fetchedAt).toISOString(),metadata:{organization_id:orgId,organization_name:orgName,table_id:tableId,table_name:tableName,statistics_id:statId,statistics_name:statName,period_start:start,period_end:end,recommended_table:utils.cleanText(row.REC_TBL_SE||row.recTblSe,20)}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

function requestUrl({apiKey,query}){const url=new URL(BASE_URL);url.searchParams.set('method','getList');url.searchParams.set('apiKey',apiKey);url.searchParams.set('searchNm',query);url.searchParams.set('sort','RANK');url.searchParams.set('startCount','1');url.searchParams.set('resultCount','20');url.searchParams.set('format','json');url.searchParams.set('content','json');return url.toString();}

async function probe({config,query,fetchImpl=fetch,now=new Date(),timeoutMs=15000}){
  const search=utils.cleanText(query,120);if(!search)throw new KosisError('KOSIS에서 찾을 원재료 또는 시장 검색어를 입력해주세요.',400,'KOSIS_QUERY_REQUIRED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(requestUrl({apiKey:config.apiKey,query:search}),{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'}),payload=await response.json().catch(()=>null);
    if(!response.ok)throw new KosisError(`KOSIS 통계표 검색에 실패했습니다. (${response.status})`,response.status);
    const errorText=utils.cleanText(payload?.err||payload?.error||payload?.message,220);if(errorText){if(/key|인증|권한/iu.test(errorText))throw new KosisError('KOSIS 공유서비스 인증키를 다시 확인해주세요.',412,'KOSIS_CONFIG_INVALID');if(/limit|제한|초과/iu.test(errorText))throw new KosisError('KOSIS 호출 한도를 확인해주세요. 이전 저장 근거는 유지됩니다.',429,'KOSIS_QUOTA_EXHAUSTED');throw new KosisError(errorText,502,'KOSIS_RESPONSE_ERROR');}
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:[],fetchedAt=new Date(now).toISOString(),candidates=rows.filter(row=>row&&(row.TBL_ID||row.tblId)).slice(0,20).map(row=>normalizeRow(row,fetchedAt));
    return {provider:PROVIDER,status:candidates.length?'SUCCESS':'NO_DATA',candidates,totalCount:candidates.length,sourceTimestamp:fetchedAt};
  }catch(error){if(error instanceof KosisError)throw error;if(controller.signal.aborted)throw new KosisError('KOSIS 응답 시간이 길어 중단했습니다. 이전 저장 근거는 유지됩니다.',504,'KOSIS_TIMEOUT');throw new KosisError('KOSIS 통계자료를 읽지 못했습니다. 잠시 뒤 다시 확인해주세요.',502,'KOSIS_NETWORK_ERROR');}finally{clearTimeout(timer);}
}

module.exports={PROVIDER,BASE_URL,GUIDE_URL,KosisError,normalizeRow,requestUrl,probe};
