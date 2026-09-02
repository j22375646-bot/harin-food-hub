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
  if(variance===0)return Object.freeze({code:'MATCHED',label:'대조 완료',tone:'ready'});
  if(variance>0)return Object.freeze({code:'OVERPAID',label:'예상 초과 지급',tone:'review'});
  if(variance<0)return Object.freeze({code:'UNDERPAID',label:'예상 미달 지급',tone:'attention'});
  if(platform==='COUPANG_RG'&&status==='COST_REQUIRED'&&settlementCoverage!=null&&settlementCoverage<100){
    return Object.freeze({code:'SETTLEMENT_INCOMPLETE',label:`정산 연결 ${settlementCoverage.toLocaleString('ko-KR')}%`,tone:'warning'});
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
      coverage
    })
  });
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
  return Object.freeze({
    days:Number(days),
    start:center.period_start||null,
    end:center.period_end||null,
    expected:numberOrNull(waterfall.expected_payout),
    actual:numberOrNull(waterfall.actual_payout),
    variance:numberOrNull(waterfall.variance),
    comparableChannels:numberOrNull(waterfall.comparable_channels),
    revenueMix,
    rocketGrowthFlow,
    waterfall:frozenRows([
      {id:'gross',label:'총매출',value:numberOrNull(waterfall.gross_sales),tone:'blue'},
      {id:'refunds',label:'취소·환불',value:numberOrNull(waterfall.refunds),tone:'expense'},
      {id:'fees',label:'판매 수수료',value:numberOrNull(waterfall.fees),tone:'expense'},
      {id:'logistics',label:'배송·물류비',value:numberOrNull(waterfall.logistics),tone:'expense'},
      {id:'advertising',label:'광고비',value:numberOrNull(waterfall.advertising),tone:'expense'},
      {id:'expected',label:'예상 정산',value:numberOrNull(waterfall.expected_payout),tone:'expected'},
      {id:'actual',label:'실제 지급',value:numberOrNull(waterfall.actual_payout),tone:'actual'}
    ]),
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
