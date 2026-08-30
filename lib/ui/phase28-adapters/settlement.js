'use strict';

const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const numberOrNull=value=>hasNumber(value)?Number(value):null;
const text=value=>String(value==null?'':value).trim();
const frozenRows=items=>Object.freeze(items.map(item=>Object.freeze(item)));

const STATUS_LABELS={
  ACTUAL:'지급 확인',ESTIMATED:'지급 예정',COST_REQUIRED:'비용 확인 필요',
  UNAVAILABLE:'연결 확인 필요',NO_DATA:'자료 확인 필요'
};

function stateFor(channel){
  const variance=numberOrNull(channel.payout_variance);
  const status=text(channel.status||'NO_DATA').toUpperCase();
  if(variance===0)return Object.freeze({code:'MATCHED',label:'대조 완료',tone:'ready'});
  if(variance!=null)return Object.freeze({code:'VARIANCE',label:'확인 필요',tone:'attention'});
  return Object.freeze({code:status,label:STATUS_LABELS[status]||'확인 필요',tone:'warning'});
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
  const state=stateFor(channel);
  const platform=text(channel.platform).toUpperCase();
  const values=platform==='COUPANG'
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
    label:text(channel.label)||(platform==='NAVER'?'네이버':platform==='CAFE24'?'Cafe24':platform==='COUPANG'?'쿠팡':'채널 확인 필요'),
    status:text(channel.status||'NO_DATA').toUpperCase(),
    stateCode:state.code,
    stateLabel:state.label,
    tone:state.tone,
    basis:text(channel.basis)||'자료 확인 필요',
    gross:numberOrNull(channel.gross_sales),
    refunds:numberOrNull(channel.refunds),
    fees:numberOrNull(channel.fees),
    logistics:numberOrNull(channel.logistics),
    advertising:numberOrNull(channel.advertising),
    expected:numberOrNull(channel.expected_payout),
    actual:numberOrNull(channel.actual_payout),
    variance:numberOrNull(channel.payout_variance),
    asOf:channel.last_updated_at||null,
    action:text(channel.action)||'채널 정산 원본을 확인하세요.',
    nextPayout:nearest,
    evidence:Object.freeze({orderCount:numberOrNull(channel.order_count),coverage})
  });
}

function compactPeriod(center={},days=30){
  const schedules=frozenRows((Array.isArray(center.schedules)?center.schedules:[]).map(compactSchedule));
  const channels=frozenRows((Array.isArray(center.channels)?center.channels:[]).map(item=>compactChannel(item,schedules)));
  const waterfall=center.waterfall||{};
  return Object.freeze({
    days:Number(days),
    start:center.period_start||null,
    end:center.period_end||null,
    expected:numberOrNull(waterfall.expected_payout),
    actual:numberOrNull(waterfall.actual_payout),
    variance:numberOrNull(waterfall.variance),
    comparableChannels:numberOrNull(waterfall.comparable_channels),
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
  const checkCount=current.channels.filter(channel=>channel.variance!==0||channel.actual==null||channel.expected==null).length;
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
