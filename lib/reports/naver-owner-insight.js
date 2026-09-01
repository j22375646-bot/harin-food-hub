'use strict';

const text=value=>String(value==null?'':value).trim();
const finite=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const rows=value=>Array.isArray(value)?value:[];
const priorityValue=value=>({URGENT:0,HIGH:1,MEDIUM:2,LOW:3}[text(value).toUpperCase()]??4);

function confidenceFor(naver={}){
  const raw=naver.confidence||{};
  const level=['HIGH','MEDIUM','LOW'].includes(text(raw.level).toUpperCase())?text(raw.level).toUpperCase():'CHECK_REQUIRED';
  const label=text(raw.label)||(level==='HIGH'?'높음':level==='MEDIUM'?'보통':level==='LOW'?'낮음':'확인 필요');
  const clicks=finite(naver.clicks),conversions=finite(naver.purchase_count??naver.conversions);
  const reason=clicks==null||conversions==null
    ?'클릭·구매 표본을 모두 확인해야 합니다.'
    :`클릭 ${Math.round(clicks).toLocaleString('ko-KR')}회 · 구매 ${Math.round(conversions).toLocaleString('ko-KR')}건 표본`;
  return {level,label,reason};
}

function coverageFor(summary={}){
  const coverage=summary.data_coverage?.naver_ads||summary.data_coverage?.naver||summary.data_coverage?.ads||{};
  const raw=text(typeof coverage==='string'?coverage:coverage.status).toUpperCase();
  const ready=['OK','READY','COMPLETE'].includes(raw);
  return {
    status:ready?'READY':'CHECK_REQUIRED',
    label:ready?'기간 수집 완료':'수집 범위 확인 필요',
    actualDays:finite(coverage.actual_days),
    expectedDays:finite(coverage.expected_days)
  };
}

function campaignDecision(campaign,targetRoas){
  const confidence=text(campaign?.confidence?.level).toUpperCase();
  const learning=text(campaign?.learning?.status).toUpperCase();
  const roas=finite(campaign?.roas??campaign?.metrics?.roasPercent);
  if(confidence==='LOW'||learning==='LIMITED'||roas==null||targetRoas==null)return '추가 관찰';
  return roas<targetRoas?'감액 검토':'유지·확대 검토';
}

function normalizeCampaign(campaign,targetRoas,index){
  return {
    id:text(campaign.id||campaign.ncc_campaign_id)||`campaign-${index+1}`,
    name:text(campaign.name)||'캠페인명 확인 필요',
    category:text(campaign.category||campaign.type)||'유형 확인 필요',
    adSpend:finite(campaign.cost??campaign.ad_spend),
    attributedRevenue:finite(campaign.revenue??campaign.conversion_revenue),
    conversions:finite(campaign.conversions??campaign.purchase_count),
    paidRoas:finite(campaign.roas??campaign.metrics?.roasPercent),
    confidence:text(campaign.confidence?.label)||'표본 확인 필요',
    learningState:text(campaign.learning?.status)||null,
    decision:campaignDecision(campaign,targetRoas)
  };
}

function normalizeKeyword(item,index,type){
  return {
    id:text(item.ncc_keyword_id||item.id)||`${type}-${index+1}`,
    keyword:text(item.keyword)==='-'?'자동 확장·무키워드':text(item.keyword)||'키워드 확인 필요',
    adSpend:finite(item.cost??item.ad_spend),
    attributedRevenue:finite(item.conversion_revenue??item.revenue),
    conversions:finite(item.conversions??item.purchase_count),
    paidRoas:finite(item.roas),
    confidence:text(item.confidence?.label)||'표본 확인 필요'
  };
}

function decisionFor({connected,roas,targetRoas,confidence,comparisonSafe}){
  if(!connected||roas==null||targetRoas==null||comparisonSafe===false){
    return {label:'판단 보류',tone:'hold',priority:'HOLD',reason:'성과·비교 근거가 완전해질 때까지 예산 판단을 보류합니다.',automaticWrite:false};
  }
  if(confidence.level==='LOW'||confidence.level==='CHECK_REQUIRED'){
    return {label:'추가 관찰',tone:'warning',priority:'MEDIUM',reason:'표본 신뢰도가 낮아 증액·감액보다 데이터 축적이 먼저입니다.',automaticWrite:false};
  }
  if(roas<targetRoas){
    return {label:'저효율 구간 축소 검토',tone:'danger',priority:'HIGH',reason:`Paid ROAS가 목표 ${targetRoas}%에 미달해 저효율 캠페인과 키워드를 먼저 점검합니다.`,automaticWrite:false};
  }
  return {label:'효율 유지·확대 검토',tone:'good',priority:'MEDIUM',reason:`Paid ROAS가 목표 ${targetRoas}%를 충족해 검증된 구간의 유지·확대를 검토할 수 있습니다.`,automaticWrite:false};
}

function buildNaverOwnerInsight(summary={}){
  const naver=summary.naver||{};
  const comparison=summary.comparison||{};
  const keywords=summary.keywords||{};
  const thresholds=summary.operating_rule?.thresholds||{};
  const targetRoas=finite(thresholds.target_roas_percent);
  const roas=finite(naver.roas??naver.metrics?.roasPercent);
  const comparisonSafe=summary.comparison_guard?.safe!==false;
  const confidence=confidenceFor(naver);
  const coverage=coverageFor(summary);
  const decision=decisionFor({connected:naver.connected===true,roas,targetRoas,confidence,comparisonSafe});
  const findings=rows(summary.insights).map((item,index)=>({
    id:`finding-${index+1}`,level:text(item.level).toLowerCase()||'info',area:text(item.area)||'NAVER',
    title:text(item.title)||'진단 근거 확인 필요',body:text(item.body||item.reason)||'상세 근거 확인 필요'
  }));
  const strengths=findings.filter(item=>item.level==='good').slice(0,4);
  const risks=findings.filter(item=>['warning','danger'].includes(item.level)).slice(0,5);
  const recommendations=rows(summary.recommendations)
    .map((item,index)=>({
      id:`action-${index+1}`,priority:text(item.priority).toUpperCase()||'MEDIUM',area:text(item.area)||'NAVER',
      title:text(item.title)||'검토 항목 확인',reason:text(item.reason||item.body)||'저장 보고서 근거를 확인하세요.',
      expected:text(item.expected)||'변경 전 영향 범위 확인'
    }))
    .sort((left,right)=>priorityValue(left.priority)-priorityValue(right.priority));
  const campaigns=rows(naver.top_campaigns).slice(0,8).map((item,index)=>normalizeCampaign(item,targetRoas,index));
  const waste=rows(keywords.waste).slice(0,8).map((item,index)=>normalizeKeyword(item,index,'waste'));
  const growth=rows(keywords.growth).slice(0,8).map((item,index)=>normalizeKeyword(item,index,'growth'));
  const topRisk=risks[0]||null,topStrength=strengths[0]||null;
  const headline=topRisk?.title||topStrength?.title||(naver.connected?'네이버 주간 성과를 확인했습니다.':'네이버 주간 성과 수집을 확인해야 합니다.');
  const caveats=[];
  if(!comparisonSafe)caveats.push(text(summary.comparison_guard?.message)||'비교 기간에 운영 변경이 있어 단순 전기 비교를 보류합니다.');
  if(coverage.status!=='READY')caveats.push('네이버 광고 수집 기간이 완전하지 않아 증감 해석에 주의가 필요합니다.');
  if(confidence.level==='LOW'||confidence.level==='CHECK_REQUIRED')caveats.push('표본 신뢰도가 낮아 예산 증액·중단을 확정하지 않습니다.');
  caveats.push('네이버 광고 전환매출은 채널 전체 매출이나 실제 이익과 동일하지 않습니다.');
  caveats.push('누락 수치는 0원으로 대체하지 않고 확인 필요로 남깁니다.');

  return {
    snapshotVersion:'NAVER_WEEKLY_OWNER_V1',
    headline,
    decision,
    confidence,
    scorecard:[
      {id:'adSpend',label:'광고비',value:finite(naver.ad_spend),unit:'KRW',changeRate:finite(comparison.naver_spend?.change_rate)},
      {id:'attributedRevenue',label:'광고 전환매출',value:finite(naver.revenue??naver.conversion_revenue),unit:'KRW',changeRate:finite(comparison.naver_revenue?.change_rate)},
      {id:'paidRoas',label:'Paid ROAS',value:roas,unit:'PERCENT',target:targetRoas,changeRate:finite(comparison.naver_roas?.change_rate)},
      {id:'clicks',label:'클릭',value:finite(naver.clicks),unit:'COUNT'},
      {id:'conversions',label:'구매',value:finite(naver.purchase_count??naver.conversions),unit:'COUNT'},
      {id:'cpa',label:'구매당 광고비',value:finite(naver.cpa??naver.metrics?.cpa),unit:'KRW',changeRate:finite(comparison.naver_cpa?.change_rate)}
    ],
    diagnosis:{strengths,risks,opportunities:recommendations.slice(0,4)},
    campaigns,
    keywords:{period:keywords.period||null,wasteCost:finite(keywords.waste_cost),waste,growth},
    actions:{
      now:recommendations.slice(0,3),
      sevenDays:recommendations.slice(0,3).map(item=>({...item,review:`7일 뒤 ${item.expected} 여부를 같은 지표로 다시 확인`})),
      guardrail:'광고 예산·입찰·상품을 자동 변경하지 않고 사장님 확인 후 실행합니다.'
    },
    evidence:{
      source:'NAVER_SEARCH_AD_API',period:summary.period||null,generatedAt:summary.generated_at||null,
      comparisonSafe,coverageStatus:coverage.status,coverageLabel:coverage.label,actualDays:coverage.actualDays,expectedDays:coverage.expectedDays,
      ruleSource:text(summary.operating_rule?.source)||'DEFAULT_FALLBACK',ruleVersions:summary.operating_rule?.versions||{},targetRoas,
      keywordPeriod:keywords.period||null
    },
    caveats
  };
}

module.exports={buildNaverOwnerInsight};

