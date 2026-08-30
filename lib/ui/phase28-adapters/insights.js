'use strict';

const CHANNELS=Object.freeze([
  Object.freeze({platform:'NAVER',id:'naver',name:'네이버',source:'주문·검색광고·원가'}),
  Object.freeze({platform:'COUPANG',id:'coupang',name:'쿠팡',source:'주문·정산·광고'}),
  Object.freeze({platform:'CAFE24',id:'cafe24',name:'Cafe24',source:'주문·회원·PG'})
]);

const text=value=>String(value==null?'':value).trim();
const finite=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const frozenRows=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));
const reportTime=report=>new Date(report.period_end||report.created_at||0).getTime()||0;

function channelSummary(report,channel){
  const summary=report?.summary_json||{};
  return summary[channel.id]||summary[channel.platform]||{};
}

function channelRevenue(report,channel){
  const summary=channelSummary(report,channel);
  if(channel.platform==='NAVER')return finite(summary.revenue??summary.conversion_revenue);
  if(channel.platform==='COUPANG')return finite(summary.gross_sales??summary.revenue);
  return finite(summary.revenue??summary.net_revenue);
}

function channelProfit(report,channel){
  const summary=channelSummary(report,channel);
  const scoped=report?.summary_json?.channel_profitability?.[channel.platform]||report?.summary_json?.channel_profitability?.[channel.id]||{};
  return finite(summary.contribution_profit??scoped.contribution_profit);
}

function changeRate(current,previous){
  if(current==null||previous==null||previous===0)return null;
  return Math.round(((current-previous)/Math.abs(previous))*1000)/10;
}

function firstText(rows=[],keys=[]){
  for(const row of Array.isArray(rows)?rows:[]){
    for(const key of keys){
      const value=text(row?.[key]);
      if(value)return value;
    }
  }
  return '';
}

function causeFor(report){
  const summary=report?.summary_json||{};
  return firstText(summary.insights,['title','body'])
    ||firstText(summary.executive?.problems,['title','body'])
    ||firstText(summary.executive?.doing_well,['title','body'])
    ||'원인 판단 보류';
}

function causeNoteFor(report){
  const summary=report?.summary_json||{};
  return firstText(summary.insights,['body','reason'])||'저장 보고서의 채널 근거를 확인하세요.';
}

function actionFor(report){
  const summary=report?.summary_json||{};
  return firstText(summary.executive?.today_actions,['title','recommendation'])
    ||firstText(summary.recommendations,['title','recommendation'])
    ||'다음 행동 확인 필요';
}

function actionNoteFor(report){
  const summary=report?.summary_json||{};
  return firstText(summary.executive?.today_actions,['reason','expected','body'])
    ||firstText(summary.recommendations,['reason','expected','body'])
    ||'자동 변경 없이 근거를 먼저 검토합니다.';
}

function scopedReports(reports,platform){
  return (reports||[])
    .filter(report=>text(report.platform).toUpperCase()===platform&&text(report.report_type).toUpperCase()==='WEEKLY'&&report.summary_json)
    .sort((left,right)=>reportTime(right)-reportTime(left));
}

function trustFor(dataHealth,channel){
  const row=(dataHealth?.channels||[]).find(item=>text(item.platform).toUpperCase()===channel.platform);
  const ready=text(row?.status).toUpperCase()==='READY';
  return Object.freeze({
    status:ready?'READY':'CHECK_REQUIRED',
    label:ready?'최신 수집 근거':'수집 상태 확인 필요',
    lastSuccessAt:row?.lastSuccessAt||row?.last_success_at||null,
    dataMode:row?.dataMode||row?.data_mode||null
  });
}

function reportHeader(report,channel,change=null){
  return Object.freeze({
    id:text(report.id),platform:channel.platform,title:text(report.title)||`${channel.name} 주간 인사이트`,
    periodStart:report.period_start||null,periodEnd:report.period_end||null,createdAt:report.created_at||null,
    status:text(report.status||'FINAL').toUpperCase(),changeRate:change
  });
}

function buildChannel(channel,reports,dataHealth){
  const rows=scopedReports(reports,channel.platform);
  const current=rows[0]||null,previous=rows[1]||null;
  const revenue=channelRevenue(current,channel),previousRevenue=channelRevenue(previous,channel);
  const rate=changeRate(revenue,previousRevenue),profit=channelProfit(current,channel);
  const trust=trustFor(dataHealth,channel);
  const changeTitle=rate==null?(revenue==null?'매출 근거 확인 필요':'비교 기준 부족'):`매출 ${rate>0?'+':''}${rate.toFixed(1)}%`;
  const cause=current?causeFor(current):'저장 보고서 없음';
  const action=current?actionFor(current):'주간 보고서 생성 상태 확인';
  const insightRows=Array.isArray(current?.summary_json?.insights)?current.summary_json.insights:[];
  const signals=current?insightRows.slice(0,3).map((item,index)=>({
    id:`${channel.id}-${index}`,title:text(item.title)||text(item.body)||'근거 확인 필요',
    note:text(item.body)||text(item.reason)||'저장 보고서 근거',tone:text(item.level||'info').toLowerCase()
  })):[];
  if(!signals.length)signals.push({id:`${channel.id}-missing`,title:'비교할 주간 인사이트가 아직 없어요.',note:'자동 생성 상태와 채널 수집 근거를 확인하세요.',tone:'hold'});
  return Object.freeze({
    id:channel.id,platform:channel.platform,name:channel.name,source:channel.source,
    currentReportId:current?.id||null,reportCount:rows.length,revenue,previousRevenue,changeRate:rate,
    orders:finite(channelSummary(current,channel).orders),profit,profitState:profit==null?'CHECK_REQUIRED':'CALCULATED',
    cause,causeNote:current?causeNoteFor(current):'같은 채널 보고서가 생성되기 전에는 원인을 추정하지 않습니다.',
    action,actionNote:current?actionNoteFor(current):'누락값을 0으로 처리하지 않습니다.',trust,
    currentPeriod:current?Object.freeze({start:current.period_start||null,end:current.period_end||null,createdAt:current.created_at||null}):null,
    stages:frozenRows([
      {id:'change',label:'변화',value:changeTitle,note:rate==null?'같은 채널 이전 주와 비교 필요':`지난주 매출과 같은 채널 기준 비교`},
      {id:'cause',label:'원인',value:cause,note:current?causeNoteFor(current):'보고서 생성 필요'},
      {id:'profit',label:'이익',value:profit==null?'판단 보류':profit,note:profit==null?'채널 단위 원가·비용 근거 확인 필요':'채널 단위 공헌이익 계산'},
      {id:'action',label:'행동',value:action,note:'자동 적용하지 않음'}
    ]),
    signals:frozenRows(signals)
  });
}

function normalizeInsightReportDetail(report={}){
  const platform=text(report.platform).toUpperCase();
  const channel=CHANNELS.find(item=>item.platform===platform)||{platform,id:platform.toLowerCase(),name:platform,source:'채널 원천 확인 필요'};
  const summary=report.summary_json||{};
  const profit=channelProfit(report,channel);
  const caveats=[];
  if(summary.comparison_guard?.safe===false)caveats.push(text(summary.comparison_guard.message)||'비교 기간의 운영 변경을 확인해야 합니다.');
  if(summary.financial_trust?.status&&text(summary.financial_trust.status).toUpperCase()!=='READY')caveats.push('재무 근거가 완전하지 않아 이익 판단을 보류합니다.');
  if(profit==null)caveats.push('채널 단위 원가·비용이 확인되지 않아 이익을 추정하지 않았습니다.');
  return Object.freeze({
    id:text(report.id),platform:channel.platform,title:text(report.title)||`${channel.name} 주간 인사이트`,
    period:Object.freeze({start:report.period_start||summary.period?.start||null,end:report.period_end||summary.period?.end||null}),
    generatedAt:report.created_at||summary.generated_at||null,status:text(report.status||'FINAL').toUpperCase(),
    flow:Object.freeze({
      change:text(summary.comparison?.headline||summary.comparison?.summary)||'저장 기간의 변화 근거를 확인하세요.',
      cause:causeFor(report),
      profit:Object.freeze({state:profit==null?'CHECK_REQUIRED':'CALCULATED',value:profit}),
      action:actionFor(report)
    }),
    provenance:Object.freeze({source:channel.source,channelSeparated:true,coverage:Object.freeze(summary.data_coverage&&typeof summary.data_coverage==='object'?summary.data_coverage:{}),comparisonSafe:summary.comparison_guard?.safe!==false}),
    caveats:Object.freeze(caveats)
  });
}

function buildPhase28InsightsModel(data={},options={}){
  const reports=data.reports||[];
  const channels=CHANNELS.map(channel=>buildChannel(channel,reports,data.dataHealth||{}));
  const savedReports=Object.fromEntries(CHANNELS.map(channel=>{
    const rows=scopedReports(reports,channel.platform);
    const headers=rows.map((report,index)=>reportHeader(
      report,
      channel,
      changeRate(channelRevenue(report,channel),channelRevenue(rows[index+1],channel))
    ));
    return [channel.platform,frozenRows(headers)];
  }));
  const insightCount=channels.filter(channel=>channel.currentReportId).length+channels.reduce((sum,channel)=>sum+channel.signals.filter(item=>item.tone==='warning'||item.tone==='danger'||item.tone==='hold').length,0);
  return Object.freeze({
    writePolicy:'READ_ONLY',generatedAt:data.generatedAt||null,initialWorkspace:options.workspace||data.loadedWorkspace||'overview',
    initialChannel:['naver','coupang','cafe24'].includes(text(options.platform).toLowerCase())?text(options.platform).toLowerCase():'naver',
    hero:Object.freeze({count:insightCount,summary:'채널별 주간 변화와 원인, 이익, 다음 행동을 저장 근거로 이어서 봅니다.'}),
    channels:frozenRows(channels),savedReports:Object.freeze(savedReports),reportCount:Object.values(savedReports).reduce((sum,rows)=>sum+rows.length,0),
    schedule:Object.freeze({label:'매주 월요일 07:30',timezone:'Asia/Seoul',mode:'채널별 자동 생성·서버 저장'}),
    policy:Object.freeze({channelSeparated:true,missingAsZero:false,automaticWrites:false,detailLoading:'ON_DEMAND'})
  });
}

module.exports={CHANNELS,buildPhase28InsightsModel,normalizeInsightReportDetail};
