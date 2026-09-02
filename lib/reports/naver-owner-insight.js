'use strict';

const SNAPSHOT_VERSION='NAVER_WEEKLY_OWNER_V2';
const STANDARD_VERSION='HARIN-NAVER-ROAS-700-V1.0';
const FORMULA_VERSION='NAVER-OWNER-DECISION-V2';
const text=value=>String(value==null?'':value).trim();
const finite=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const rows=value=>Array.isArray(value)?value:[];
const priorityValue=value=>({URGENT:0,HIGH:1,MEDIUM:2,LOW:3}[text(value).toUpperCase()]??4);
const rounded=(value,digits=1)=>value==null?null:Number(Number(value).toFixed(digits));
const metric=(naver,key,fallback)=>naver.connected===true?finite(naver[key]??fallback):null;
const comparisonRate=(comparison,key)=>finite(comparison?.[key]?.change_rate);

function confidenceFor(naver={}){
  const raw=naver.confidence||{};
  const level=['HIGH','MEDIUM','LOW'].includes(text(raw.level).toUpperCase())?text(raw.level).toUpperCase():'CHECK_REQUIRED';
  const label=text(raw.label)||(level==='HIGH'?'높음':level==='MEDIUM'?'보통':level==='LOW'?'낮음':'확인 필요');
  const clicks=metric(naver,'clicks'),conversions=metric(naver,'purchase_count',naver.conversions);
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

function campaignDecision(campaign,targetRoas,canScale){
  const confidence=text(campaign?.confidence?.level).toUpperCase();
  const learning=text(campaign?.learning?.status).toUpperCase();
  const roas=finite(campaign?.roas??campaign?.metrics?.roasPercent);
  if(confidence==='LOW'||learning==='LIMITED'||roas==null||targetRoas==null)return '추가 관찰';
  if(roas<targetRoas)return '감액 검토';
  return canScale?'유지·확대 검토':'효율 유지·증액 보류';
}

function normalizeCampaign(campaign,targetRoas,index,canScale){
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
    decision:campaignDecision(campaign,targetRoas,canScale)
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

function decisionFor({connected,roas,targetRoas,confidence,comparisonSafe,coverageReady,financialReady}){
  if(!connected||roas==null||targetRoas==null||comparisonSafe===false||!coverageReady){
    return {label:'판단 보류',tone:'hold',priority:'HOLD',reason:'성과·수집·비교 근거가 완전해질 때까지 예산 판단을 보류합니다.',automaticWrite:false};
  }
  if(confidence.level==='LOW'||confidence.level==='CHECK_REQUIRED'){
    return {label:'추가 관찰',tone:'warning',priority:'MEDIUM',reason:'표본 신뢰도가 낮아 증액·감액보다 데이터 축적이 먼저입니다.',automaticWrite:false};
  }
  if(roas<targetRoas){
    return {label:'저효율 구간 축소 검토',tone:'danger',priority:'HIGH',reason:`Paid ROAS가 목표 ${targetRoas}%에 미달합니다. 객단가·CVR·CPC 중 실제 병목을 찾아 한 변수만 조정합니다.`,automaticWrite:false};
  }
  if(!financialReady){
    return {label:'효율 유지 · 증액 보류',tone:'warning',priority:'MEDIUM',reason:'Paid ROAS는 목표를 충족했지만 원가·비용·광고 귀속 근거가 부족해 증액은 보류합니다.',automaticWrite:false};
  }
  return {label:'효율 유지·확대 검토',tone:'good',priority:'MEDIUM',reason:`Paid ROAS가 목표 ${targetRoas}%를 충족했습니다. 이익·재고·배송 여력을 확인한 구간만 확대 후보로 봅니다.`,automaticWrite:false};
}

function stateFor(value,{minimum=null,maximum=null,required=true}={}){
  if(value==null)return required?'CHECK_REQUIRED':'NEUTRAL';
  if(minimum!=null&&value<minimum)return 'RISK';
  if(maximum!=null&&value>maximum)return 'RISK';
  return 'GOOD';
}

function leverSnapshot(naver,comparison,targetRoas){
  const aov=metric(naver,'average_order_value',naver.metrics?.averageOrderValue);
  const cvr=metric(naver,'cvr',naver.metrics?.cvrPercent);
  const cpc=metric(naver,'cpc',naver.metrics?.cpc);
  const targetMultiple=targetRoas==null?null:targetRoas/100;
  const allowedCpc=aov!=null&&cvr!=null&&targetMultiple>0?aov*(cvr/100)/targetMultiple:null;
  const requiredCvr=cpc!=null&&aov>0&&targetMultiple>0?cpc*targetMultiple/aov*100:null;
  const requiredAov=cpc!=null&&cvr>0&&targetMultiple>0?cpc*targetMultiple/(cvr/100):null;
  return [
    {
      id:'aov',label:'객단가 AOV',question:'한 번 주문할 때 얼마를 사나요?',value:aov,unit:'KRW',changeRate:comparisonRate(comparison,'naver_average_order_value'),
      target:rounded(requiredAov,0),targetLabel:'현재 CPC·CVR에서 목표 ROAS에 필요한 객단가',state:stateFor(aov,{minimum:requiredAov}),
      diagnosis:aov==null?'광고 전환매출과 구매 건수를 확인해야 합니다.':requiredAov!=null&&aov<requiredAov?'세트·묶음·추가구성으로 주문당 매출을 올릴 여지가 있습니다.':'현재 광고 조건에서 목표 객단가 범위를 충족합니다.',
      action:'가격을 바로 바꾸지 말고 세트 구성 하나만 7일 검증합니다.'
    },
    {
      id:'cvr',label:'구매 전환율 CVR',question:'클릭한 사람이 실제 구매하나요?',value:cvr,unit:'PERCENT',changeRate:comparisonRate(comparison,'naver_cvr'),
      target:rounded(requiredCvr,1),targetLabel:'현재 객단가·CPC에서 목표 ROAS에 필요한 CVR',state:stateFor(cvr,{minimum:requiredCvr}),
      diagnosis:cvr==null?'클릭과 구매 표본을 확인해야 합니다.':requiredCvr!=null&&cvr<requiredCvr?'상세페이지·옵션·가격·배송 약속에서 구매 전환이 막혔을 수 있습니다.':'현재 광고 조건에서 목표 전환율 범위를 충족합니다.',
      action:'상세페이지 첫 화면이나 구매조건 중 한 요소만 바꿔 7일 확인합니다.'
    },
    {
      id:'cpc',label:'클릭 비용 CPC',question:'한 번의 방문을 얼마에 사오나요?',value:cpc,unit:'KRW',changeRate:comparisonRate(comparison,'naver_cpc'),
      target:rounded(allowedCpc,0),targetLabel:'현재 객단가·CVR에서 감당 가능한 CPC',state:stateFor(cpc,{maximum:allowedCpc}),
      diagnosis:cpc==null?'광고비와 클릭 수를 확인해야 합니다.':allowedCpc!=null&&cpc>allowedCpc?'현재 객단가·전환율로 감당 가능한 클릭비보다 높습니다.':'현재 객단가·전환율에서 CPC가 허용 범위입니다.',
      action:'저효율 검색어·캠페인의 입찰 한 변수만 검토합니다.'
    }
  ];
}

function bottleneckSnapshot({naver,comparison,keywords,businessContext,financialReady,coverageReady,levers}){
  const impressions=metric(naver,'impressions');
  const clicks=metric(naver,'clicks');
  const ctr=metric(naver,'ctr',naver.metrics?.ctrPercent);
  const conversions=metric(naver,'purchase_count',naver.conversions);
  const aovLever=levers.find(item=>item.id==='aov');
  const cvrLever=levers.find(item=>item.id==='cvr');
  const cpcLever=levers.find(item=>item.id==='cpc');
  const returningRate=finite(businessContext?.store?.customers?.returningRate??businessContext?.store?.customers?.returning_rate);
  const repeatStatus=text(businessContext?.store?.customers?.status).toUpperCase();
  const keywordPeriod=keywords.period;
  const wasteCost=finite(keywords.waste_cost);
  return [
    {id:'exposure',step:'01',label:'노출',state:coverageReady&&impressions!=null?'GOOD':'CHECK_REQUIRED',value:impressions,unit:'COUNT',changeRate:comparisonRate(comparison,'naver_impressions'),question:'광고가 충분히 보였나요?',evidence:impressions==null?'노출 수 확인 필요':`노출 ${Math.round(impressions).toLocaleString('ko-KR')}회`,next:'기간 수집과 캠페인 노출 상태 확인'},
    {id:'click',step:'02',label:'클릭',state:clicks==null||ctr==null?'CHECK_REQUIRED':cpcLever.state==='RISK'?'RISK':'GOOD',value:ctr,unit:'PERCENT',changeRate:comparisonRate(comparison,'naver_ctr'),question:'보인 뒤 클릭으로 이어졌나요?',evidence:clicks==null?'클릭·CTR 확인 필요':`클릭 ${Math.round(clicks).toLocaleString('ko-KR')}회 · CTR ${rounded(ctr)}%`,next:'소재 매력과 CPC를 함께 확인'},
    {id:'intent',step:'03',label:'의도 품질',state:!keywordPeriod?'CHECK_REQUIRED':wasteCost>0?'RISK':'GOOD',value:wasteCost,unit:'KRW',question:'살 가능성이 있는 검색인가요?',evidence:!keywordPeriod?'키워드 수집 기간 확인 필요':`무전환 비용 ${Math.round(wasteCost||0).toLocaleString('ko-KR')}원`,next:'무전환 검색어의 표본 신뢰도 확인'},
    {id:'detail',step:'04',label:'상세 설득',state:cvrLever.state,value:cvrLever.value,unit:'PERCENT',question:'상품 상세가 구매를 설득했나요?',evidence:cvrLever.value==null?'CVR 확인 필요':`CVR ${rounded(cvrLever.value)}% · 필요 ${cvrLever.target==null?'확인 필요':`${rounded(cvrLever.target)}%`}`,next:'상세 첫 화면·옵션·배송 약속 중 한 변수 확인'},
    {id:'purchase',step:'05',label:'구매',state:conversions==null||aovLever.value==null?'CHECK_REQUIRED':aovLever.state,value:conversions,unit:'COUNT',question:'구매 수와 객단가가 충분한가요?',evidence:conversions==null?'구매 수 확인 필요':`구매 ${Math.round(conversions).toLocaleString('ko-KR')}건 · 객단가 ${aovLever.value==null?'확인 필요':`${Math.round(aovLever.value).toLocaleString('ko-KR')}원`}`,next:'구매 수와 주문당 매출을 분리 확인'},
    {id:'profit',step:'06',label:'이익',state:financialReady?'GOOD':'BLOCKED',value:financialReady?finite(businessContext?.profitability?.contributionProfit??businessContext?.profitability?.contribution_profit):null,unit:'KRW',question:'팔수록 실제 돈이 남나요?',evidence:financialReady?'원가·비용 신뢰 기준 통과':'원가·비용 근거 확인 필요',next:'정산·원가·수수료·배송비를 확인'},
    {id:'repeat',step:'07',label:'재구매',state:returningRate!=null&&['READY','COMPLETE'].includes(repeatStatus)?'GOOD':'CHECK_REQUIRED',value:returningRate,unit:'PERCENT',question:'한 번 산 고객이 다시 오나요?',evidence:returningRate==null?'재구매율 확인 필요':`재구매 고객 비율 ${rounded(returningRate)}%`,next:'재구매 코호트와 고객 수집 범위 확인'}
  ];
}

function economicsSnapshot(summary,naver,financialReady){
  const context=summary.business_context||{};
  const attributedRevenue=metric(naver,'revenue',naver.conversion_revenue);
  const adSpend=metric(naver,'ad_spend');
  const storeNetRevenue=finite(context.store?.netRevenue??context.store?.net_revenue);
  const settlementRevenue=finite(context.attribution?.settlementRevenue??context.attribution?.settlement_revenue);
  const explicitSettlementRoas=finite(context.attribution?.settlementRoas??context.attribution?.settlement_roas);
  const settlementRoas=explicitSettlementRoas??(settlementRevenue!=null&&adSpend>0?settlementRevenue/adSpend*100:null);
  const mer=storeNetRevenue!=null&&adSpend>0?storeNetRevenue/adSpend*100:null;
  const contributionProfit=financialReady?finite(context.profitability?.contributionProfit??context.profitability?.contribution_profit??summary.profitability?.contribution_profit):null;
  return [
    {id:'attributedRevenue',label:'광고 전환매출',value:attributedRevenue,unit:'KRW',state:attributedRevenue==null?'CHECK_REQUIRED':'CALCULATED',source:'네이버 검색광고 귀속',note:'광고가 기여했다고 집계한 매출'},
    {id:'storeNetRevenue',label:'스토어 순매출',value:storeNetRevenue,unit:'KRW',state:storeNetRevenue==null?'CHECK_REQUIRED':'CALCULATED',source:'Cafe24 스토어 전체',note:'광고 전환매출과 직접 합산하지 않음'},
    {id:'settlementRoas',label:'정산 대조 ROAS',value:settlementRoas,unit:'PERCENT',state:settlementRoas==null?'CHECK_REQUIRED':'CALCULATED',source:'주문·정산 연결',note:'광고 주문과 실제 지급액 대조'},
    {id:'mer',label:'MER',value:mer,unit:'PERCENT',state:mer==null?'CHECK_REQUIRED':'CALCULATED',source:'전체 순매출 ÷ 네이버 광고비',note:'스토어 전체 광고 효율 참고값'},
    {id:'contributionProfit',label:'공헌이익',value:contributionProfit,unit:'KRW',state:contributionProfit==null?'BLOCKED':'CALCULATED',source:'원가·수수료·배송비 반영',note:contributionProfit==null?'재무 신뢰 기준 통과 전 표시 보류':'확인된 비용을 차감한 운영 이익'}
  ];
}

function verificationSnapshot(summary,coverage,comparisonSafe,financialReady){
  const context=summary.business_context||{};
  const orderLink=text(context.attribution?.orderLinkStatus??context.attribution?.order_link_status).toUpperCase();
  const inventory=text(context.inventory?.status).toUpperCase();
  const platformEvents=rows(summary.platform_events);
  const confidence=confidenceFor(summary.naver||{});
  return [
    {id:'periodCoverage',label:'7일 수집 범위',state:coverage.status,evidence:coverage.label,action:coverage.status==='READY'?'같은 기간 비교 가능':'누락 일자와 API 수집 상태 확인'},
    {id:'purchaseConversion',label:'구매 전환 표본',state:confidence.level==='HIGH'?'READY':'CHECK_REQUIRED',evidence:confidence.reason,action:'클릭·구매 표본을 함께 확인'},
    {id:'orderAttribution',label:'광고 주문 ↔ 실제 주문',state:['READY','COMPLETE','MATCHED'].includes(orderLink)?'READY':'CHECK_REQUIRED',evidence:['READY','COMPLETE','MATCHED'].includes(orderLink)?'주문 귀속 대조 완료':'주문 귀속 대조 근거 확인 필요',action:'광고 전환매출과 실제 주문을 같은 주문키로 대조'},
    {id:'financialCost',label:'원가·비용 신뢰도',state:financialReady?'READY':'BLOCKED',evidence:financialReady?'재무 신뢰 기준 통과':'이익 판단 차단',action:'미입력 원가·수수료·배송비 확인'},
    {id:'brandSeparation',label:'브랜드·일반 캠페인 분리',state:rows(summary.naver?.top_campaigns).length?'READY':'CHECK_REQUIRED',evidence:rows(summary.naver?.top_campaigns).length?'캠페인별 별도 표시':'캠페인 분류 확인 필요',action:'브랜드 수요와 신규 수요를 섞지 않음'},
    {id:'inventory',label:'재고·배송 여력',state:['READY','COMPLETE'].includes(inventory)?'READY':'CHECK_REQUIRED',evidence:['READY','COMPLETE'].includes(inventory)?'판매 여력 확인':'증액 전 재고·배송 여력 확인 필요',action:'확대 후보 상품의 품절·출고 지연 위험 확인'},
    {id:'comparison',label:'운영 변경 이벤트',state:comparisonSafe?'READY':'CHECK_REQUIRED',evidence:comparisonSafe?(platformEvents.length?`${platformEvents.length}개 이벤트 반영`:'비교 방해 이벤트 없음'):'단순 전기 비교 주의',action:'가격·프로모션·추적 변경을 함께 해석'}
  ];
}

function enrichAction(item,index){
  const area=text(item.area).toUpperCase();
  const defaults=area.includes('KEYWORD')
    ?{successMetric:'7일 무전환 비용 감소와 구매 수 유지',ownerQuestion:'이 검색어가 실제 우리 상품을 찾는 의도인가?',risk:'표본 부족 상태에서 중단하면 유효 수요를 잃을 수 있음'}
    :area.includes('NAVER')
      ?{successMetric:'7일 Paid ROAS 개선과 전환매출 유지',ownerQuestion:'비용을 줄여도 실제 주문이 유지되는가?',risk:'ROAS만 보고 줄이면 매출 규모가 함께 감소할 수 있음'}
      :{successMetric:text(item.expected)||'7일 뒤 같은 지표의 개선 여부',ownerQuestion:'이번 행동이 어느 병목 하나를 해결하는가?',risk:'여러 변수를 동시에 바꾸면 원인을 판단할 수 없음'};
  return {
    id:text(item.id)||`action-${index+1}`,priority:text(item.priority).toUpperCase()||'MEDIUM',area:text(item.area)||'NAVER',
    title:text(item.title)||'검토 항목 확인',reason:text(item.reason||item.body)||'저장 보고서 근거를 확인하세요.',
    expected:text(item.expected)||'변경 전 영향 범위 확인',successMetric:text(item.successMetric)||defaults.successMetric,
    reviewWindow:text(item.reviewWindow)||'7일 1차 확인 · 표본 부족 시 연장',ownerQuestion:text(item.ownerQuestion)||defaults.ownerQuestion,
    risk:text(item.risk)||defaults.risk
  };
}

function buildNaverOwnerInsight(summary={}){
  const naver=summary.naver||{};
  const comparison=summary.comparison||{};
  const keywords=summary.keywords||{};
  const thresholds=summary.operating_rule?.thresholds||{};
  const targetRoas=finite(thresholds.target_roas_percent);
  const roas=metric(naver,'roas',naver.metrics?.roasPercent);
  const comparisonSafe=summary.comparison_guard?.safe!==false;
  const confidence=confidenceFor(naver);
  const coverage=coverageFor(summary);
  const financialReady=text(summary.financial_trust?.status).toUpperCase()==='READY';
  const decision=decisionFor({connected:naver.connected===true,roas,targetRoas,confidence,comparisonSafe,coverageReady:coverage.status==='READY',financialReady});
  const findings=rows(summary.insights).map((item,index)=>({
    id:`finding-${index+1}`,level:text(item.level).toLowerCase()||'info',area:text(item.area)||'NAVER',
    title:text(item.title)||'진단 근거 확인 필요',body:text(item.body||item.reason)||'상세 근거 확인 필요'
  }));
  const strengths=findings.filter(item=>item.level==='good').slice(0,4);
  const risks=findings.filter(item=>['warning','danger'].includes(item.level)).slice(0,5);
  const recommendations=rows(summary.recommendations).map(enrichAction).sort((left,right)=>priorityValue(left.priority)-priorityValue(right.priority));
  const campaigns=rows(naver.top_campaigns).slice(0,8).map((item,index)=>normalizeCampaign(item,targetRoas,index,financialReady));
  const waste=rows(keywords.waste).slice(0,8).map((item,index)=>normalizeKeyword(item,index,'waste'));
  const growth=rows(keywords.growth).slice(0,8).map((item,index)=>normalizeKeyword(item,index,'growth'));
  const levers=leverSnapshot(naver,comparison,targetRoas);
  const bottleneck=bottleneckSnapshot({naver,comparison,keywords,businessContext:summary.business_context||{},financialReady,coverageReady:coverage.status==='READY',levers});
  const economics=economicsSnapshot(summary,naver,financialReady);
  const verification=verificationSnapshot(summary,coverage,comparisonSafe,financialReady);
  const topRisk=risks[0]||null,topStrength=strengths[0]||null;
  const headline=topRisk?.title||topStrength?.title||(naver.connected?'네이버 주간 성과를 확인했습니다.':'네이버 주간 성과 수집을 확인해야 합니다.');
  const caveats=[];
  if(!comparisonSafe)caveats.push(text(summary.comparison_guard?.message)||'비교 기간에 운영 변경이 있어 단순 전기 비교를 보류합니다.');
  if(coverage.status!=='READY')caveats.push('네이버 광고 수집 기간이 완전하지 않아 증감 해석에 주의가 필요합니다.');
  if(confidence.level==='LOW'||confidence.level==='CHECK_REQUIRED')caveats.push('표본 신뢰도가 낮아 예산 증액·중단을 확정하지 않습니다.');
  if(!financialReady)caveats.push('원가·수수료·배송비 근거가 부족해 이익과 증액 판단을 보류합니다.');
  caveats.push('네이버 광고 전환매출은 채널 전체 매출이나 실제 이익과 동일하지 않습니다.');
  caveats.push('누락 수치는 0원으로 대체하지 않고 확인 필요로 남깁니다.');

  return {
    snapshotVersion:SNAPSHOT_VERSION,
    headline,decision,confidence,
    scorecard:[
      {id:'adSpend',label:'광고비',value:metric(naver,'ad_spend'),unit:'KRW',changeRate:comparisonRate(comparison,'naver_spend')},
      {id:'attributedRevenue',label:'광고 전환매출',value:metric(naver,'revenue',naver.conversion_revenue),unit:'KRW',changeRate:comparisonRate(comparison,'naver_revenue')},
      {id:'paidRoas',label:'Paid ROAS',value:roas,unit:'PERCENT',target:targetRoas,changeRate:comparisonRate(comparison,'naver_roas')},
      {id:'clicks',label:'클릭',value:metric(naver,'clicks'),unit:'COUNT',changeRate:comparisonRate(comparison,'naver_clicks')},
      {id:'conversions',label:'구매',value:metric(naver,'purchase_count',naver.conversions),unit:'COUNT'},
      {id:'cpa',label:'구매당 광고비',value:metric(naver,'cpa',naver.metrics?.cpa),unit:'KRW',changeRate:comparisonRate(comparison,'naver_cpa')}
    ],
    levers,bottleneck,economics,verification,
    diagnosis:{strengths,risks,opportunities:recommendations.slice(0,4)},
    campaigns,
    keywords:{period:keywords.period||null,wasteCost:finite(keywords.waste_cost),waste,growth},
    actions:{
      now:recommendations.slice(0,3),
      sevenDays:recommendations.slice(0,3).map(item=>({...item,review:`${item.reviewWindow} · ${item.successMetric} 확인`})),
      guardrail:'광고 예산·입찰·상품을 자동 변경하지 않고 사장님 확인 후 한 변수씩 실행합니다.'
    },
    evidence:{
      source:'NAVER_SEARCH_AD_API',standardVersion:STANDARD_VERSION,formulaVersion:FORMULA_VERSION,calculationOwner:'SERVER',automaticWrite:false,
      period:summary.period||null,generatedAt:summary.generated_at||null,comparisonSafe,coverageStatus:coverage.status,coverageLabel:coverage.label,
      actualDays:coverage.actualDays,expectedDays:coverage.expectedDays,ruleSource:text(summary.operating_rule?.source)||'DEFAULT_FALLBACK',
      ruleVersions:summary.operating_rule?.versions||{},targetRoas,keywordPeriod:keywords.period||null
    },
    caveats
  };
}

module.exports={SNAPSHOT_VERSION,STANDARD_VERSION,FORMULA_VERSION,buildNaverOwnerInsight};
