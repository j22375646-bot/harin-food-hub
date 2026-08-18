'use strict';

const {normalizeServiceKey}=require('../public-data/service-key.js');

function tag(xml,name){return String(xml||'').match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`,'i'))?.[1]?.trim()||'';}
function parseHolidayXml(xml){
  const code=tag(xml,'resultCode');const message=tag(xml,'resultMsg');
  if(code&&!['00','NORMAL_SERVICE'].includes(code)){const error=new Error(message||`공휴일 API 오류 ${code}`);error.code=`HOLIDAY_${code}`;throw error;}
  const items=[...String(xml||'').matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match=>({date:tag(match[1],'locdate'),name:tag(match[1],'dateName'),isHoliday:tag(match[1],'isHoliday')!=='N'})).filter(item=>/^\d{8}$/.test(item.date)&&item.isHoliday);
  return items;
}
async function readYear({config,year,fetchImpl=fetch}={}){
  const numericYear=Number(year);if(!Number.isInteger(numericYear)||numericYear<2020||numericYear>2100){const error=new Error('조회 연도가 올바르지 않습니다.');error.code='INVALID_YEAR';error.status=400;throw error;}
  const url=new URL(config.endpoint);url.searchParams.set('ServiceKey',normalizeServiceKey(config.apiKey));url.searchParams.set('solYear',String(numericYear));url.searchParams.set('numOfRows','100');url.searchParams.set('pageNo','1');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(url,{headers:{Accept:'application/xml'},cache:'no-store',signal:controller.signal});
    const body=await response.text();if(!response.ok){const error=new Error(`공휴일 API HTTP ${response.status}`);error.code=`HOLIDAY_HTTP_${response.status}`;throw error;}
    const holidays=parseHolidayXml(body);return {status:holidays.length?'SUCCESS':'NO_DATA',year:numericYear,holidays,sourceTimestamp:new Date().toISOString()};
  }finally{clearTimeout(timer);}
}
module.exports={parseHolidayXml,readYear};
