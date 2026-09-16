'use strict';
const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const fields={impressions:'impCnt',clicks:'clkCnt',cost:'salesAmt',conversions:'ccnt',revenue:'convAmt'};
const fail=code=>Object.assign(Error(code),{code});
function points(raw,id,start,end){
 const entity=Array.isArray(raw)?raw[0]:raw;const rows=entity?.data||entity?.stats;
 if(!Array.isArray(rows)||!rows.length)throw fail('ADS_NO_DATA');
 const seen=new Set();return rows.map(p=>{const date=String(p.period||p.date||p.statDt||p.dateStart||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<start||date>end||seen.has(date))throw fail('ADS_DATE_INVALID');seen.add(date);return {date,id,...Object.fromEntries(Object.entries(fields).map(([key,api])=>[key,n(p[api])]))};});
}
function summarize(rows,period,campaigns,sourceAsOf){
 if(!rows.length)throw fail('ADS_NO_DATA');const totals=Object.fromEntries(Object.keys(fields).map(k=>[k,rows.some(r=>r[k]===null)?null:rows.reduce((a,r)=>a+r[k],0)]));
 const ratio=(a,b,m=1)=>a!==null&&b!==null&&b>0?a/b*m:null;
 const metrics={...totals,ctr:ratio(totals.clicks,totals.impressions,100),cpc:ratio(totals.cost,totals.clicks),cpa:ratio(totals.cost,totals.conversions),roas:ratio(totals.revenue,totals.cost,100)};
 const days=(Date.parse(period.end)-Date.parse(period.start))/86400000+1,expected=days*campaigns.length;
 return {advertisingAssistant:true,platform:'NAVER',period,sourceAsOf,generatedAt:new Date().toISOString(),status:rows.length===expected&&Object.values(totals).every(v=>v!==null)?'OBSERVED':'PARTIAL',observedRows:rows.length,expectedRows:expected,metrics,campaigns:campaigns.map(c=>({id:c.id,name:c.name,...Object.fromEntries(Object.keys(fields).map(k=>{const x=rows.filter(r=>r.id===c.id);return [k,!x.length||x.some(r=>r[k]===null)?null:x.reduce((a,r)=>a+r[k],0)];}))})),caveats:['네이버 광고 API에 관측된 자료만 집계했습니다. 누락 일자·지표를 0으로 보정하지 않습니다.','광고 전환매출은 실제 정산매출·순이익과 다릅니다. 원가·수수료·배송비와 주문 귀속 확인 전 이익 판단은 보류합니다.','전환 수치는 나중에 변경될 수 있습니다. 캠페인 삭제 등으로 조회되지 않은 과거 항목은 포함되지 않을 수 있습니다.']};
}
function selectCampaigns(campaigns,ids){if(!ids.length)return campaigns;if(ids.some(id=>!campaigns.some(c=>c.id===id)))throw fail('ADS_CAMPAIGN_MISSING');return campaigns.filter(c=>ids.includes(c.id));}
async function collect({start,end,fresh,db,campaignIds=[],request=require('../naver/client.js').request,now=new Date()}){
 let campaigns,rows=[],sourceAsOf=null;
 if(fresh){const r=await request('GET','/ncc/campaigns');if(!Array.isArray(r.data)||!r.data.length||r.data.length>100)throw fail('ADS_CAMPAIGNS_REQUIRED');campaigns=r.data.map(c=>({id:c.nccCampaignId,name:c.name}));if(campaigns.some(c=>!c.id))throw fail('ADS_CAMPAIGNS_REQUIRED');
  campaigns=selectCampaigns(campaigns,campaignIds);
  for(let i=0;i<campaigns.length;i+=4){const groups=await Promise.all(campaigns.slice(i,i+4).map(async c=>points((await request('GET','/stats',{id:c.id,fields:Object.values(fields),timeRange:{since:start,until:end},timeIncrement:1})).data,c.id,start,end)));rows.push(...groups.flat());}sourceAsOf=now.toISOString();
 }else{const [c,r]=await Promise.all([db.from('naver_campaigns').select('ncc_campaign_id,name').limit(101),db.from('naver_stats_daily').select('date,entity_id,impressions,clicks,cost,conversions,conversion_revenue,updated_at').eq('entity_type','CAMPAIGN').gte('date',start).lte('date',end).limit(10001)]);if(c.error||r.error||!c.data?.length||c.data.length>100||r.data?.length>=10001)throw fail('ADS_STORED_DATA_REQUIRED');campaigns=selectCampaigns(c.data.map(x=>({id:x.ncc_campaign_id,name:x.name})),campaignIds);rows=r.data.filter(r=>campaigns.some(c=>c.id===r.entity_id)).map(r=>({date:r.date,id:r.entity_id,impressions:n(r.impressions),clicks:n(r.clicks),cost:n(r.cost),conversions:n(r.conversions),revenue:n(r.conversion_revenue)}));}
 return summarize(rows,{start,end},campaigns,sourceAsOf);
}
const escape=s=>String(s??'확인 필요').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function revisionHtml(c){if(!c)return '';return '<h2>원본과 재작성 비교</h2><p>'+escape(c.reason)+'</p><p>원본 조회 '+escape(c.previousSourceAsOf)+' · 재조회 '+escape(c.currentSourceAsOf)+'</p><table><thead><tr><th>지표</th><th>원본</th><th>재작성</th><th>차이</th></tr></thead><tbody>'+c.rows.map(r=>'<tr><th>'+escape(r.label)+'</th><td>'+escape(r.before)+'</td><td>'+escape(r.after)+'</td><td>'+escape(r.delta===null?'비교 보류':(r.delta>0?'+':'')+r.delta+r.unit)+'</td></tr>').join('')+'</tbody></table><p>'+escape(c.caveat)+'</p>';}
function html(r){const s=r.summary_json;return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>'+escape(r.title)+'</title><style>body{font:16px/1.8 sans-serif;max-width:960px;margin:40px auto;padding:24px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}</style><h1>'+escape(r.title)+'</h1><p>집계 범위: '+escape(s.scope?.mode==='SELECTED'?'선택 '+s.scope.campaignIds.length+'개 캠페인':'전체 캠페인')+'</p>'+(s.parentJobId?'<p>재작성 원본 작업: '+escape(s.parentJobId)+'</p>':'')+'<p>상태: '+escape(s.status)+' · API 조회 시각: '+escape(s.sourceAsOf)+'</p><table>'+Object.entries(s.metrics).map(([k,v])=>'<tr><th>'+escape(({impressions:'노출',clicks:'클릭',cost:'광고비(원)',conversions:'전환',revenue:'전환매출(원)',ctr:'CTR(%)',cpc:'CPC(원)',cpa:'CPA(원)',roas:'ROAS(%)'})[k])+'</th><td>'+escape(v===null?null:Math.round(v*100)/100)+'</td></tr>').join('')+'</table>'+(s.change?'<h2>직전 7일 대비 변화</h2><p>'+escape(s.change.status)+' · '+escape(s.change.reason)+'</p>'+s.change.signals.map(x=>'<p>'+escape(x.label)+': '+escape(x.percent)+'%</p>').join(''):'')+revisionHtml(s.revisionComparison)+'<h2>확인할 사항</h2>'+s.caveats.map(c=>'<p>'+escape(c)+'</p>').join('')+'</html>';}
module.exports={points,summarize,collect,html};
