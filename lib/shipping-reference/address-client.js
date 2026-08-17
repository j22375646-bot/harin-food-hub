'use strict';

function sanitizeRoadQuery(input){
  let value=String(input||'').normalize('NFKC').replace(/[<>;{}]/g,' ').replace(/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g,' ').replace(/^\s*[\[(]?\d{5}[\])]?\s*/,' ').replace(/\s+/g,' ').trim();
  value=value.replace(/(?:,|\s)+(?:\d+\s*(?:동|호|층)(?:\s|$)|지하\s*\d+층(?:\s|$)|상세.*).*$/u,'').trim();
  if(value.length<2){const error=new Error('도로명과 건물번호를 2글자 이상 입력해주세요.');error.code='ADDRESS_QUERY_TOO_SHORT';error.status=400;throw error;}
  if(value.length>80){const error=new Error('주소 검색어는 80자 이하로 입력해주세요.');error.code='ADDRESS_QUERY_TOO_LONG';error.status=400;throw error;}
  if(/(?:select|insert|update|delete|drop)\s+/i.test(value)){const error=new Error('주소 검색에 사용할 수 없는 문자가 포함되어 있습니다.');error.code='ADDRESS_QUERY_INVALID';error.status=400;throw error;}
  return value;
}
async function lookup({config,query,fetchImpl=fetch}={}){
  const keyword=sanitizeRoadQuery(query);const url=new URL(config.endpoint);url.searchParams.set('confmKey',config.apiKey);url.searchParams.set('currentPage','1');url.searchParams.set('countPerPage','10');url.searchParams.set('keyword',keyword);url.searchParams.set('resultType','json');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(url,{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});const payload=await response.json().catch(()=>({}));
    const common=payload?.results?.common||{};if(common.errorCode&&common.errorCode!=='0'){const error=new Error(common.errorMessage||'도로명주소 조회에 실패했습니다.');error.code=`JUSO_${common.errorCode}`;throw error;}
    const candidates=(payload?.results?.juso||[]).slice(0,10).map(item=>({roadAddress:item.roadAddr||'',roadAddressMain:item.roadAddrPart1||'',roadAddressExtra:item.roadAddrPart2||'',jibunAddress:item.jibunAddr||'',postalCode:item.zipNo||'',buildingName:item.bdNm||''}));
    return {status:candidates.length?'SUCCESS':'NO_DATA',count:Number(common.totalCount||candidates.length),candidates};
  }finally{clearTimeout(timer);}
}
module.exports={lookup,sanitizeRoadQuery};
