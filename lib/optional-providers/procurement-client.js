'use strict';

const {normalizeServiceKey}=require('../public-data/service-key.js');

const SAMPLE_NOTICE_NUMBER='20160234982';

function tag(xml,name){return String(xml||'').match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`,'i'))?.[1]?.trim()||'';}
function parseResponse(xml){
  const code=tag(xml,'resultCode'),message=tag(xml,'resultMsg');
  if(code&&!['00','NORMAL_SERVICE'].includes(code)){
    const error=new Error(message||`나라장터 API 오류 ${code}`);error.code=`PROCUREMENT_${code}`;
    if(['20','22','30','31'].includes(code))error.status=412;
    throw error;
  }
  const items=[...String(xml||'').matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match=>({
    noticeNumber:tag(match[1],'bidNtceNo'),noticeName:tag(match[1],'bidNtceNm'),organization:tag(match[1],'bidDminsttNm'),noticeDate:tag(match[1],'bidNtceDt'),contractMethod:tag(match[1],'cntrctCnclsMthdNm')
  }));
  return {status:items.length?'SUCCESS':'NO_DATA',items,totalCount:Number(tag(xml,'totalCount')||items.length),message};
}
async function probe({config,bidNoticeNumber=SAMPLE_NOTICE_NUMBER,fetchImpl=fetch}={}){
  const notice=String(bidNoticeNumber||'').replace(/[^0-9]/g,'').slice(0,20);
  if(!notice){const error=new Error('검증할 입찰공고번호가 필요합니다.');error.code='PROCUREMENT_NOTICE_REQUIRED';error.status=400;throw error;}
  const url=new URL(config.endpoint);url.searchParams.set('inqryDiv','1');url.searchParams.set('bidNtceNo',notice);url.searchParams.set('pageNo','1');url.searchParams.set('numOfRows','1');url.searchParams.set('ServiceKey',normalizeServiceKey(config.apiKey));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetchImpl(url,{headers:{Accept:'application/xml'},cache:'no-store',signal:controller.signal});
    const body=await response.text();if(!response.ok){const error=new Error(`나라장터 API HTTP ${response.status}`);error.code=`PROCUREMENT_HTTP_${response.status}`;throw error;}
    return {...parseResponse(body),provider:'PUBLIC_PROCUREMENT',sampleNoticeNumber:notice,sourceTimestamp:new Date().toISOString()};
  }catch(error){if(controller.signal.aborted){error=new Error('나라장터 응답 시간이 길어 중단했습니다.');error.code='PROCUREMENT_TIMEOUT';error.status=504;}throw error;}
  finally{clearTimeout(timer);}
}

module.exports={SAMPLE_NOTICE_NUMBER,parseResponse,probe};
