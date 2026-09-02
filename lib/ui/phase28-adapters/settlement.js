'use strict';

const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const numberOrNull=value=>hasNumber(value)?Number(value):null;
const text=value=>String(value==null?'':value).trim();
const frozenRows=items=>Object.freeze(items.map(item=>Object.freeze(item)));

const STATUS_LABELS={
  ACTUAL:'지급 확인',ESTIMATED:'지급 예정',COST_REQUIRED:'비용 확인 필요',
  APPROVAL_REQUIRED:'카페24 승인 필요',RECONNECT_REQUIRED:'OAuth 재연결 필요',SCOPE_REQUIRED:'API 권한 필요',
  VERIFY_REQUIRED:'권한 확인 중',UNAVAILABLE:'연결 확인 필요',NO_DATA:'자료 확인 필요'
};

function stateFor(channel){
  const variance=numberOrNull(channel.payout_variance);
  const status=text(channel.status||'NO_DATA').toUpperCase();
  const platform=text(channel.platform).toUpperCase();
  const settlementCoverage=numberOrNull(channel.settlement_coverage);
  const settlementSourceStatus=text(channel.settlement_source_status).toUpperCase();
  if(variance===0)return Object.freeze({code:'MATCHED',label:'대조 완료',tone:'ready'});
  if(variance>0)return Object.freeze({code:'OVERPAID',label:'예상 초과 지급',tone:'review'});
  if(variance<0)return Object.freeze({code:'UNDERPAID',label:'예상 미달 지급',tone:'attention'});
  if(platform==='COUPANG_RG'&&status==='COST_REQUIRED'&&settlementCoverage!=null&&settlementCoverage<100){
    return Object.freeze({code:'SETTLEMENT_INCOMPLETE',label:`정산 연결 ${settlementCoverage.toLocaleString('ko-KR')}%`,tone:'warning'});
  }
  if(platform==='COUPANG_RG'&&settlementSourceStatus==='SEPARATE_SOURCE_REQUIRED'){
    return Object.freeze({code:'SEPARATE_SOURCE_REQUIRED',label:'로켓그로스 원장 필요',tone:'warning'});
  }
  return Object.freeze({code:status,label:STATUS_LABELS[status]||'확인 필요',tone:'warning'});
}

function recoveryFor(channel,state){
  const platform=text(channel.platform).toUpperCase();
  const status=text(channel.status||'NO_DATA').toUpperCase();
  const explicitHref=text(channel.action_href)||null;
  if(explicitHref){
    const external=/^https?:\/\//i.test(explicitHref);
    const label=status==='APPROVAL_REQUIRED'
      ?'카페24 승인 안내 보기'
      :['RECONNECT_REQUIRED','SCOPE_REQUIRED'].includes(status)
        ?'Cafe24 권한 다시 연결'
        :external?'외부 안내 보기':'연결 다시 확인';
    return Object.freeze({kind:external?'external':'route',label,href:explicitHref,workspace:null});
  }
  if(['OVERPAID','UNDERPAID'].includes(state.code)){
    return Object.freeze({kind:'workspace',label:'차이 대조 열기',href:null,workspace:'variance'});
  }
  if(state.code==='MATCHED'){
    return Object.freeze({kind:'workspace',label:'지급 일정 보기',href:null,workspace:'history'});
  }
  if(platform==='NAVER'){
    return Object.freeze({kind:'route',label:'네이버 수집 상태 보기',href:'/data-collection/naver-api',workspace:null});
  }
  if(['COUPANG','COUPANG_RG'].includes(platform)){
    return Object.freeze({kind:'route',label:'쿠팡 수집 상태 보기',href:'/data-collection',workspace:null});
  }
  if(status==='COST_REQUIRED'){
    return Object.freeze({kind:'route',label:'비용 기준 입력하기',href:'/products/costs',workspace:null});
  }
  return Object.freeze({kind:'route',label:'수집 상태 확인하기',href:'/data-collection',workspace:null});
}

function compactSchedule(item={}){
  return {
    platform:text(item.platform).toUpperCase(),
    date:item.date||null,
    status:text(item.status)||'확인 필요',
    amount:numberOrNull(item.amount),
    type:text(item.type)||'정산 유형 확인 필요',
    month:item.month||null
  };
}

function compactChannel(channel={},schedules=[]){
  const platform=text(channel.platform).toUpperCase();
  const state=stateFor(channel);
  const recovery=recoveryFor(channel,state);
  const values=['NAVER','COUPANG','COUPANG_RG'].includes(platform)
    ?[channel.gross_sales,channel.fees,channel.advertising,channel.expected_payout,channel.actual_payout]
    :[channel.gross_sales,channel.fees,channel.expected_payout,channel.actual_payout];
  const coverage=Math.round(values.filter(hasNumber).length/values.length*100);
  const nearest=schedules
    .filter(item=>item.platform===platform)
    .slice()
    .sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')))[0]||null;
  return Object.freeze({
    id:platform.toLowerCase(),
    platform,
    label:text(channel.label)||(platform==='NAVER'?'네이버':platform==='CAFE24'?'Cafe24':platform==='COUPANG'?'쿠팡 판매자배송':platform==='COUPANG_RG'?'쿠팡 로켓그로스':'채널 확인 필요'),
    status:text(channel.status||'NO_DATA').toUpperCase(),
    stateCode:state.code,
    stateLabel:state.label,
    tone:state.tone,
    needsAttention:state.code!=='MATCHED',
    basis:text(channel.basis)||'자료 확인 필요',
    gross:numberOrNull(channel.gross_sales),
    refunds:numberOrNull(channel.refunds),
    fees:numberOrNull(channel.fees),
    logistics:numberOrNull(channel.logistics),
    advertising:numberOrNull(channel.advertising),
    advertisingStats:numberOrNull(channel.advertising_stats),
    advertisingCharged:numberOrNull(channel.advertising_charged),
    advertisingBalance:numberOrNull(channel.advertising_balance),
    advertisingVariance:numberOrNull(channel.advertising_variance),
    advertisingSource:text(channel.advertising_source)||null,
    advertisingHistory:frozenRows((Array.isArray(channel.advertising_history)?channel.advertising_history:[]).map(item=>({
      date:item.date||null,
      charged:numberOrNull(item.charged),
      used:numberOrNull(item.used),
      balance:numberOrNull(item.balance)
    }))),
    expected:numberOrNull(channel.expected_payout),
    actual:numberOrNull(channel.actual_payout),
    variance:numberOrNull(channel.payout_variance),
    asOf:channel.last_updated_at||null,
    action:text(channel.action)||'채널 정산 원본을 확인하세요.',
    actionHref:text(channel.action_href)||null,
    recovery,
    nextPayout:nearest,
    evidence:Object.freeze({
      orderCount:numberOrNull(channel.order_count),
      settlementOrderCount:numberOrNull(channel.settlement_order_count),
      settlementCoverage:numberOrNull(channel.settlement_coverage),
      settlementSourceStatus:text(channel.settlement_source_status).toUpperCase()||null,
      coverage
    })
  });
}

function compactCollectionAutomation(runs=[]){
  const latest=[...(Array.isArray(runs)?runs:[])]
    .filter(run=>text(run.job_name).toUpperCase()==='ALL_PLATFORM_SYNC')
    .sort((left,right)=>String(right.finished_at||right.started_at||'').localeCompare(String(left.finished_at||left.started_at||'')))[0]||null;
  if(!latest)return Object.freeze({state:'NOT_RUN',queuedCount:0,attentionCount:0,latestAt:null,summary:'첫 자동 수집을 기다리고 있어요.'});
  const jobs=Array.isArray(latest.result_json?.jobs)?latest.result_json.jobs:[];
  const queuedCount=jobs.filter(job=>text(job.status).toUpperCase()==='RUNNING').length;
  const attentionCount=jobs.filter(job=>job.degraded===true||['PARTIAL','FAILED','SETUP_REQUIRED','APPROVAL_REQUIRED'].includes(text(job.status).toUpperCase())).length;
  const state=queuedCount?'COLLECTING':attentionCount||['PARTIAL','FAILED'].includes(text(latest.status).toUpperCase())?'ATTENTION':'READY';
  const summary=queuedCount
    ? `${queuedCount}개 고정 IP 작업 진행 · ${attentionCount}개 확인 필요`
    : attentionCount?`${attentionCount}개 수집 경로 확인 필요`:'모든 연결 채널 수집 요청 완료';
  return Object.freeze({state,queuedCount,attentionCount,latestAt:latest.finished_at||latest.started_at||null,summary});
}

function compactPeriod(center={},days=30){
  const schedules=frozenRows((Array.isArray(center.schedules)?center.schedules:[]).map(compactSchedule));
  const channels=frozenRows((Array.isArray(center.channels)?center.channels:[]).map(item=>compactChannel(item,schedules)));
  const waterfall=center.waterfall||{};
  const revenueMix=frozenRows((Array.isArray(waterfall.revenue_breakdown)?waterfall.revenue_breakdown:[]).map(item=>({
    platform:text(item.platform).toUpperCase(),
    label:text(item.label)||'채널 확인 필요',
    gross:numberOrNull(item.gross_sales),
    net:numberOrNull(item.expected_payout)
  })));
  const rocket=waterfall.rocket_growth&&typeof waterfall.rocket_growth==='object'?waterfall.rocket_growth:null;
  const rocketGrowthFlow=rocket?Object.freeze({
    gross:numberOrNull(rocket.gross_sales),
    refunds:numberOrNull(rocket.refunds),
    fees:numberOrNull(rocket.fees),
    logistics:numberOrNull(rocket.logistics),
    advertising:numberOrNull(rocket.advertising),
    deductions:numberOrNull(rocket.deductions),
    net:numberOrNull(rocket.expected_payout),
    actual:numberOrNull(rocket.actual_payout),
    includedInTotalGross:Boolean(rocket.included_in_total_gross)
  }):null;
  const actualComplete=waterfall.actual_payout_complete===true;
  const actualCoverage=numberOrNull(waterfall.actual_payout_coverage);
  const actualChannelCount=numberOrNull(waterfall.actual_channel_count);
  const revenueChannelCount=numberOrNull(waterfall.revenue_channel_count);
  const baseWaterfall=[
    {id:'gross',label:'총매출',value:numberOrNull(waterfall.gross_sales),tone:'blue'},
    {id:'refunds',label:'취소·환불',value:numberOrNull(waterfall.refunds),tone:'expense'},
    {id:'fees',label:'판매 수수료',value:numberOrNull(waterfall.fees),tone:'expense'},
    {id:'logistics',label:'배송·물류비',value:numberOrNull(waterfall.logistics),tone:'expense'},
    {id:'advertising',label:'광고비',value:numberOrNull(waterfall.advertising),tone:'expense'},
    {id:'expected',label:'예상 정산',value:numberOrNull(waterfall.expected_payout),tone:'expected'},
    {id:'actual',label:actualComplete?'실제 지급':'확인된 지급',value:numberOrNull(waterfall.actual_payout),tone:'actual',partial:!actualComplete&&hasNumber(waterfall.actual_payout)}
  ];
  let chainConnected=hasNumber(baseWaterfall[0].value);
  const connectedWaterfall=baseWaterfall.map((item,index)=>{
    if(index===0)return {...item,chainConnected};
    chainConnected=chainConnected&&hasNumber(item.value)&&(item.id!=='actual'||actualComplete);
    return {...item,chainConnected};
  });
  const waterfallItems=connectedWaterfall.map((item,index)=>({
    ...item,
    connectsNext:Boolean(item.chainConnected&&connectedWaterfall[index+1]?.chainConnected)
  }));
  const knownPoints=baseWaterfall.filter(item=>hasNumber(item.value)).length;
  const totalPoints=baseWaterfall.length;
  return Object.freeze({
    days:Number(days),
    start:center.period_start||null,
    end:center.period_end||null,
    expected:numberOrNull(waterfall.expected_payout),
    actual:numberOrNull(waterfall.actual_payout),
    actualComplete,
    actualCoverage,
    actualChannelCount,
    revenueChannelCount,
    variance:numberOrNull(waterfall.variance),
    comparableChannels:numberOrNull(waterfall.comparable_channels),
    revenueMix,
    rocketGrowthFlow,
    automation:Object.freeze({state:knownPoints===totalPoints&&actualComplete?'READY':'COLLECTING',knownPoints,totalPoints}),
    waterfall:frozenRows(waterfallItems),
    channels,
    schedules
  });
}

function buildPhase28SettlementModel(data={}){
  const source=data.settlementPeriods&&typeof data.settlementPeriods==='object'
    ?data.settlementPeriods
    :data.unifiedSettlement?{30:data.unifiedSettlement}:{};
  const periodOptions=Object.keys(source).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const periods={};
  for(const days of periodOptions)periods[String(days)]=compactPeriod(source[String(days)]??source[days],days);
  const defaultPeriod=periodOptions.includes(30)?30:(periodOptions[0]||30);
  const current=periods[String(defaultPeriod)]||compactPeriod({},defaultPeriod);
  const checkCount=current.channels.filter(channel=>channel.needsAttention).length;
  return Object.freeze({
    kind:'settlement',
    writePolicy:'READ_ONLY',
    collectionAutomation:compactCollectionAutomation(data.automationRuns),
    defaultPeriod,
    periodOptions:Object.freeze(periodOptions),
    periods:Object.freeze(periods),
    hero:Object.freeze({
      asOf:data.generatedAt||current.end||null,
      channelCount:current.channels.length,
      checkCount,
      headline:checkCount?`오늘 확인할 정산 차이 ${checkCount.toLocaleString('ko-KR')}건이 있어요.`:'오늘 확인할 정산 차이가 없어요.',
      summary:'받을 돈과 실제 지급액을 맞춰 보고, 근거가 없는 비용은 0원으로 만들지 않아요.'
    })
  });
}

module.exports={buildPhase28SettlementModel};
