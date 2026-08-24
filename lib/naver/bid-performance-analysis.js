'use strict';

const naverClient=require('./client.js');
const adResearch=require('../market-intelligence/naver-ad-research.js');

const FORMULA_VERSION='phase24-14-bid-competition-v1';
const WINDOW_DAYS=[1,3,7];
const WEEKDAYS=[['MON','월'],['TUE','화'],['WED','수'],['THU','목'],['FRI','금'],['SAT','토'],['SUN','일']];

const number=value=>{
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const text=value=>String(value??'').trim();
const dateKey=value=>{
  const matched=String(value??'').match(/\d{4}-\d{2}-\d{2}/);
  return matched?.[0]||null;
};
const kstDateKey=value=>{
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const shiftDate=(value,days)=>{
  const date=new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
};

function responsePoints(payload){
  const root=payload?.data&&Array.isArray(payload.data)?payload.data:payload;
  const entities=Array.isArray(root)?root:root?[root]:[];
  const points=[];
  for(const entity of entities){
    const nested=Array.isArray(entity?.data)?entity.data:Array.isArray(entity?.stats)?entity.stats:null;
    if(nested)points.push(...nested);
    else if(entity&&typeof entity==='object')points.push(entity);
  }
  return points;
}

function metric(point,key,...aliases){
  for(const name of [key,...aliases]){
    const value=number(point?.[name]);
    if(value!==null)return value;
  }
  return null;
}

function pointMetrics(point={}){
  const averageRank=metric(point,'avgRnk','averageRank','rank');
  return {
    impressions:metric(point,'impCnt','impressions'),
    clicks:metric(point,'clkCnt','clicks'),
    cost:metric(point,'salesAmt','cost'),
    orders:metric(point,'ccnt','conversions','orders'),
    revenue:metric(point,'convAmt','conversion_revenue','revenue'),
    average_rank:averageRank!==null&&averageRank>0?averageRank:null
  };
}

function sumPresent(points,key){
  const values=points.map(item=>number(item?.[key])).filter(value=>value!==null);
  return values.length?values.reduce((sum,value)=>sum+value,0):null;
}

function weightedRank(points){
  const ranked=points.filter(item=>number(item?.average_rank)!==null&&number(item.average_rank)>0);
  if(!ranked.length)return null;
  const weighted=ranked.filter(item=>number(item?.impressions)!==null&&number(item.impressions)>0);
  if(weighted.length){
    const weight=weighted.reduce((sum,item)=>sum+Number(item.impressions),0);
    return weight?weighted.reduce((sum,item)=>sum+Number(item.average_rank)*Number(item.impressions),0)/weight:null;
  }
  return ranked.reduce((sum,item)=>sum+Number(item.average_rank),0)/ranked.length;
}

function summarize(points=[]){
  const available=points.filter(item=>Object.entries(item).some(([key,value])=>key!=='date'&&key!=='bid'&&value!==null&&value!==undefined));
  const cost=sumPresent(available,'cost');
  const revenue=sumPresent(available,'revenue');
  return {
    available_days:new Set(available.map(item=>item.date).filter(Boolean)).size,
    impressions:sumPresent(available,'impressions'),clicks:sumPresent(available,'clicks'),cost,
    orders:sumPresent(available,'orders'),revenue,
    roas:cost!==null&&cost>0&&revenue!==null?Math.round(revenue/cost*1000)/10:null,
    average_rank:weightedRank(available),
    actual_profit:null,
    profit_status:'BLOCKED',
    profit_reason:'키워드별 주문 원가 귀속 근거가 없어 실제 이익을 0원으로 계산하지 않습니다.'
  };
}

function bidForDate(history=[],currentBid,date){
  const eligible=history.filter(item=>{
    const changedAt=dateKey(item.date||item.executed_at||item.created_at);
    return changedAt!==null&&changedAt<=date&&number(item.bid??item.value??item.proposed_value?.values?.bid_amount)!==null;
  })
    .sort((left,right)=>String(left.date||left.executed_at||left.created_at).localeCompare(String(right.date||right.executed_at||right.created_at)));
  const latest=eligible.at(-1);
  return number(latest?.bid??latest?.value??latest?.proposed_value?.values?.bid_amount)??number(currentBid);
}

function dailySeries(payload,{now=new Date(),currentBid=null,bidHistory=[]}={}){
  const until=kstDateKey(now);
  const byDate=new Map();
  for(const point of responsePoints(payload)){
    const date=dateKey(point.period||point.date||point.statDt||point.dateStart);
    if(!date)continue;
    const value={date,...pointMetrics(point)};
    const previous=byDate.get(date);
    byDate.set(date,previous?{
      date,
      impressions:sumPresent([previous,value],'impressions'),clicks:sumPresent([previous,value],'clicks'),cost:sumPresent([previous,value],'cost'),
      orders:sumPresent([previous,value],'orders'),revenue:sumPresent([previous,value],'revenue'),average_rank:weightedRank([previous,value])
    }:value);
  }
  return Array.from({length:7},(_,index)=>{
    const date=shiftDate(until,index-6),found=byDate.get(date);
    return {date,impressions:found?.impressions??null,clicks:found?.clicks??null,cost:found?.cost??null,orders:found?.orders??null,revenue:found?.revenue??null,average_rank:found?.average_rank??null,bid:bidForDate(bidHistory,currentBid,date)};
  });
}

function dimensionValue(point,key){
  const direct=point?.[key]??point?.breakdown?.[key]??point?.dimension?.[key];
  const raw=direct!==undefined&&direct!==null?String(direct).trim().toUpperCase():typeof point?.breakdown==='string'?point.breakdown.trim().toUpperCase():'';
  if(!raw)return '';
  if(key==='pcMblTp')return ({M:'MOBILE',MOBILE:'MOBILE',P:'PC',PC:'PC'})[raw]||raw;
  if(key==='dayw')return ({1:'MON',2:'TUE',3:'WED',4:'THU',5:'FRI',6:'SAT',7:'SUN',MONDAY:'MON',TUESDAY:'TUE',WEDNESDAY:'WED',THURSDAY:'THU',FRIDAY:'FRI',SATURDAY:'SAT',SUNDAY:'SUN'})[raw]||raw.slice(0,3);
  if(key==='hh24'&&/^\d{1,2}$/.test(raw))return raw.padStart(2,'0');
  return raw;
}

function dimensionMetrics(payload,key,expected=[]){
  const grouped=new Map();
  for(const point of responsePoints(payload)){
    const id=dimensionValue(point,key);
    if(!id)continue;
    const value=pointMetrics(point),current=grouped.get(id)||[];
    current.push(value);grouped.set(id,current);
  }
  return expected.map(([id,label])=>{
    const points=grouped.get(id)||[];
    return {key:id,label,...summarize(points),available:points.length>0};
  });
}

function dynamicDimensionMetrics(payload,key){
  const grouped=new Map();
  for(const point of responsePoints(payload)){
    const id=dimensionValue(point,key);
    if(!id)continue;
    const current=grouped.get(id)||[];
    current.push(pointMetrics(point));grouped.set(id,current);
  }
  return Array.from(grouped.entries())
    .map(([id,points])=>({key:id,label:id,...summarize(points),available:true}))
    .sort((left,right)=>(number(right.cost)??-1)-(number(left.cost)??-1)||(number(right.impressions)??-1)-(number(left.impressions)??-1)||left.label.localeCompare(right.label,'ko-KR'));
}

function buildBidOperatingScope({scope={},period={},devicePayload=[],regionPayload=[],hourPayload=[],errors=[]}={}){
  const sourceErrors=(errors||[]).filter(Boolean);
  const deviceError=sourceErrors.some(item=>item.source==='device');
  const regionError=sourceErrors.some(item=>item.source==='region');
  const hourError=sourceErrors.some(item=>item.source==='hour');
  const devices=dimensionMetrics(devicePayload,'pcMblTp',[['PC','PC'],['MOBILE','모바일']]);
  const regions=dynamicDimensionMetrics(regionPayload,'regnR3Nm');
  const hours=dimensionMetrics(hourPayload,'hh24',Array.from({length:24},(_,hour)=>[String(hour).padStart(2,'0'),`${String(hour).padStart(2,'0')}시`])).map((item,hour)=>({...item,hour}));
  const hasDevices=devices.some(item=>item.available);
  const hasRegions=regions.length>0;
  const hasHours=hours.some(item=>item.available);
  const deviceStatus=hasDevices?'READY':deviceError?'VERIFY_REQUIRED':'NO_DATA';
  const regionStatus=hasRegions?'READY':regionError?'VERIFY_REQUIRED':'NO_DATA';
  const hourStatus=hasHours?'READY':hourError?'VERIFY_REQUIRED':'NO_DATA';
  const readyCount=[hasDevices,hasRegions,hasHours].filter(Boolean).length;
  return {
    phase:'25-5',formula_version:'phase25-5-operating-scope-v1',platform:'NAVER',
    status:readyCount===3?'READY':readyCount?'PARTIAL':'NO_DATA',
    scope:{type:text(scope.type)||'UNKNOWN',id:text(scope.id),label:text(scope.label)||'선택 범위'},
    period:{since:dateKey(period.since),until:dateKey(period.until)},
    device_status:deviceStatus,region_status:regionStatus,hour_status:hourStatus,devices,regions,hours,
    sources:{
      device:{kind:'NAVER_ACTUAL_BREAKDOWN',label:'네이버 실제 PC·모바일 집계',status:deviceStatus},
      region:{kind:'NAVER_ACTUAL_BREAKDOWN',label:'네이버 실제 지역 집계',status:regionStatus},
      hour:{kind:'NAVER_ACTUAL_BREAKDOWN',label:'네이버 실제 시간대 집계',status:hourStatus}
    },
    notice:'기기·지역·시간대는 실제 성과를 비교하는 분석 범위입니다. 키워드 변경 입찰가는 모든 범위에 공통 입찰가로 적용됩니다.',
    errors:sourceErrors
  };
}

function volatility(points=[]){
  const values=points.map(item=>number(item.average_rank)).filter(value=>value!==null);
  if(values.length<2)return null;
  const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
  return Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length);
}

function targetAttainment(average,target){
  const rank=number(average),goal=number(target);
  if(rank===null||goal===null||rank<=0||goal<=0)return null;
  return Math.min(100,Math.round(goal/rank*1000)/10);
}

function targetHitRate(points=[],target){
  const goal=number(target);
  if(goal===null||goal<=0)return {status:'TARGET_REQUIRED',percent:null,hit_days:null,ranked_days:0};
  const ranks=points.map(item=>number(item?.average_rank)).filter(value=>value!==null&&value>0);
  if(!ranks.length)return {status:'NO_DATA',percent:null,hit_days:null,ranked_days:0};
  const hitDays=ranks.filter(value=>value<=goal).length;
  return {status:'READY',percent:Math.round(hitDays/ranks.length*1000)/10,hit_days:hitDays,ranked_days:ranks.length};
}

function competitionStrength(points=[]){
  const ranks=points.map(item=>number(item?.average_rank)).filter(value=>value!==null&&value>0);
  const notice='경쟁사 실제 입찰가가 아니라 네이버 실제 평균순위 변동성으로 만든 운영 신호입니다.';
  if(ranks.length<2)return {
    level:'UNKNOWN',label:'확인 필요',volatility:null,ranked_days:ranks.length,
    action:'실제 순위 자료가 2일 이상 쌓인 뒤 판단하세요.',notice
  };
  const value=volatility(ranks.map(average_rank=>({average_rank})));
  if(value<=0.5)return {
    level:'LOW',label:'낮음',volatility:value,ranked_days:ranks.length,
    action:'순위가 비교적 안정적이에요. 광고 성과와 이익을 함께 보며 유지 여부를 판단하세요.',notice
  };
  if(value<=1.5)return {
    level:'MEDIUM',label:'보통',volatility:value,ranked_days:ranks.length,
    action:'순위 변동이 있어 PC·모바일과 시간대 성과를 함께 확인하세요.',notice
  };
  return {
    level:'HIGH',label:'높음',volatility:value,ranked_days:ranks.length,
    action:'순위 변동이 큽니다. 입찰 상한과 시간대 스케줄을 먼저 확인하세요.',notice
  };
}

function buildBidPerformanceAnalysis({keyword={},rule=null,dailyPayload=[],devicePayload=[],weekdayPayload=[],hourPayload=[],estimates=null,officialBidEvidence=null,bidHistory=[],errors=[],now=new Date()}={}){
  const daily=dailySeries(dailyPayload,{now,currentBid:keyword.bid_amount??keyword.bidAmt,bidHistory});
  const windows=Object.fromEntries(WINDOW_DAYS.map(days=>[String(days),summarize(daily.slice(-days))]));
  const target=number(rule?.target_rank??estimates?.target_rank);
  const average=windows['7'].average_rank;
  const rankWindows=Object.fromEntries(WINDOW_DAYS.map(days=>{
    const scoped=daily.slice(-days),hit=targetHitRate(scoped,target);
    return [String(days),{...hit,competition:competitionStrength(scoped)}];
  }));
  const sevenDayRank=rankWindows['7'];
  const devices=dimensionMetrics(devicePayload,'pcMblTp',[['PC','PC'],['MOBILE','모바일']]);
  const weekdays=dimensionMetrics(weekdayPayload,'dayw',WEEKDAYS);
  const hours=dimensionMetrics(hourPayload,'hh24',Array.from({length:24},(_,hour)=>[String(hour).padStart(2,'0'),`${String(hour).padStart(2,'0')}시`])).map((item,hour)=>({...item,hour}));
  const hasDaily=daily.some(item=>item.average_rank!==null||item.impressions!==null||item.cost!==null);
  const sourceErrors=(errors||[]).filter(Boolean);
  return {
    phase:'24-6',formula_version:FORMULA_VERSION,status:hasDaily?(sourceErrors.length?'PARTIAL':'READY'):'NO_DATA',
    scope:{platform:'NAVER',keyword_id:text(keyword.ncc_keyword_id||keyword.nccKeywordId),keyword:text(keyword.keyword)||'키워드 확인 필요',current_bid:number(keyword.bid_amount??keyword.bidAmt)},
    period:{since:daily[0]?.date||null,until:daily.at(-1)?.date||null},
    sources:{
      actual:{kind:'ACTUAL_AVERAGE',label:'네이버 실제 집계 평균순위',notice:'순간 노출 순위가 아니라 선택 기간에 실제 집계된 평균순위입니다.'},
      estimate:{kind:'ESTIMATE_REFERENCE',label:'네이버 목표순위 예상',notice:'목표순위 입찰 예상값이며 실제 노출 순위를 보장하지 않습니다.'}
    },
    daily,windows,devices,weekdays,hours,
    rank:{
      target,average,attainment_percent:targetAttainment(average,target),volatility:volatility(daily),
      hit_rate_percent:sevenDayRank.percent,hit_days:sevenDayRank.hit_days,ranked_days:sevenDayRank.ranked_days,
      hit_rate_status:sevenDayRank.status,competition:sevenDayRank.competition,windows:rankWindows,
      status:average===null?'NO_DATA':target===null?'TARGET_REQUIRED':'READY'
    },
    estimate:{status:estimates&&(number(estimates.pc_bid)!==null||number(estimates.mobile_bid)!==null)?'READY':target===null?'TARGET_REQUIRED':'NO_DATA',target_rank:target,pc_bid:number(estimates?.pc_bid),mobile_bid:number(estimates?.mobile_bid),notice:'네이버의 PC·모바일 목표순위 예상값이며 실제 노출 순위를 보장하지 않습니다.'},
    official_bid_evidence:officialBidEvidence||buildOfficialBidEvidence({keyword:keyword.keyword,targetRank:target,estimates,now}),
    finance:{...windows['7']},errors:sourceErrors
  };
}

function estimateRows(payload){
  const root=payload?.data??payload;
  const rows=Array.isArray(root?.estimate)?root.estimate:Array.isArray(root)?root:[];
  return rows.map(item=>({key:text(item?.keyword||item?.key).replace(/\s+/gu,'').toLocaleLowerCase('ko-KR'),bid:number(item?.bid)})).filter(item=>item.key&&item.bid!==null);
}

function buildOfficialBidEvidence({keyword='',targetRank=null,keywordToolPayload=null,estimates=null,minimumEstimates=null,errors=[],now=new Date()}={}){
  const normalizedKeyword=adResearch.normalizedKey(keyword);
  const marketRow=adResearch.normalizeKeywordToolRows(keywordToolPayload,[keyword])
    .find(item=>item.normalized_keyword===normalizedKeyword)||null;
  const target={
    target_rank:number(targetRank??estimates?.target_rank),
    pc_bid:number(estimates?.pc_bid),
    mobile_bid:number(estimates?.mobile_bid)
  };
  const minimum={
    period:'MONTH',
    pc_bid:number(minimumEstimates?.pc_bid),
    mobile_bid:number(minimumEstimates?.mobile_bid)
  };
  const minimumValues=[minimum.pc_bid,minimum.mobile_bid].filter(value=>value!==null);
  const targetValues=[target.pc_bid,target.mobile_bid].filter(value=>value!==null);
  const hasMarket=Boolean(marketRow&&(
    marketRow.monthly_pc_queries_status!=='NO_DATA'||
    marketRow.monthly_mobile_queries_status!=='NO_DATA'||
    text(marketRow.competition)
  ));
  const hasAny=hasMarket||minimumValues.length>0||targetValues.length>0;
  const complete=hasMarket&&minimumValues.length===2&&target.target_rank!==null&&targetValues.length===2;
  const status=complete?'READY':target.target_rank===null&&hasAny?'TARGET_REQUIRED':hasAny?'PARTIAL':'NO_DATA';
  const pcQueries=number(marketRow?.monthly_pc_queries),mobileQueries=number(marketRow?.monthly_mobile_queries);
  const totalQueries=pcQueries!==null&&mobileQueries!==null?pcQueries+mobileQueries:null;
  const date=now instanceof Date?now:new Date(now);
  return {
    phase:'25-6',platform:'NAVER',status,
    fetched_at:Number.isNaN(date.getTime())?null:date.toISOString(),
    market:{
      keyword:text(marketRow?.keyword)||text(keyword)||null,
      monthly_pc_queries:pcQueries,
      monthly_pc_queries_status:marketRow?.monthly_pc_queries_status||'NO_DATA',
      monthly_mobile_queries:mobileQueries,
      monthly_mobile_queries_status:marketRow?.monthly_mobile_queries_status||'NO_DATA',
      monthly_total_queries:totalQueries,
      monthly_pc_ad_clicks:number(marketRow?.monthly_pc_ad_clicks),
      monthly_mobile_ad_clicks:number(marketRow?.monthly_mobile_ad_clicks),
      competition:text(marketRow?.competition).toLowerCase()||null
    },
    minimum_exposure:minimum,
    target_position:target,
    reference_band:{
      low:minimumValues.length?Math.min(...minimumValues):null,
      high:targetValues.length?Math.max(...targetValues):null
    },
    sources:[
      {kind:'NAVER_OFFICIAL',label:'월간 검색수요·경쟁도',endpoint:'GET /keywordstool',status:hasMarket?'READY':'NO_DATA'},
      {kind:'NAVER_OFFICIAL_ESTIMATE',label:'최소 노출 예상 입찰가',endpoint:'POST /estimate/exposure-minimum-bid/keyword',status:minimumValues.length===2?'READY':minimumValues.length?'PARTIAL':'NO_DATA'},
      {kind:'NAVER_OFFICIAL_ESTIMATE',label:'목표순위 예상 입찰가',endpoint:'POST /estimate/average-position-bid/keyword',status:target.target_rank===null?'TARGET_REQUIRED':targetValues.length===2?'READY':targetValues.length?'PARTIAL':'NO_DATA'}
    ],
    notice:'네이버 공식 예상값은 조회 시점의 참고 자료이며 실제 노출 순위·클릭 비용을 보장하지 않습니다.',
    errors:(errors||[]).filter(Boolean)
  };
}

async function fetchEstimate(api,device,keyword,targetRank){
  const response=await api.request('POST','/estimate/average-position-bid/keyword',null,{device,items:[{key:keyword,position:targetRank}]});
  return estimateRows(response.data)[0]?.bid??null;
}

async function fetchMinimumEstimate(api,device,keyword){
  const response=await api.request('POST','/estimate/exposure-minimum-bid/keyword',null,{device,period:'MONTH',items:[keyword]});
  return estimateRows(response.data)[0]?.bid??null;
}

async function loadBidPerformanceAnalysis({db,api=naverClient,keywordId,now=new Date()}={}){
  if(!db)throw Object.assign(new Error('데이터베이스 연결이 필요합니다.'),{status:503,code:'DATABASE_REQUIRED'});
  const id=text(keywordId);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Object.assign(new Error('확인할 네이버 키워드를 선택해주세요.'),{status:400,code:'INVALID_KEYWORD_ID'});
  const [keywordResult,ruleResult,historyResult]=await Promise.all([
    db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id,keyword,bid_amount,status,user_lock,updated_at').eq('ncc_keyword_id',id).maybeSingle(),
    db.from('naver_bid_keyword_rules').select('ncc_keyword_id,enabled,target_rank,target_rank_mode,updated_at').eq('ncc_keyword_id',id).maybeSingle(),
    db.from('financial_change_requests').select('id,target_key,status,proposed_value,created_at,executed_at').eq('platform','NAVER').eq('change_type','NAVER_BID').eq('target_key',id).order('created_at',{ascending:true}).limit(100)
  ]);
  const dbError=keywordResult.error||ruleResult.error||historyResult.error;
  if(dbError)throw dbError;
  if(!keywordResult.data)throw Object.assign(new Error('저장된 네이버 키워드를 찾지 못했습니다.'),{status:404,code:'NAVER_KEYWORD_NOT_FOUND'});
  const keyword=keywordResult.data,until=kstDateKey(now),since=shiftDate(until,-6);
  const query={id,fields:['impCnt','clkCnt','salesAmt','ccnt','convAmt','avgRnk','recentAvgRnk'],timeRange:{since,until}};
  const calls=[
    ['daily',()=>api.request('GET','/stats',{...query,timeIncrement:1})],
    ['device',()=>api.request('GET','/stats',{...query,breakdown:'pcMblTp'})],
    ['weekday',()=>api.request('GET','/stats',{...query,breakdown:'dayw'})],
    ['hour',()=>api.request('GET','/stats',{...query,breakdown:'hh24'})]
  ];
  let estimates=null,minimumEstimates=null,keywordToolPayload=null;
  const targetRank=number(ruleResult.data?.target_rank);
  const officialCalls=[
    ['keyword_tool',()=>api.request('GET','/keywordstool',{hintKeywords:text(keyword.keyword).replace(/\s+/gu,''),showDetail:1})],
    ['minimum_pc',()=>fetchMinimumEstimate(api,'PC',keyword.keyword)],
    ['minimum_mobile',()=>fetchMinimumEstimate(api,'MOBILE',keyword.keyword)]
  ];
  if(targetRank!==null){
    officialCalls.push(['estimate_pc',()=>fetchEstimate(api,'PC',keyword.keyword,targetRank)]);
    officialCalls.push(['estimate_mobile',()=>fetchEstimate(api,'MOBILE',keyword.keyword,targetRank)]);
  }
  const [settled,officialResults]=await Promise.all([
    Promise.allSettled(calls.map(([,call])=>call())),
    Promise.allSettled(officialCalls.map(([,call])=>call()))
  ]);
  const values={},errors=[];
  settled.forEach((item,index)=>{
    const key=calls[index][0];
    if(item.status==='fulfilled')values[key]=item.value.data;
    else errors.push({source:key,code:item.reason?.code||'NAVER_STATS_FAILED',message:`${key} 자료를 불러오지 못했습니다.`});
  });
  const officialValues={},officialErrors=[];
  officialResults.forEach((item,index)=>{
    const source=officialCalls[index][0];
    if(item.status==='fulfilled')officialValues[source]=item.value?.data??item.value;
    else officialErrors.push({source,code:item.reason?.code||'NAVER_OFFICIAL_BID_EVIDENCE_FAILED',message:`${source==='keyword_tool'?'검색수요':source.includes('minimum')?'최소 노출 예상값':'목표순위 예상값'}을 불러오지 못했습니다.`});
  });
  keywordToolPayload=officialValues.keyword_tool??null;
  minimumEstimates={pc_bid:number(officialValues.minimum_pc),mobile_bid:number(officialValues.minimum_mobile)};
  if(targetRank!==null)estimates={target_rank:targetRank,pc_bid:number(officialValues.estimate_pc),mobile_bid:number(officialValues.estimate_mobile)};
  errors.push(...officialErrors);
  const officialBidEvidence=buildOfficialBidEvidence({
    keyword:keyword.keyword,targetRank,keywordToolPayload,estimates,minimumEstimates,errors:officialErrors,now
  });
  return buildBidPerformanceAnalysis({
    keyword,rule:ruleResult.data,dailyPayload:values.daily,devicePayload:values.device,weekdayPayload:values.weekday,hourPayload:values.hour,
    estimates,bidHistory:historyResult.data||[],errors,now,officialBidEvidence
  });
}

async function loadBidOperatingScope({db,api=naverClient,campaignId,adgroupId,now=new Date()}={}){
  if(!db)throw Object.assign(new Error('데이터베이스 연결이 필요합니다.'),{status:503,code:'DATABASE_REQUIRED'});
  const groupId=text(adgroupId),campaign=text(campaignId);
  const type=groupId?'ADGROUP':campaign?'CAMPAIGN':'';
  const id=groupId||campaign;
  if(!type||!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Object.assign(new Error('확인할 네이버 캠페인 또는 광고그룹을 선택해주세요.'),{status:400,code:'INVALID_NAVER_OPERATING_SCOPE'});
  const result=type==='ADGROUP'
    ?await db.from('naver_adgroups').select('ncc_adgroup_id,ncc_campaign_id,name,status,user_lock').eq('ncc_adgroup_id',id).maybeSingle()
    :await db.from('naver_campaigns').select('ncc_campaign_id,name,campaign_type,status,user_lock').eq('ncc_campaign_id',id).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw Object.assign(new Error('저장된 네이버 운영 범위를 찾지 못했습니다.'),{status:404,code:'NAVER_OPERATING_SCOPE_NOT_FOUND'});
  const until=shiftDate(kstDateKey(now),-1),since=shiftDate(until,-6);
  const query={id,fields:['impCnt','clkCnt','salesAmt','ccnt','convAmt','avgRnk'],timeRange:{since,until}};
  const calls=[
    ['device',()=>api.request('GET','/stats',{...query,breakdown:'pcMblTp'})],
    ['region',()=>api.request('GET','/stats',{...query,breakdown:'regnR3Nm'})],
    ['hour',()=>api.request('GET','/stats',{...query,breakdown:'hh24'})]
  ];
  const settled=await Promise.allSettled(calls.map(([,call])=>call()));
  const payloads={},errors=[];
  settled.forEach((item,index)=>{
    const source=calls[index][0];
    if(item.status==='fulfilled')payloads[source]=item.value.data;
    else errors.push({source,code:item.reason?.code||`NAVER_${source.toUpperCase()}_BREAKDOWN_FAILED`,message:`${source==='device'?'PC·모바일':source==='region'?'지역':'시간대'} 자료를 확인하지 못했습니다.`});
  });
  return buildBidOperatingScope({
    scope:{type,id,label:text(result.data.name)||id},period:{since,until},
    devicePayload:payloads.device||[],regionPayload:payloads.region||[],hourPayload:payloads.hour||[],errors
  });
}

module.exports={FORMULA_VERSION,WINDOW_DAYS,WEEKDAYS,responsePoints,pointMetrics,summarize,dailySeries,dimensionMetrics,dynamicDimensionMetrics,buildBidOperatingScope,volatility,targetAttainment,targetHitRate,competitionStrength,buildBidPerformanceAnalysis,buildOfficialBidEvidence,estimateRows,loadBidPerformanceAnalysis,loadBidOperatingScope};
