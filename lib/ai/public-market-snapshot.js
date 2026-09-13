'use strict';
const {createHash}=require('node:crypto');
const FORMULA_VERSION='public-search-trend-v1';
const SOURCE_URL='https://datalab.naver.com/keyword/trendSearch.naver';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const fail=()=>{throw Object.assign(new Error('PUBLIC_SOURCE_REQUIRED'),{code:'PUBLIC_SOURCE_REQUIRED'});};
function date(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:null;}
function instant(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&date(v.slice(0,10))&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;}
/** Only server-fetched relative search indices; no keyword, question or business inputs. */
function buildPublicMarketSnapshot(input={}){
  if(!keys(input,['approvedPublicSources','now'])||!Array.isArray(input.approvedPublicSources)||input.approvedPublicSources.length!==1)fail();
  const now=new Date(input.now===undefined?Date.now():input.now).getTime();
  if(!Number.isFinite(now))fail();
  const today=new Date(now+9*3600000).toISOString().slice(0,10),s=input.approvedPublicSources[0];
  if(!keys(s,['kind','id','url','observedAt','period','points'])||s.kind!=='NAVER_SEARCH_TREND'||s.id!=='naver-search-trend'||s.url!==SOURCE_URL||!keys(s.period,['start','end']))fail();
  const start=date(s.period.start),end=date(s.period.end),observedAt=instant(s.observedAt);
  if(!start||!end||start>end||end>=today||!observedAt||Date.parse(observedAt)>now||!Array.isArray(s.points)||s.points.length>90)fail();
  const days=(Date.parse(end)-Date.parse(start))/86400000+1;
  if(days>90)fail();
  let previous='';
  const points=s.points.map(p=>{
    if(!keys(p,['date','ratio'])||!date(p.date)||p.date<start||p.date>end||p.date<=previous||p.ratio!==null&&(typeof p.ratio!=='number'||!Number.isFinite(p.ratio)||p.ratio<0||p.ratio>100))fail();
    previous=p.date;return {date:p.date,ratio:p.ratio};
  });
  const valid=points.filter(p=>p.ratio!==null),first=points.find(p=>p.date===start)?.ratio??null,last=points.find(p=>p.date===end)?.ratio??null;
  const metrics={},values={firstIndex:first,lastIndex:last,meanIndex:valid.length?valid.reduce((sum,p)=>sum+p.ratio,0)/valid.length:null,peakIndex:valid.length?Math.max(...valid.map(p=>p.ratio)):null,indexChange:first!==null&&last!==null?last-first:null};
  const definitions={firstIndex:'기간 시작일의 검색 관심 상대지수',lastIndex:'기간 종료일의 검색 관심 상대지수',meanIndex:'관측값이 있는 날짜의 검색 관심 상대지수 평균',peakIndex:'기간 내 관측된 검색 관심 상대지수 최댓값',indexChange:'기간 종료일 상대지수에서 시작일 상대지수를 뺀 지수 차이'};
  for(const [id,value] of Object.entries(values))metrics[id]={value,unit:id==='indexChange'?'INDEX_POINT':'INDEX',definition:definitions[id],sourceId:s.id,reason:value===null?'확인 필요':null};
  const stale=now-Date.parse(observedAt)>86400000||Date.parse(today)-Date.parse(end)>3*86400000;
  const snapshot={dataClass:'PUBLIC_MARKET',scope:'PUBLIC_SEARCH_TREND',platform:'NAVER',label:'선택한 공개 검색 관심 추이',sourceIds:[s.id],sources:[{id:s.id,url:SOURCE_URL,observedAt,kind:s.kind}],sourceAsOf:observedAt,period:{start,end},points,metrics,findings:Object.entries(metrics).filter(([,m])=>m.value!==null).map(([id])=>({id,metricRefs:[id],evidenceRefs:[s.id]})),dataState:valid.length<2?'BLOCKED':stale?'STALE':valid.length!==days?'PARTIAL':'COMPLETE',exclusions:['검색 관심 상대지수이며 실제 검색량·시장점유율·매출을 나타내지 않습니다.','검색어 원문과 내부 운영자료는 포함하지 않습니다.','계절성과 원인 관계는 추가 근거 확인이 필요합니다.'],formulaVersion:FORMULA_VERSION};
  if(snapshot.dataState!=='COMPLETE')snapshot.exclusions.push('자료가 부족하거나 오래되어 현재 판단은 보류합니다.');
  const hashInput={dataClass:snapshot.dataClass,scope:snapshot.scope,sourceIds:snapshot.sourceIds,sources:snapshot.sources.map(({id,url,kind})=>({id,url,kind})),period:snapshot.period,points:snapshot.points,formulaVersion:FORMULA_VERSION};
  snapshot.hash=createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
  return snapshot;
}
/** Rebuild the outbound payload, never forwarding caller-owned metrics, labels or prose. */
function projectPublicMarketSnapshot(snapshot,{now}={}){
  if(!object(snapshot)||snapshot.dataClass!=='PUBLIC_MARKET'||snapshot.scope!=='PUBLIC_SEARCH_TREND'||!Array.isArray(snapshot.sources)||snapshot.sources.length!==1)fail();
  const s=snapshot.sources[0];
  const projected=buildPublicMarketSnapshot({approvedPublicSources:[{kind:s.kind,id:s.id,url:s.url,observedAt:s.observedAt,period:snapshot.period,points:snapshot.points}],now});
  if(snapshot.hash!==projected.hash)fail();
  return projected;
}
module.exports={buildPublicMarketSnapshot,projectPublicMarketSnapshot,projectPublicSnapshot:projectPublicMarketSnapshot,FORMULA_VERSION,SOURCE_URL};
