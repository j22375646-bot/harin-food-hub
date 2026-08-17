'use strict';

const utils=require('../public-evidence/candidate-utils.js');

const PROVIDER='KOREA_EXIM_FX';
const BASE_URL='https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON';
const GUIDE_URL='https://www.data.go.kr/data/3068846/openapi.do';

class KoreaEximError extends Error{
  constructor(message,status=502,code='KOREA_EXIM_FX_READ_FAILED'){super(message);this.name='KoreaEximError';this.status=status;this.code=code;}
}

const number=value=>{const parsed=Number(String(value??'').replace(/,/gu,''));return Number.isFinite(parsed)?parsed:null;};
const label=value=>value==null?'확인 필요':Number(value).toLocaleString('ko-KR',{maximumFractionDigits:4});

function normalizeRow(row={},searchDate,fetchedAt=new Date().toISOString()){
  const unit=utils.cleanText(row.cur_unit,30),name=utils.cleanText(row.cur_nm,100),dealBase=number(row.deal_bas_r),bookPrice=number(row.bkpr),sendRate=number(row.kftc_bkpr),marketBase=number(row.kftc_deal_bas_r);
  const title=`${unit||name} · ${searchDate} 공식 환율`;
  const summary=[`매매기준율 ${label(dealBase)}원`,bookPrice!=null&&`장부가격 ${label(bookPrice)}원`,sendRate!=null&&`서울외국환중개 매매기준율 ${label(sendRate)}원`,'환율은 원재료 매입비를 비교하는 외부 변수이며 실제 계약환율·원가를 대신하지 않습니다.'].filter(Boolean).join(' · ');
  const sourceUrl=`${GUIDE_URL}?currency=${encodeURIComponent(unit)}&date=${encodeURIComponent(searchDate)}`;
  const candidate={provider:PROVIDER,evidence_kind:'RAW_MATERIAL_EXCHANGE_CONTEXT',title,summary,source_url:sourceUrl,source_name:'한국수출입은행 환율정보',source_date:`${searchDate.slice(0,4)}-${searchDate.slice(4,6)}-${searchDate.slice(6,8)}`,image_url:null,external_id:`${searchDate}:${unit}`,fetched_at:new Date(fetchedAt).toISOString(),metadata:{currency_unit:unit,currency_name:name,search_date:searchDate,deal_base_rate:dealBase,book_price:bookPrice,kftc_book_price:sendRate,kftc_deal_base_rate:marketBase}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

function requestUrl({apiKey,searchDate}){const url=new URL(BASE_URL);url.searchParams.set('authkey',apiKey);url.searchParams.set('searchdate',searchDate);url.searchParams.set('data','AP01');return url.toString();}

async function probe({config,searchDate,currencies=[],fetchImpl=fetch,now=new Date(),timeoutMs=15000}){
  const date=utils.cleanText(searchDate,8),wanted=[...new Set((Array.isArray(currencies)?currencies:[]).map(item=>utils.cleanText(item,12).toUpperCase()).filter(Boolean))];
  if(!/^\d{8}$/.test(date))throw new KoreaEximError('환율 기준일을 YYYYMMDD 형식으로 확인해주세요.',400,'KOREA_EXIM_DATE_REQUIRED');
  if(!wanted.length)throw new KoreaEximError('확인할 통화를 1개 이상 선택해주세요.',400,'KOREA_EXIM_CURRENCY_REQUIRED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(requestUrl({apiKey:config.apiKey,searchDate:date}),{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'}),payload=await response.json().catch(()=>[]);
    if(!response.ok)throw new KoreaEximError(`한국수출입은행 환율 요청에 실패했습니다. (${response.status})`,response.status);
    const rows=Array.isArray(payload)?payload:[],resultCode=Number(rows[0]?.result);
    if(rows.length===1&&!rows[0]?.cur_unit&&resultCode&&resultCode!==1){
      if(resultCode===3)throw new KoreaEximError('한국수출입은행 OpenAPI 인증키를 다시 확인해주세요.',412,'KOREA_EXIM_CONFIG_INVALID');
      if(resultCode===4)throw new KoreaEximError('한국수출입은행 API 일일 호출 한도를 확인해주세요.',429,'KOREA_EXIM_QUOTA_EXHAUSTED');
      throw new KoreaEximError('한국수출입은행 환율 조회 조건을 확인해주세요.',502,`KOREA_EXIM_${resultCode}`);
    }
    const filtered=rows.filter(row=>wanted.some(code=>utils.cleanText(row.cur_unit,30).toUpperCase().startsWith(code))),fetchedAt=new Date(now).toISOString();
    return {provider:PROVIDER,status:filtered.length?'SUCCESS':'NO_DATA',candidates:filtered.map(row=>normalizeRow(row,date,fetchedAt)),totalCount:filtered.length,sourceTimestamp:fetchedAt};
  }catch(error){if(error instanceof KoreaEximError)throw error;if(controller.signal.aborted)throw new KoreaEximError('한국수출입은행 응답 시간이 길어 중단했습니다. 이전 저장 근거는 유지됩니다.',504,'KOREA_EXIM_TIMEOUT');throw new KoreaEximError('한국수출입은행 환율 자료를 읽지 못했습니다. 잠시 뒤 다시 확인해주세요.',502,'KOREA_EXIM_NETWORK_ERROR');}finally{clearTimeout(timer);}
}

module.exports={PROVIDER,BASE_URL,GUIDE_URL,KoreaEximError,normalizeRow,requestUrl,probe};
