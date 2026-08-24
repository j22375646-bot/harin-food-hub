'use strict';

const naverClient=require('./client.js');

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

function buildBidPerformanceAnalysis({keyword={},rule=null,dailyPayload=[],devicePayload=[],weekdayPayload=[],hourPayload=[],estimates=null,bidHistory=[],errors=[],now=new Date()}={}){
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
    finance:{...windows['7']},errors:sourceErrors
  };
}

function estimateRows(payload){
  const root=payload?.data??payload;
  const rows=Array.isArray(root?.estimate)?root.estimate:Array.isArray(root)?root:[];
  return rows.map(item=>({key:text(item?.keyword||item?.key).replace(/\s+/gu,'').toLocaleLowerCase('ko-KR'),bid:number(item?.bid)})).filter(item=>item.key&&item.bid!==null);
}

async function fetchEstimate(api,device,keyword,targetRank){
  const response=await api.request('POST','/estimate/average-position-bid/keyword',null,{device,items:[{key:keyword,position:targetRank}]});
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
  const settled=await Promise.allSettled(calls.map(([,call])=>call()));
  const values={},errors=[];
  settled.forEach((item,index)=>{
    const key=calls[index][0];
    if(item.status==='fulfilled')values[key]=item.value.data;
    else errors.push({source:key,code:item.reason?.code||'NAVER_STATS_FAILED',message:`${key} 자료를 불러오지 못했습니다.`});
  });
  let estimates=null;
  const targetRank=number(ruleResult.data?.target_rank);
  if(targetRank!==null){
    const estimateResults=await Promise.allSettled(['PC','MOBILE'].map(device=>fetchEstimate(api,device,keyword.keyword,targetRank)));
    estimates={target_rank:targetRank,pc_bid:estimateResults[0].status==='fulfilled'?estimateResults[0].value:null,mobile_bid:estimateResults[1].status==='fulfilled'?estimateResults[1].value:null};
    estimateResults.forEach((item,index)=>{if(item.status==='rejected')errors.push({source:`estimate_${index===0?'pc':'mobile'}`,code:item.reason?.code||'NAVER_ESTIMATE_FAILED',message:`${index===0?'PC':'모바일'} 목표순위 예상값을 불러오지 못했습니다.`});});
  }
  return buildBidPerformanceAnalysis({
    keyword,rule:ruleResult.data,dailyPayload:values.daily,devicePayload:values.device,weekdayPayload:values.weekday,hourPayload:values.hour,
    estimates,bidHistory:historyResult.data||[],errors,now
  });
}

module.exports={FORMULA_VERSION,WINDOW_DAYS,WEEKDAYS,responsePoints,pointMetrics,summarize,dailySeries,dimensionMetrics,volatility,targetAttainment,targetHitRate,competitionStrength,buildBidPerformanceAnalysis,estimateRows,loadBidPerformanceAnalysis};
