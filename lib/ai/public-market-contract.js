'use strict';
const {validateInsightOutput,INSIGHT_OUTPUT_SCHEMA}=require('./insight-contract');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const PUBLIC_MARKET_KINDS=Object.freeze(['TREND_EXPLANATION','SEASONAL_NOTES']);
const PUBLIC_MARKET_OUTPUT_SCHEMA=INSIGHT_OUTPUT_SCHEMA;
function validatePublicMarketRequest(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['requestId','kind'].includes(k))||typeof value.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)||!PUBLIC_MARKET_KINDS.includes(value.kind))fail('INVALID_REQUEST');
  return {requestId:value.requestId,kind:value.kind};
}
function validatePublicMarketOutput(value,snapshot){
  if(snapshot?.dataClass!=='PUBLIC_MARKET'||snapshot?.scope!=='PUBLIC_SEARCH_TREND')fail('INVALID_OUTPUT');
  const validated=validateInsightOutput(value,snapshot);
  const cited=new Set(validated.cards.flatMap(c=>c.metricRefs));
  const prose=[validated.answer,...validated.nextChecks,...validated.cards.flatMap(c=>[c.observation,c.hypothesis,c.nextCheck])];
  for(const text of prose){
    // No operational or monetary inference is supported by a relative index series.
    if(/매출|수익|이익|시장\s*점유율|검색량|절대\s*수요|판매량|전환율|revenue|profit|market\s*share|search\s*volume|sales|caused?\s+by|causes?|보장|확정|때문에|원인이다|변경했|변경하였|발송했|실행했|삭제했|적용했|완료했|수정했|자동.*(?:실행|변경)|executed|updated|sent|deleted/iu.test(text))fail('INVALID_OUTPUT');
    for(const [,id] of text.matchAll(/\{\{metric:([A-Za-z][A-Za-z0-9]*)\}\}/g))if(!cited.has(id))fail('INVALID_OUTPUT');
  }
  return validated;
}
function materializePublicMarketInsight(value,snapshot){
  const v=validatePublicMarketOutput(value,snapshot);
  const replace=text=>text.replace(/\{\{metric:([A-Za-z][A-Za-z0-9]*)\}\}/g,(_,id)=>{const m=snapshot.metrics[id];if(!['INDEX','INDEX_POINT'].includes(m.unit)||m.value!==null&&!Number.isFinite(m.value))fail('INVALID_OUTPUT');return m.value===null?'확인 필요':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(m.value)+(m.unit==='INDEX_POINT'?'지수 포인트':'지수');});
  return {cards:v.cards.map(c=>({...c,observation:replace(c.observation),hypothesis:replace(c.hypothesis),nextCheck:replace(c.nextCheck)})),answer:replace(v.answer),nextChecks:v.nextChecks.map(replace)};
}
module.exports={validatePublicMarketRequest,validatePublicMarketOutput,materializePublicMarketInsight,PUBLIC_MARKET_KINDS,PUBLIC_MARKET_OUTPUT_SCHEMA,MARKET_OUTPUT_SCHEMA:PUBLIC_MARKET_OUTPUT_SCHEMA};
