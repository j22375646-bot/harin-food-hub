'use strict';

const utils=require('../public-evidence/candidate-utils.js');
const PROVIDER='KAMIS_PRICE';

function requestUrl({apiKey,apiId,returnType='json'}){
  const url=new URL('https://www.kamis.or.kr/service/price/xml.do');
  url.searchParams.set('action','dailySalesList');url.searchParams.set('p_cert_key',apiKey);url.searchParams.set('p_cert_id',apiId);url.searchParams.set('p_returntype',returnType);
  return url.toString();
}
function rowsFrom(payload){
  const options=[payload?.price,payload?.data?.item,payload?.data?.items,payload?.data,payload?.items,payload];
  for(const value of options){if(Array.isArray(value))return value;if(value&&typeof value==='object'&&Array.isArray(value.item))return value.item;}
  return [];
}
function key(value){return utils.cleanText(value,120).toLowerCase().replace(/[^0-9a-z가-힣]/gu,'');}
function normalizeRow(row,now){
  const name=utils.cleanText(row.productName||row.item_name||row.itemName||row.product_name,120),unit=utils.cleanText(row.unit,60);
  const today=utils.cleanText(row.day1||row.date||row.regday,24),todayPrice=utils.cleanText(row.dpr1||row.price||row.today_price,40),previous=utils.cleanText(row.dpr2||row.yesterday_price,40),direction=utils.cleanText(row.direction,40),change=utils.cleanText(row.value,40);
  const productNo=utils.cleanText(row.productno||row.product_no||`${name}-${unit}`,100),sourceDate=utils.dateValue(today)||new Date(now).toISOString().slice(0,10);
  const sourceUrl=`https://www.kamis.or.kr/customer/reference/openapi_list.do?action=detail&boardno=6&productno=${encodeURIComponent(productNo)}`;
  const summary=[`${name}${unit?` · ${unit}`:''}`,todayPrice?`최근 가격 ${todayPrice}원`:'최근 가격 확인 필요',previous?`이전 가격 ${previous}원`:null,direction||change?`변화 ${[direction,change].filter(Boolean).join(' ')}`:null].filter(Boolean).join(' · ');
  const candidate={provider:PROVIDER,evidence_kind:'MARKET_PRICE_CONTEXT',title:`${name} 가격 흐름`,summary,source_url:sourceUrl,source_name:'KAMIS 농산물유통정보',source_date:sourceDate,image_url:null,external_id:`${productNo}:${sourceDate}`,fetched_at:new Date(now).toISOString(),metadata:{product_name:name,product_no:productNo,unit,today_price:todayPrice,previous_price:previous,direction,change}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}
async function probe({config,query,fetchImpl=fetch,now=new Date()}){
  const response=await fetchImpl(requestUrl(config),{headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok){const error=new Error(`KAMIS 응답 ${response.status}`);error.code=response.status===429?'QUOTA_EXCEEDED':'KAMIS_HTTP_ERROR';throw error;}
  const payload=await response.json(),needle=key(query),rows=rowsFrom(payload),matched=rows.filter(row=>{const name=key(row.productName||row.item_name||row.itemName||row.product_name);return name&&(name.includes(needle)||needle.includes(name));}).slice(0,12);
  return {provider:PROVIDER,status:matched.length?'READY':'NO_DATA',totalCount:matched.length,reason:matched.length?null:'NO_MATCHING_PRICE',candidates:matched.map(row=>normalizeRow(row,now))};
}
module.exports={PROVIDER,requestUrl,rowsFrom,normalizeRow,probe};
