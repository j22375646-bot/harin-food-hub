'use strict';
// Both windows include exactly one of each weekday. Thresholds are operational
// filters, not a claim of statistical significance or profitability.
function compare(current,previous,settings){
 const hold=reason=>({status:'HOLD',reason,signals:[],previousPeriod:previous?.period});
 if(current?.status!=='OBSERVED'||previous?.status!=='OBSERVED')return hold('누락 자료가 있어 판단 보류');
 const days=p=>(Date.parse(p.end)-Date.parse(p.start))/86400000+1;
 if(days(current.period)!==7||days(previous.period)!==7||Date.parse(current.period.start)-Date.parse(previous.period.end)!==86400000)return hold('연속된 두 7일 기간이 필요합니다');
 if(JSON.stringify(current.campaigns.map(c=>c.id).sort())!==JSON.stringify(previous.campaigns.map(c=>c.id).sort()))return hold('캠페인 구성이 달라 비교 보류');
 const a=current.metrics,b=previous.metrics;
 if([a.clicks,b.clicks,a.cost,b.cost].some(v=>!Number.isFinite(v))||Math.min(a.clicks,b.clicks)<settings.minClicks||Math.min(a.cost,b.cost)<settings.minCost)return hold('두 기간의 최소 클릭·광고비 조건 미달');
 const signals=[];
 for(const [key,label,direction] of [['cost','광고비',1],['cpc','클릭당 비용',1],['roas','ROAS',-1]]){
  if(!Number.isFinite(a[key])||!Number.isFinite(b[key])||b[key]<=0)continue;
  const percent=(a[key]/b[key]-1)*100;
  if(percent*direction>=settings.changePercent)signals.push({key,label,percent:Math.round(percent*10)/10});
 }
 return {status:signals.length?'ALERT':'STABLE',reason:signals.length?'설정한 변화율을 넘었습니다':'설정한 변화율 이내입니다',signals,previousPeriod:previous.period,previousMetrics:b};
}
module.exports={compare};
