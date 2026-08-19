'use strict';

const PLATFORM_LABELS=Object.freeze({all:'전체',naver:'네이버',coupang:'쿠팡',cafe24:'Cafe24'});
const SEVERITY_WEIGHT=Object.freeze({ERROR:4,DANGER:4,WARNING:3,WARN:3,INFO:1});

const finite=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const platformKey=value=>String(value||'ALL').toUpperCase();

function reportTime(report={}){
  return new Date(report.period_end||report.created_at||report.updated_at||0).getTime()||0;
}

function reportsForPlatform(reports=[],platform='all'){
  const target=platform==='all'?'ALL':String(platform).toUpperCase();
  return reports
    .filter(report=>platformKey(report.platform)===target&&report.summary_json)
    .sort((left,right)=>reportTime(right)-reportTime(left));
}

function metricDefinitions(platform='all'){
  if(platform==='naver')return [
    ['광고 전환매출','money',summary=>finite(summary.naver?.revenue??summary.naver?.conversion_revenue)],
    ['Paid ROAS','percent',summary=>finite(summary.naver?.roas??summary.profitability?.paid_roas)],
    ['광고비','money',summary=>finite(summary.naver?.ad_spend??summary.naver?.spend??summary.naver?.cost)]
  ];
  if(platform==='coupang')return [
    ['쿠팡 매출','money',summary=>finite(summary.coupang?.gross_sales??summary.coupang?.revenue)],
    ['광고 ROAS','percent',summary=>finite(summary.coupang?.ad_roas??summary.coupang?.roas)],
    ['광고비','money',summary=>finite(summary.coupang?.ad_spend)]
  ];
  if(platform==='cafe24')return [
    ['Cafe24 매출','money',summary=>finite(summary.cafe24?.revenue??summary.cafe24?.net_revenue)],
    ['주문','count',summary=>finite(summary.cafe24?.orders)],
    ['구매 전환율','percent',summary=>finite(summary.cafe24?.conversion_rate)]
  ];
  return [
    ['통합 순매출','money',summary=>finite(summary.profitability?.net_sales)],
    ['Paid ROAS','percent',summary=>finite(summary.profitability?.paid_roas)],
    ['공헌이익','money',summary=>finite(summary.profitability?.contribution_profit)]
  ];
}

function changeRate(current,previous){
  if(current==null||previous==null||previous===0)return null;
  return (current-previous)/Math.abs(previous)*100;
}

function metricRows(currentReport,previousReport,platform){
  const current=currentReport?.summary_json||{};
  const previous=previousReport?.summary_json||{};
  return metricDefinitions(platform).map(([label,type,read])=>{
    const value=read(current),baseline=read(previous),change_rate=changeRate(value,baseline);
    return {
      label,type,value,previous:baseline,change_rate,
      status:value==null?'NO_DATA':baseline==null?'NO_BASELINE':'READY'
    };
  });
}

function actionHref(area='',platform='all'){
  const key=String(area||'').toUpperCase();
  if(key.includes('KEYWORD')||key.includes('ADS')){
    const target=key.includes('COUPANG')||platform==='coupang'?'coupang':'naver';
    return `/keywords/diagnosis?platform=${target}`;
  }
  if(key.includes('PROFIT')||key.includes('COST'))return '/insights/profitability';
  if(key.includes('DATA')||key.includes('COLLECTION'))return '/data-collection';
  if(['NAVER','CAFE24','COUPANG'].includes(key))return `/insights/channels?platform=${key.toLowerCase()}`;
  return platform==='all'?'/insights/causes':`/insights/causes?platform=${platform}`;
}

function normalizeAction(item={},index=0,platform='all'){
  const priority=String(item.priority||item.level||'MEDIUM').toUpperCase();
  return {
    id:String(item.id||`${item.area||item.platform||'ACTION'}-${index}`),
    rank:index+1,
    priority:['ERROR','DANGER','HIGH'].includes(priority)?'HIGH':priority==='LOW'||priority==='INFO'?'LOW':'MEDIUM',
    area:String(item.area||item.platform||'INSIGHT').toUpperCase(),
    title:String(item.title||item.recommendation||'선택한 변화의 원인을 확인해 주세요.'),
    reason:String(item.reason||item.body||item.message||'저장 보고서의 근거를 확인해야 합니다.'),
    expected:String(item.expected||item.recommended_action||''),
    href:actionHref(item.area||item.platform,platform)
  };
}

function alertActions(alerts=[],platform='all'){
  return alerts
    .filter(item=>item.status!=='RESOLVED'&&(platform==='all'||platformKey(item.platform)===platform.toUpperCase()))
    .sort((left,right)=>(SEVERITY_WEIGHT[platformKey(right.severity)]||0)-(SEVERITY_WEIGHT[platformKey(left.severity)]||0))
    .map((item,index)=>normalizeAction({...item,area:item.platform},index,platform));
}

function dataTrust(dataHealth={},platform='all'){
  const channels=(dataHealth.channels||[]).filter(item=>platform==='all'||platformKey(item.platform)===platform.toUpperCase());
  if(!channels.length)return {status:'WAITING',label:'수집 상태 확인 필요',channels:[]};
  const needsCheck=channels.filter(item=>!['READY'].includes(platformKey(item.status)));
  return {
    status:needsCheck.length?'CHECK_REQUIRED':'READY',
    label:needsCheck.length?`${needsCheck.map(item=>PLATFORM_LABELS[String(item.platform||'').toLowerCase()]||item.platform).join('·')} 자료 확인 필요`:'최신 수집 자료 사용',
    channels:channels.map(item=>({
      platform:item.platform,
      status:item.status,
      data_mode:item.dataMode,
      last_success_at:item.lastSuccessAt||null
    }))
  };
}

function headline(metrics=[]){
  const changed=metrics.filter(item=>item.change_rate!=null).sort((left,right)=>Math.abs(right.change_rate)-Math.abs(left.change_rate))[0];
  if(changed)return {
    status:changed.change_rate<0?'RISK':'GROWTH',
    title:`${changed.label}이 직전 비교보다 ${Math.abs(changed.change_rate).toFixed(1)}% ${changed.change_rate<0?'줄었어요':'늘었어요'}`,
    metric:changed.label
  };
  const current=metrics.find(item=>item.value!=null);
  if(current)return {status:'NO_BASELINE',title:`${current.label}은 확인됐지만 비교 기준이 부족해요`,metric:current.label};
  return {status:'NO_DATA',title:'비교할 통합 보고서가 아직 없어요',metric:null};
}

function buildInsightDecisionWorkbench({reports=[],alerts=[],dataHealth={},platform='all',generatedAt=new Date()}={}){
  const normalizedPlatform=['all','naver','coupang','cafe24'].includes(String(platform).toLowerCase())?String(platform).toLowerCase():'all';
  const scoped=reportsForPlatform(reports,normalizedPlatform);
  const current=scoped[0]||null,previous=scoped[1]||null;
  const metrics=metricRows(current,previous,normalizedPlatform);
  const storedActions=current?.summary_json?.executive?.today_actions||current?.summary_json?.recommendations||[];
  const actions=(storedActions.length?storedActions.map((item,index)=>normalizeAction(item,index,normalizedPlatform)):alertActions(alerts,normalizedPlatform)).slice(0,3).map((item,index)=>({...item,rank:index+1}));
  const trust=dataTrust(dataHealth,normalizedPlatform);
  const caveats=[];
  if(!current)caveats.push(normalizedPlatform==='all'?'통합 보고서가 없어 채널별 보고서를 임의로 합치지 않았습니다.':'선택 채널의 저장 보고서가 없습니다.');
  if(current&&!previous)caveats.push('같은 범위의 이전 보고서가 없어 증감률은 판단 보류입니다.');
  if(current?.summary_json?.comparison_guard?.safe===false)caveats.push(current.summary_json.comparison_guard.message||'비교 기간에 운영 변경이 있어 단순 증감 해석에 주의가 필요합니다.');
  if(trust.status!=='READY')caveats.push('수집 상태가 완전하지 않아 이전 성공 자료가 포함될 수 있습니다.');
  return {
    platform:normalizedPlatform,
    platform_label:PLATFORM_LABELS[normalizedPlatform],
    current_report:current?{id:current.id,title:current.title,period_start:current.period_start,period_end:current.period_end,created_at:current.created_at}:null,
    previous_report:previous?{id:previous.id,title:previous.title,period_start:previous.period_start,period_end:previous.period_end,created_at:previous.created_at}:null,
    headline:headline(metrics),
    metrics,
    actions,
    trust,
    caveats,
    as_of:new Date(generatedAt).toISOString()
  };
}

module.exports={reportsForPlatform,metricRows,actionHref,buildInsightDecisionWorkbench};
