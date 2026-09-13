'use strict';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const error=code=>{throw Object.assign(new Error(code),{code});};
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function validateInsightRequest(body){
  if(!keys(body,['requestId','reportIds','question','kind','parentRunId'])||!uuid(body.requestId)||!Array.isArray(body.reportIds)||body.reportIds.length<1||body.reportIds.length>2||body.reportIds.some(v=>typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(v))||new Set(body.reportIds).size!==body.reportIds.length||typeof body.question!=='string'||Array.from(body.question).length>500||!['SUMMARY','QUESTION'].includes(body.kind)||body.kind==='QUESTION'&&!body.question.trim()||body.kind==='SUMMARY'&&body.question.trim()||body.parentRunId!==undefined&&(!uuid(body.parentRunId)||body.kind!=='QUESTION'))error('INVALID_REQUEST');
  return {requestId:body.requestId,reportIds:[...body.reportIds],question:body.question.trim(),kind:body.kind,...(body.parentRunId?{parentRunId:body.parentRunId}:{})};
}
const string={type:'string',maxLength:1200};
const refs={type:'array',maxItems:20,uniqueItems:true,items:{type:'string',maxLength:128}};
const INSIGHT_OUTPUT_SCHEMA={type:'object',additionalProperties:false,required:['cards','answer','nextChecks'],properties:{cards:{type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['findingId','observation','hypothesis','metricRefs','evidenceRefs','nextCheck'],properties:{findingId:{type:'string',maxLength:128},observation:string,hypothesis:string,metricRefs:refs,evidenceRefs:refs,nextCheck:string}}},answer:{type:'string',maxLength:2400},nextChecks:{type:'array',maxItems:5,items:string}}};
function validateInsightOutput(value,snapshot){
  const invalid=()=>error('INVALID_OUTPUT');
  if(!keys(value,['cards','answer','nextChecks'])||!Array.isArray(value.cards)||value.cards.length>5||!Array.isArray(value.nextChecks)||value.nextChecks.length>5||!object(snapshot?.metrics)||!Array.isArray(snapshot?.sourceIds))invalid();
  const prose=(s,max=1200,refsAllowed=null)=>{
    if(typeof s!=='string'||s.length>max)invalid();
    const scrubbed=s.replace(/\{\{metric:([A-Za-z][A-Za-z0-9]*)\}\}/g,(_,id)=>{
      if(!Object.hasOwn(snapshot.metrics,id)||refsAllowed&&!refsAllowed.includes(id))invalid();
      return '';
    });
    if(/[\p{N}<>`{}]|https?:|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b|javascript:|data:|\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|curl|powershell)\b/iu.test(scrubbed))invalid();
    if(/(광고|가격|재고|주문|메시지).*(변경했|변경하였|발송했|실행했|삭제했|자동.*변경)/.test(scrubbed))invalid();
    if(/(원인(?:은|으로).*확정|때문에.*(?:감소|증가)|반드시.*(?:개선|증가)|보장)/.test(scrubbed))invalid();
    if(snapshot.metrics.contributionProfit?.value==null&&/(이익|수익성).*(확실|확정|좋아졌|개선됐|증가했|흑자)/.test(scrubbed))invalid();
    return s;
  };
  const cards=value.cards.map(c=>{
    if(!keys(c,['findingId','observation','hypothesis','metricRefs','evidenceRefs','nextCheck']))invalid();
    const finding=snapshot.findings?.find(f=>f.id===c.findingId);
    if(!finding)invalid();
    for(const [field,allow] of [['metricRefs',finding.metricRefs],['evidenceRefs',finding.evidenceRefs]]){
      if(!Array.isArray(c[field])||!c[field].length||c[field].length>20||new Set(c[field]).size!==c[field].length||c[field].some(id=>!allow.includes(id)))invalid();
    }
    if(c.metricRefs.some(id=>!Object.hasOwn(snapshot.metrics,id))||c.evidenceRefs.some(id=>!snapshot.sourceIds.includes(id)))invalid();
    // Every metric needs all of its report evidence; a comparison cannot cite only one period.
    if(c.metricRefs.some(id=>(snapshot.metrics[id].sourceIds||[snapshot.metrics[id].sourceId]).some(source=>!c.evidenceRefs.includes(source))))invalid();
    return {findingId:c.findingId,observation:prose(c.observation,1200,c.metricRefs),hypothesis:prose(c.hypothesis,1200,c.metricRefs),metricRefs:[...c.metricRefs],evidenceRefs:[...c.evidenceRefs],nextCheck:prose(c.nextCheck,1200,c.metricRefs)};
  });
  if(new Set(cards.map(c=>c.findingId)).size!==cards.length)invalid();
  return {cards,answer:prose(value.answer,2400),nextChecks:value.nextChecks.map(s=>prose(s))};
}
function materializeInsight(value,snapshot){
  const validated=validateInsightOutput(value,snapshot);
  const replace=s=>s.replace(/\{\{metric:([A-Za-z][A-Za-z0-9]*)\}\}/g,(_,id)=>{
    const m=snapshot.metrics[id];
    return m.value===null?'확인 필요':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(m.value)+({KRW:'원',COUNT:'건',PERCENT:'%',PERCENT_POINT:'%p'}[m.unit]||'');
  });
  return {cards:validated.cards.map(c=>({...c,observation:replace(c.observation),hypothesis:replace(c.hypothesis),nextCheck:replace(c.nextCheck)})),answer:replace(validated.answer),nextChecks:validated.nextChecks.map(replace)};
}
module.exports={validateInsightRequest,validateInsightOutput,materializeInsight,INSIGHT_OUTPUT_SCHEMA,insightOutputSchema:INSIGHT_OUTPUT_SCHEMA};
