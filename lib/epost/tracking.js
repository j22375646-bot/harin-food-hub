'use strict';

const TRACE_URL = 'https://biz.epost.go.kr/KpostPortal/openapi';
const text = value => value == null ? '' : String(value).trim();

function decodeXml(value) {
  return text(value)
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

function tag(xml, ...names) {
  for (const name of names) {
    const match = String(xml || '').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function blocks(xml) {
  const source=String(xml || '');
  for (const name of ['item','trace','event','tracking']) {
    const matches=[...source.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'gi'))].map(match=>match[1]);
    if(matches.length)return matches;
  }
  return [source];
}

function normalizedTime(value) {
  const raw=text(value).replace(/\D/g,'');
  if(raw.length<8)return null;
  const full=raw.padEnd(14,'0').slice(0,14);
  const iso=`${full.slice(0,4)}-${full.slice(4,6)}-${full.slice(6,8)}T${full.slice(8,10)}:${full.slice(10,12)}:${full.slice(12,14)}+09:00`;
  return Number.isNaN(Date.parse(iso))?null:iso;
}

function classifyEvent(event = {}) {
  const description=[event.name,event.resultName,event.resultCode].map(text).join(' ');
  if(/배달완료|전달완료|수취완료|delivered|final.?delivery/i.test(description))return 'DELIVERED';
  // 접수는 우체국이 송장을 인식했지만 아직 실제 배송 이동이 시작되지
  // 않은 상태다. 쇼핑몰이 먼저 배송중으로 바뀌어도 이 단계는 허브의
  // 배송대기중에 남겨 사장님이 실제 이동 주문과 혼동하지 않게 한다.
  if(/접수/.test(description))return 'ACCEPTED';
  if(/배달준비|배달출발|배송중|운송중|발송|도착|인수|delivery|transit/i.test(description))return 'IN_TRANSIT';
  return 'UNKNOWN';
}

function parseTrackingResponse(xml, expectedTrackingNo = '') {
  const errorCode=tag(xml,'error_code','errorCode');
  const errorMessage=tag(xml,'message','error_message','errorMessage');
  // ERR-001 means the parcel has not appeared in tracking yet. It is a valid
  // pre-acceptance state, not a terminal API failure or a dead-letter job.
  if(errorCode==='ERR-001' || /조회결과가 없습니다/.test(errorMessage)) return {
    trackingNo:text(expectedTrackingNo),statusCode:'NOT_FOUND',statusLabel:'우체국 접수 확인 전',latestEvent:null,events:[],deliveredAt:null,checkedAt:new Date().toISOString()
  };
  if(errorCode)throw Object.assign(new Error(errorMessage||`우체국 종추적 오류 ${errorCode}`),{code:errorCode,status:/^ERR-(?:1|2|3)/.test(errorCode)?400:502});
  const events=blocks(xml).map(block=>({
    time:normalizedTime(tag(block,'eventhms','eventHms','eventDate','date')),
    name:tag(block,'tracestatus','traceStatus','eventnm','eventNm','eventName','status'),
    postOffice:tag(block,'eventregiponm','eventRegipoNm','regipoNm','postOffice'),
    resultCode:tag(block,'delivrsltcd','deliveryResultCode','resultCode'),
    resultName:tag(block,'delivrsltNm','deliveryResultName','resultName'),
    nonDeliveryReason:tag(block,'nondelivreasnnm','nonDeliveryReason'),
    relationCode:tag(block,'relationcd','relationCode')
  })).filter(event=>event.time||event.name||event.resultName||event.postOffice)
    .sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')));
  const trackingNo=tag(xml,'regiNo','regino','trackingNo')||text(expectedTrackingNo);
  const latestEvent=events[0]||null;
  const deliveredEvent=events.find(event=>classifyEvent(event)==='DELIVERED')||null;
  const statusCode=deliveredEvent?'DELIVERED':events.some(event=>classifyEvent(event)==='IN_TRANSIT')?'IN_TRANSIT':events.some(event=>classifyEvent(event)==='ACCEPTED')?'ACCEPTED':events.length?'UNKNOWN':'NOT_FOUND';
  const statusLabel={DELIVERED:'배달완료',IN_TRANSIT:'배송중',ACCEPTED:'우체국 접수중',UNKNOWN:'배송상태 확인',NOT_FOUND:'우체국 접수 확인 전'}[statusCode];
  return {
    trackingNo,statusCode,statusLabel,latestEvent,events:events.slice(0,30),
    deliveredAt:deliveredEvent?.time||null,checkedAt:new Date().toISOString()
  };
}

async function trace(trackingNo,{env=process.env,fetchImpl=fetch}={}) {
  const normalized=text(trackingNo);
  if(!/^\d{13}$/.test(normalized))throw Object.assign(new Error('우체국 등기번호 숫자 13자리를 확인하세요.'),{code:'EPOST_TRACKING_REQUIRED',status:400});
  const apiKey=text(env.EPOST_TRACKING_API_KEY);
  if(!apiKey)throw Object.assign(new Error('우체국 종추적 인증키 설정이 필요합니다.'),{code:'EPOST_TRACKING_KEY_REQUIRED',status:503});
  const url=new URL(TRACE_URL);
  url.search=new URLSearchParams({regkey:apiKey,target:'trace',query:normalized}).toString();
  const response=await fetchImpl(url,{headers:{Accept:'application/xml,text/xml','User-Agent':'HarinFoodHub/1.0'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Object.assign(new Error(`우체국 종추적 응답 오류(HTTP ${response.status})`),{code:'EPOST_TRACKING_HTTP_ERROR',status:502});
  const xml=await response.text();
  if(!xml.trim().startsWith('<'))throw Object.assign(new Error('우체국 종추적 XML 응답을 확인할 수 없습니다.'),{code:'EPOST_TRACKING_INVALID_XML',status:502});
  return parseTrackingResponse(xml,normalized);
}

module.exports={TRACE_URL,classifyEvent,parseTrackingResponse,trace};
