'use strict';

const {normalizeServiceKey}=require('../public-data/service-key.js');

const utils=require('../public-evidence/candidate-utils.js');
const xml=require('./xml.js');

const PROVIDER='KCS_TRADE';
const BASE_URL='https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList';
const GUIDE_URL='https://www.data.go.kr/data/15100475/openapi.do';

class CustomsTradeError extends Error{
  constructor(message,status=502,code='KCS_TRADE_READ_FAILED'){super(message);this.name='CustomsTradeError';this.status=status;this.code=code;}
}

const amount=value=>{const number=Number(String(value??'').replace(/,/gu,''));return Number.isFinite(number)?number:null;};
const money=value=>value==null?'확인 필요':`${Math.round(value).toLocaleString('ko-KR')}달러`;
const weight=value=>value==null?'확인 필요':`${Math.round(value).toLocaleString('ko-KR')}kg`;

function normalizeRow(row={},fetchedAt=new Date().toISOString()){
  const year=utils.cleanText(row.year,20),countryName=utils.cleanText(row.statCdCntnKor1,80),countryCode=utils.cleanText(row.statCd,10).toUpperCase(),itemName=utils.cleanText(row.statKor,180),hsCode=utils.cleanText(row.hsCd,20),importWeight=amount(row.impWgt),importDollar=amount(row.impDlr),exportWeight=amount(row.expWgt),exportDollar=amount(row.expDlr),balance=amount(row.balPayments);
  const title=`${itemName||`HS ${hsCode}`} · ${countryName||countryCode} ${year||'월간'} 무역`;
  const summary=[`수입 ${weight(importWeight)} · ${money(importDollar)}`,`수출 ${weight(exportWeight)} · ${money(exportDollar)}`,balance==null?'무역수지 확인 필요':`무역수지 ${money(balance)}`,'통관 실적이며 자사 매입량·판매량 또는 미래 수요를 뜻하지 않습니다.'].join(' · ');
  const sourceUrl=`${GUIDE_URL}?hsCode=${encodeURIComponent(hsCode)}&country=${encodeURIComponent(countryCode)}&period=${encodeURIComponent(year)}`;
  const externalId=[year,countryCode,hsCode].filter(Boolean).join(':')||utils.externalKey(PROVIDER,title,GUIDE_URL);
  const candidate={provider:PROVIDER,evidence_kind:'RAW_MATERIAL_TRADE_CONTEXT',title,summary,source_url:sourceUrl,source_name:'관세청 품목별 국가별 수출입실적',source_date:year?`${year.replace(/\D/gu,'').slice(0,4)}-${year.replace(/\D/gu,'').slice(4,6)||'01'}-01`:null,image_url:null,external_id:externalId,fetched_at:new Date(fetchedAt).toISOString(),metadata:{period:year,country_name:countryName,country_code:countryCode,item_name:itemName,hs_code:hsCode,import_weight_kg:importWeight,import_amount_usd:importDollar,export_weight_kg:exportWeight,export_amount_usd:exportDollar,trade_balance_usd:balance}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

function requestUrl({apiKey,startYymm,endYymm,hsCode,countryCode}){
  const url=new URL(BASE_URL);url.searchParams.set('serviceKey',normalizeServiceKey(apiKey));url.searchParams.set('strtYymm',startYymm);url.searchParams.set('endYymm',endYymm);url.searchParams.set('cntyCd',countryCode);if(hsCode)url.searchParams.set('hsSgn',hsCode);return url.toString();
}

async function probe({config,startYymm,endYymm,hsCode,countryCode,fetchImpl=fetch,now=new Date(),timeoutMs=15000}){
  const start=utils.cleanText(startYymm,6),end=utils.cleanText(endYymm,6),hs=utils.cleanText(hsCode,10),country=utils.cleanText(countryCode,2).toUpperCase();
  if(!/^\d{6}$/.test(start)||!/^\d{6}$/.test(end)||start>end)throw new CustomsTradeError('관세청 조회 시작·종료월을 YYYYMM 형식으로 확인해주세요.',400,'KCS_TRADE_PERIOD_REQUIRED');
  if(hs&&!/^(?:\d{2}|\d{4}|\d{6}|\d{10})$/.test(hs))throw new CustomsTradeError('HS 코드는 2·4·6·10자리 숫자로 입력해주세요.',400,'KCS_TRADE_HS_INVALID');
  if(!/^[A-Z]{2}$/.test(country))throw new CustomsTradeError('국가 코드는 US·CN처럼 영문 2자리로 입력해주세요.',400,'KCS_TRADE_COUNTRY_REQUIRED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(requestUrl({apiKey:config.apiKey,startYymm:start,endYymm:end,hsCode:hs,countryCode:country}),{headers:{Accept:'application/xml,text/xml'},signal:controller.signal,cache:'no-store'}),body=await response.text();
    if(!response.ok)throw new CustomsTradeError(`관세청 무역통계 요청에 실패했습니다. (${response.status})`,response.status);
    const resultCode=xml.tag(body,'resultCode'),resultMessage=xml.tag(body,'resultMsg');
    if(resultCode&&resultCode!=='00'){
      if(['20','30','31'].includes(resultCode))throw new CustomsTradeError('공공데이터포털 서비스키와 관세청 API 활용신청 상태를 확인해주세요.',412,'KCS_TRADE_CONFIG_INVALID');
      if(['22','23'].includes(resultCode))throw new CustomsTradeError('관세청 API 호출 한도를 확인해주세요. 저장된 이전 근거는 유지됩니다.',429,'KCS_TRADE_QUOTA_EXHAUSTED');
      throw new CustomsTradeError(resultMessage||'관세청 무역통계 응답을 확인하지 못했습니다.',502,`KCS_TRADE_${resultCode}`);
    }
    const fetchedAt=new Date(now).toISOString(),rows=xml.items(body).map(block=>({year:xml.tag(block,'year'),statCdCntnKor1:xml.tag(block,'statCdCntnKor1'),statCd:xml.tag(block,'statCd'),statKor:xml.tag(block,'statKor'),hsCd:xml.tag(block,'hsCd'),expWgt:xml.tag(block,'expWgt'),expDlr:xml.tag(block,'expDlr'),impWgt:xml.tag(block,'impWgt'),impDlr:xml.tag(block,'impDlr'),balPayments:xml.tag(block,'balPayments')}));
    return {provider:PROVIDER,status:rows.length?'SUCCESS':'NO_DATA',candidates:rows.slice(0,24).map(row=>normalizeRow(row,fetchedAt)),totalCount:Number(xml.tag(body,'totalCount'))||rows.length,sourceTimestamp:fetchedAt};
  }catch(error){if(error instanceof CustomsTradeError)throw error;if(controller.signal.aborted)throw new CustomsTradeError('관세청 응답 시간이 길어 중단했습니다. 이전 저장 근거는 유지됩니다.',504,'KCS_TRADE_TIMEOUT');throw new CustomsTradeError('관세청 무역통계 자료를 읽지 못했습니다. 잠시 뒤 다시 확인해주세요.',502,'KCS_TRADE_NETWORK_ERROR');}finally{clearTimeout(timer);}
}

module.exports={PROVIDER,BASE_URL,GUIDE_URL,CustomsTradeError,normalizeRow,requestUrl,probe};
