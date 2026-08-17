'use strict';

const utils=require('../public-evidence/candidate-utils.js');
const PROVIDER='KMA_WEATHER';
const FALLBACK_HEADERS=['REG_ID','TM_FC','TM_EF','MOD','NE','STN','C','MAN_ID','MAN_FC','W1','T','W2','TA','ST','SKY','PREP','WF'];

function requestUrl({authKey,regionCode}){const url=new URL('https://apihub.kma.go.kr/api/typ01/url/fct_afs_dl.php');url.searchParams.set('reg',regionCode);url.searchParams.set('disp','1');url.searchParams.set('help','0');url.searchParams.set('authKey',authKey);return url.toString();}
function publicSourceUrl(regionCode){return `https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=286&reg=${encodeURIComponent(regionCode)}`;}
function parseForecast(text){
  const source=String(text||'').trim();if(!source)return [];
  if(source.startsWith('{')||source.startsWith('[')){try{const payload=JSON.parse(source),rows=Array.isArray(payload)?payload:payload?.data||payload?.items||[];return Array.isArray(rows)?rows:[];}catch{return [];}}
  const lines=source.split(/\r?\n/u).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  if(!lines.length)return [];
  let headers=FALLBACK_HEADERS,start=0;const first=lines[0].split(',').map(item=>item.trim());
  if(first.some(item=>item==='REG_ID')&&first.some(item=>item==='TM_EF')){headers=first;start=1;}
  return lines.slice(start).map(line=>{const values=line.split(',').map(item=>item.trim());return Object.fromEntries(headers.map((header,index)=>[header,values[index]??'']));}).filter(item=>item.REG_ID||item.TM_EF);
}
function compactDate(value){const text=utils.cleanText(value,24).replace(/[^0-9]/gu,'');if(text.length>=10)return `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)} ${text.slice(8,10)}시`;return utils.cleanText(value,40);}
function normalizeRow(row,{regionLabel,regionCode},now){
  const effective=utils.cleanText(row.TM_EF||row.tmEf||row.date,30),temperature=utils.cleanText(row.TA||row.temperature,30),precipitation=utils.cleanText(row.ST||row.rainProbability||row.POP,30),sky=utils.cleanText(row.SKY||row.sky,60),weather=utils.cleanText(row.WF||row.weather||row.PREP,180);
  const summary=[`${regionLabel} · ${compactDate(effective)}`,temperature&&`기온 ${temperature}℃`,precipitation&&`강수확률 ${precipitation}%`,sky||weather].filter(Boolean).join(' · ');
  const sourceUrl=publicSourceUrl(regionCode),externalId=`${regionCode}:${effective||new Date(now).toISOString().slice(0,13)}`;
  const candidate={provider:PROVIDER,evidence_kind:'WEATHER_CONTEXT',title:`${regionLabel} 중기예보`,summary,source_url:sourceUrl,source_name:'기상청 API허브',source_date:utils.dateValue(effective)||new Date(now).toISOString().slice(0,10),image_url:null,external_id:externalId,fetched_at:new Date(now).toISOString(),metadata:{region_code:regionCode,region_label:regionLabel,effective_at:effective,temperature,precipitation_probability:precipitation,sky,weather}};
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}
async function probe({config,fetchImpl=fetch,now=new Date()}){
  const response=await fetchImpl(requestUrl(config),{headers:{accept:'text/plain'},cache:'no-store'});
  if(!response.ok){const error=new Error(`기상청 응답 ${response.status}`);error.code=response.status===429?'QUOTA_EXCEEDED':'KMA_HTTP_ERROR';throw error;}
  const rows=parseForecast(await response.text()).filter(row=>!row.REG_ID||row.REG_ID===config.regionCode).slice(0,12);
  return {provider:PROVIDER,status:rows.length?'READY':'NO_DATA',totalCount:rows.length,reason:rows.length?null:'NO_FORECAST_DATA',candidates:rows.map(row=>normalizeRow(row,config,now))};
}
module.exports={PROVIDER,FALLBACK_HEADERS,requestUrl,publicSourceUrl,parseForecast,normalizeRow,probe};
