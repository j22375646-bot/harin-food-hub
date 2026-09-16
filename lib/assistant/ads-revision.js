'use strict';
const fields=[['cost','광고비','원'],['clicks','클릭','회'],['conversions','전환','건'],['revenue','전환매출','원'],['roas','ROAS','%p'],['impressions','노출','회'],['ctr','CTR','%p'],['cpc','CPC','원'],['cpa','CPA','원']];
const known=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const rounded=v=>(Math.round(v*100)/100)||0;
function compareRevision(current,previous){
 let reason='';
 const ids=r=>Array.isArray(r?.campaigns)&&r.campaigns.length&&r.campaigns.every(c=>typeof c.id==='string')?JSON.stringify(r.campaigns.map(c=>c.id).sort()):null;
 if(!previous)reason='원본 자료를 확인할 수 없어 비교 보류';
 else if(!current.period||!previous.period||current.period.start!==previous.period.start||current.period.end!==previous.period.end)reason='조회 기간이 달라 비교 보류';
 else if(!ids(current)||ids(current)!==ids(previous))reason='집계 캠페인이 달라 비교 보류';
 else if([current,previous].some(r=>r.status!=='OBSERVED'||!Number.isInteger(r.expectedRows)||r.expectedRows<=0||r.observedRows!==r.expectedRows)||current.expectedRows!==previous.expectedRows)reason='누락 자료 또는 집계 범위 보완이 있어 수치 비교 보류';
 const rows=fields.map(([key,label,unit])=>{
  const before=known(previous?.metrics?.[key])?previous.metrics[key]:null,after=known(current.metrics?.[key])?current.metrics[key]:null;
  const comparable=!reason&&before!==null&&after!==null;
  const delta=comparable?rounded(after-before):null;
  return {key,label,unit,before,after,delta,percent:comparable&&before>0?rounded((after/before-1)*100):null,state:before===null&&after!==null?'ADDED':before!==null&&after===null?'MISSING':comparable?(delta===0?'UNCHANGED':'CHANGED'):'UNKNOWN'};
 });
 const status=reason?'HOLD':rows.some(r=>r.state==='CHANGED')?'CHANGED':'UNCHANGED';
 return {status,reason:reason||(status==='CHANGED'?'같은 기간을 다시 조회한 결과 수치가 갱신됐습니다':'같은 기간의 비교 가능한 수치가 동일합니다'),rows,previousSourceAsOf:previous?.sourceAsOf||null,currentSourceAsOf:current.sourceAsOf||null,coverage:{before:previous?{observed:previous.observedRows,expected:previous.expectedRows}:null,after:{observed:current.observedRows,expected:current.expectedRows}},caveat:'서로 다른 날짜의 성과 비교가 아닌 같은 기간의 재조회입니다. 전환 반영 지연·자료 보완 등 원인은 별도 확인해야 합니다.'};
}
function describe(c){if(!c)return '';return '원본 대비 재조회: '+c.reason+(c.status==='CHANGED'?'\n'+c.rows.filter(r=>r.state==='CHANGED').slice(0,5).map(r=>r.label+' '+r.before+' → '+r.after+' ('+(r.delta>0?'+':'')+r.delta+r.unit+')').join('\n'):'')+'\n'+c.caveat;}
module.exports={compareRevision,describe};
