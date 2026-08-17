'use strict';

const crypto=require('node:crypto');
const utils=require('./candidate-utils.js');

const ENDPOINT='https://www.law.go.kr/DRF/lawSearch.do';
const DEFAULT_TERMS=Object.freeze(['식품 등의 표시·광고에 관한 법률','식품위생법','전자상거래 등에서의 소비자보호에 관한 법률']);

class KoreanLawApiError extends Error{constructor(message,status=502,code='KOREAN_LAW_READ_FAILED'){super(message);this.name='KoreanLawApiError';this.status=status;this.code=code;}}

function normalizeTerms(value){
  const source=Array.isArray(value)&&value.length?value:DEFAULT_TERMS;
  return [...new Set(source.map(item=>utils.cleanText(item,80)).filter(item=>item.length>=2))].slice(0,5);
}

function requestUrl({oc,query}){const url=new URL(ENDPOINT);for(const [key,value] of Object.entries({OC:oc,target:'eflaw',type:'JSON',query,display:'5',page:'1'}))url.searchParams.set(key,value);return url.toString();}

function normalizeRow(row={},query='',fetchedAt=new Date().toISOString()){
  const name=utils.cleanText(row['법령명한글'],180)||'이름 없는 법령',serial=utils.cleanText(row['법령일련번호'],80),lawId=utils.cleanText(row['법령ID'],80),effectiveAt=utils.dateValue(row['시행일자']);
  const externalId=serial||`${lawId}:${effectiveAt||''}`||crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
  const sourceUrl=`https://www.law.go.kr/%EB%B2%95%EB%A0%B9/${encodeURIComponent(name)}`;
  const candidate={provider:'KOREAN_LAW',evidence_kind:'LAW_STATUS',title:name,summary:[utils.cleanText(row['법령구분명'],80),utils.cleanText(row['소관부처명'],120),utils.cleanText(row['제개정구분명'],80),effectiveAt&&`시행 ${effectiveAt}`].filter(Boolean).join(' · ').slice(0,4000)||'국가법령정보센터 현행법령',source_url:sourceUrl,source_name:'국가법령정보센터',source_date:utils.dateValue(row['공포일자']||row['시행일자']),image_url:null,external_id:externalId,fetched_at:fetchedAt,metadata:{query,law_name:name,law_id:lawId,law_serial:serial,law_type:utils.cleanText(row['법령구분명'],80),department:utils.cleanText(row['소관부처명'],120),revision_type:utils.cleanText(row['제개정구분명'],80),promulgation_no:utils.cleanText(row['공포번호'],80),promulgated_at:utils.dateValue(row['공포일자']),effective_at:effectiveAt,history_status:utils.cleanText(row['현행연혁코드'],80)}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function fetchTerm({config,query,fetchImpl=fetch,timeoutMs=15000,now=new Date()}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(requestUrl({oc:config.oc,query}),{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new KoreanLawApiError(`국가법령정보를 읽지 못했습니다. (${response.status})`,response.status);
    const raw=payload?.LawSearch?.law,rows=Array.isArray(raw)?raw:raw?[raw]:[];const fetchedAt=new Date(now).toISOString();
    return rows.map(row=>normalizeRow(row,query,fetchedAt));
  }catch(error){if(error instanceof KoreanLawApiError)throw error;if(controller.signal.aborted)throw new KoreanLawApiError('국가법령정보 응답 시간이 길어 중단했습니다.',504,'KOREAN_LAW_TIMEOUT');throw new KoreanLawApiError('국가법령정보를 읽지 못했습니다. 이전 저장 근거는 유지됩니다.',502,'KOREAN_LAW_NETWORK_ERROR');}finally{clearTimeout(timer);}
}

async function probe({config,terms,fetchImpl=fetch,now=new Date()}){
  const queries=normalizeTerms(terms),settled=await Promise.allSettled(queries.map(query=>fetchTerm({config,query,fetchImpl,now})));
  const candidates=[],errors=[];settled.forEach((item,index)=>item.status==='fulfilled'?candidates.push(...item.value):errors.push({query:queries[index],code:item.reason?.code||'KOREAN_LAW_READ_FAILED',message:item.reason?.message||'법령정보를 읽지 못했습니다.'}));
  if(!candidates.length&&errors.length)throw settled.find(item=>item.status==='rejected').reason;
  const deduped=[...new Map(candidates.map(item=>[item.external_key,item])).values()];
  return {provider:'KOREAN_LAW',status:deduped.length?'SUCCESS':'NO_DATA',candidates:deduped,totalCount:deduped.length,sourceTimestamp:new Date(now).toISOString(),errors};
}

module.exports={ENDPOINT,DEFAULT_TERMS,KoreanLawApiError,normalizeTerms,requestUrl,normalizeRow,fetchTerm,probe};
