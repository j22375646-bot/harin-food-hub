'use strict';

const bidRules=require('./bid-rules.js');

const MODES=new Set(['PAUSED','OBSERVE','ACTIVE']);
const INTERVALS=new Set([60,120,180]);
const MAX_STALE_DAYS=2;
const ESTIMATE_BATCH_SIZE=50;

class NaverBidScheduleError extends Error{
  constructor(message,code='INVALID_BID_SCHEDULE',status=400){
    super(message);
    this.name='NaverBidScheduleError';
    this.code=code;
    this.status=status;
  }
}

const text=(value,max=200)=>String(value??'').trim().slice(0,max);
const integer=(value,{field,min,max,allowed}={})=>{
  const number=Number(value);
  if(!Number.isInteger(number)||number<min||number>max||(allowed&&!allowed.has(number))){
    throw new NaverBidScheduleError(`${field} 값을 다시 확인해주세요.`,'SCHEDULE_VALUE_INVALID');
  }
  return number;
};

function validateNaverBidSchedule(input={}){
  if(text(input.platform||'NAVER').toUpperCase()!=='NAVER'){
    throw new NaverBidScheduleError('네이버 광고그룹 스케줄만 저장할 수 있습니다.','NAVER_SCOPE_REQUIRED');
  }
  const adgroupId=text(input.ncc_adgroup_id);
  if(!adgroupId)throw new NaverBidScheduleError('네이버 광고그룹을 먼저 선택해주세요.','ADGROUP_REQUIRED');
  const mode=text(input.mode||'PAUSED').toUpperCase();
  if(!MODES.has(mode))throw new NaverBidScheduleError('자동운영 상태를 다시 선택해주세요.','MODE_INVALID');
  if(mode==='ACTIVE'&&input.confirm_active!==true&&!input.activation_confirmed_at){
    throw new NaverBidScheduleError('자동 적용을 켜려면 마지막 확인이 필요합니다.','ACTIVATION_CONFIRMATION_REQUIRED',409);
  }
  const weekdays=[...new Set((Array.isArray(input.weekdays)?input.weekdays:[]).map(Number))].sort((a,b)=>a-b);
  if(!weekdays.length||weekdays.some(value=>!Number.isInteger(value)||value<0||value>6)){
    throw new NaverBidScheduleError('운영할 요일을 하나 이상 선택해주세요.','WEEKDAY_REQUIRED');
  }
  const startMinute=integer(input.start_minute,{field:'시작 시각',min:0,max:1410});
  const endMinute=integer(input.end_minute,{field:'종료 시각',min:30,max:1440});
  if(startMinute>=endMinute)throw new NaverBidScheduleError('종료 시각은 시작 시각보다 뒤여야 합니다.','TIME_WINDOW_INVALID');
  if(startMinute%30||endMinute%30)throw new NaverBidScheduleError('운영 시각은 30분 단위로 정해주세요.','TIME_STEP_INVALID');
  const interval=integer(input.interval_minutes,{field:'확인 주기',min:30,max:180,allowed:INTERVALS});
  const maxPerRun=integer(input.max_changes_per_run,{field:'회당 변경 한도',min:1,max:10});
  const dailyLimit=integer(input.daily_change_limit,{field:'일일 변경 한도',min:1,max:30});
  if(maxPerRun>dailyLimit)throw new NaverBidScheduleError('회당 변경 한도는 일일 한도보다 클 수 없습니다.','RUN_LIMIT_EXCEEDS_DAILY');
  return {
    ncc_adgroup_id:adgroupId,
    mode,weekdays,start_minute:startMinute,end_minute:endMinute,
    interval_minutes:interval,max_changes_per_run:maxPerRun,daily_change_limit:dailyLimit,
    allow_increase:input.allow_increase===true,
    activation_confirmed_at:mode==='ACTIVE'?(input.activation_confirmed_at||new Date().toISOString()):null,
    last_run_slot:text(input.last_run_slot,40)||null
  };
}

function kstParts(now=new Date()){
  const shifted=new Date(now.getTime()+9*60*60*1000);
  return {
    date:shifted.toISOString().slice(0,10),
    weekday:shifted.getUTCDay(),
    minute:shifted.getUTCHours()*60+shifted.getUTCMinutes()
  };
}

function scheduleSlot(rawSchedule,now=new Date()){
  const schedule=validateNaverBidSchedule({...rawSchedule,platform:'NAVER'});
  const current=kstParts(now);
  const slotMinute=Math.floor(current.minute/schedule.interval_minutes)*schedule.interval_minutes;
  const hour=String(Math.floor(slotMinute/60)).padStart(2,'0');
  const minute=String(slotMinute%60).padStart(2,'0');
  return `${current.date}:${hour}:${minute}`;
}

function scheduleDue(rawSchedule,now=new Date()){
  const schedule=validateNaverBidSchedule({...rawSchedule,platform:'NAVER'});
  if(schedule.mode==='PAUSED')return false;
  const current=kstParts(now);
  if(!schedule.weekdays.includes(current.weekday))return false;
  if(current.minute<schedule.start_minute||current.minute>=schedule.end_minute)return false;
  return schedule.last_run_slot!==scheduleSlot(schedule,now);
}

function dateAgeDays(dateKey,now){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||'')))return Infinity;
  const current=kstParts(now).date;
  return Math.floor((Date.parse(`${current}T00:00:00Z`)-Date.parse(`${dateKey}T00:00:00Z`))/86400000);
}

function block(list,candidate,code,message){
  list.push({ncc_keyword_id:String(candidate?.ncc_keyword_id||''),keyword:String(candidate?.keyword||''),code,message});
}

function estimateRows(payload){
  const rows=Array.isArray(payload?.estimate)?payload.estimate:Array.isArray(payload)?payload:[];
  return new Map(rows.map(item=>[String(item?.keyword||item?.key||'').replace(/\s+/gu,'').toLocaleLowerCase('ko-KR'),Number(item?.bid)]).filter(([,bid])=>Number.isFinite(bid)));
}

const chunks=(items,size)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,(index+1)*size));

async function deviceEstimateMap(api,device,items){
  const result=new Map();
  for(const batch of chunks(items,ESTIMATE_BATCH_SIZE)){
    const response=await api.request('POST','/estimate/average-position-bid/keyword',null,{device,items:batch});
    for(const [key,bid] of estimateRows(response.data))result.set(key,bid);
  }
  return result;
}

async function buildEstimateCandidates({api,keywords=[],rules=[],now=new Date()}={}){
  if(!api?.request)throw new NaverBidScheduleError('네이버 입찰 예상 API 연결이 필요합니다.','NAVER_ESTIMATE_API_REQUIRED',503);
  const ruleMap=new Map(rules.filter(item=>item?.enabled===true&&Number.isInteger(Number(item?.target_rank))).map(item=>[String(item.ncc_keyword_id),item]));
  const eligible=keywords.filter(item=>ruleMap.has(String(item?.ncc_keyword_id))&&String(item?.status||'').toUpperCase()==='ELIGIBLE'&&item?.user_lock!==true&&String(item?.keyword||'').trim());
  if(!eligible.length)return [];
  const items=eligible.map(item=>({key:String(item.keyword).trim(),position:Number(ruleMap.get(String(item.ncc_keyword_id)).target_rank)}));
  const devices=['PC','MOBILE'];
  const settled=await Promise.allSettled(devices.map(device=>deviceEstimateMap(api,device,items)));
  const deviceMaps=new Map(devices.map((device,index)=>[device,settled[index].status==='fulfilled'?settled[index].value:null]));
  const availableMaps=[...deviceMaps.values()].filter(Boolean);
  if(!availableMaps.length)throw new NaverBidScheduleError('네이버 목표 순위 예상값을 불러오지 못했습니다.','NAVER_ESTIMATE_FAILED',502);
  const today=kstParts(now).date;
  return eligible.map(keyword=>{
    const id=String(keyword.ncc_keyword_id),rule=ruleMap.get(id),key=String(keyword.keyword).replace(/\s+/gu,'').toLocaleLowerCase('ko-KR');
    const estimates=availableMaps.map(map=>map.get(key)).filter(Number.isFinite);
    if(!estimates.length)return null;
    const target=Math.max(...estimates),current=Number(keyword.bid_amount);
    if(!Number.isInteger(current)||current<bidRules.MIN_BID||current>bidRules.MAX_BID||current%10!==0)return null;
    const delta=target-current;
    const action=Math.abs(delta)<10?'KEEP':delta>0?'RAISE':'LOWER';
    const proposed=action==='RAISE'?current+Number(rule.increase_step):action==='LOWER'?current-Number(rule.decrease_step):current;
    return {
      platform:'NAVER',ncc_keyword_id:id,ncc_adgroup_id:String(keyword.ncc_adgroup_id||''),keyword:String(keyword.keyword),
      current_bid:current,minimum_owner_bid:rule.minimum_bid,maximum_owner_bid:rule.maximum_bid,
      can_request_approval:true,period_start:today,period_end:today,
      automation:{eligible:action!=='KEEP',action,proposed_bid:proposed,blockers:action==='KEEP'?['NO_BID_CHANGE']:[]},
      estimate:{target_bid:target,pc_bid:deviceMaps.get('PC')?.get(key)??null,mobile_bid:deviceMaps.get('MOBILE')?.get(key)??null,target_rank:rule.target_rank,source:'NAVER_AVERAGE_POSITION_ESTIMATE',notice:'네이버의 PC·모바일 목표 순위 예상값이며 실제 노출 순위를 보장하지 않습니다.'}
    };
  }).filter(Boolean);
}

function buildNaverBidSchedulePlan({schedule:rawSchedule,candidates=[],rules=[],now=new Date(),dailyExecutedCount=0,automationEnabled=false}={}){
  const schedule=validateNaverBidSchedule({...rawSchedule,platform:'NAVER'});
  const ruleMap=new Map(rules.filter(item=>item?.enabled===true).map(item=>[String(item.ncc_keyword_id),item]));
  const blocked=[];
  const proposed=[];
  for(const candidate of candidates){
    if(String(candidate?.platform||'NAVER').toUpperCase()!=='NAVER')continue;
    if(String(candidate?.ncc_adgroup_id||'')!==schedule.ncc_adgroup_id)continue;
    const rule=ruleMap.get(String(candidate.ncc_keyword_id||''));
    if(!rule)continue;
    if(dateAgeDays(candidate.period_end,now)>MAX_STALE_DAYS){
      block(blocked,candidate,'STALE_PERFORMANCE_DATA','최근 광고 성과를 다시 수집해야 합니다.');
      continue;
    }
    if(candidate.automation?.eligible!==true||!Number.isFinite(Number(candidate.automation?.proposed_bid))){
      block(blocked,candidate,'AUTOMATION_NOT_ELIGIBLE','현재 근거로는 자동 변경할 수 없습니다.');
      continue;
    }
    const action=String(candidate.automation.action||'KEEP').toUpperCase();
    if(action==='RAISE'&&!schedule.allow_increase){
      block(blocked,candidate,'INCREASE_NOT_ALLOWED','이 스케줄은 자동 인상을 허용하지 않습니다.');
      continue;
    }
    try{
      const preview=bidRules.simulateNaverBidRule({
        row:{
          id:`NAVER:${candidate.ncc_keyword_id}`,platform:'NAVER',currentBid:candidate.current_bid,
          minimumBid:candidate.minimum_owner_bid,maximumBid:candidate.maximum_owner_bid,
          adgroupId:candidate.ncc_adgroup_id
        },
        rule,
        action,
        requested_bid:candidate.automation.proposed_bid
      });
      if(preview.proposed_bid===preview.current_bid){
        block(blocked,candidate,'NO_BID_CHANGE','안전선 적용 후 변경할 금액이 없습니다.');
        continue;
      }
      proposed.push({
        ncc_keyword_id:String(candidate.ncc_keyword_id),ncc_adgroup_id:String(candidate.ncc_adgroup_id),
        keyword:String(candidate.keyword||''),action,current_bid:preview.current_bid,
        requested_bid:preview.requested_bid,proposed_bid:preview.proposed_bid,clamped:preview.clamped,
        target_rank:preview.target_rank,target_rank_mode:'REFERENCE_ONLY',candidate
      });
    }catch(error){block(blocked,candidate,error.code||'RULE_BLOCKED',error.message);}
  }
  const dailyRemaining=Math.max(0,schedule.daily_change_limit-Math.max(0,Number(dailyExecutedCount)||0));
  const limit=Math.min(schedule.max_changes_per_run,dailyRemaining);
  const actions=proposed.slice(0,limit);
  for(const item of proposed.slice(limit))block(blocked,item,'DAILY_LIMIT_REACHED','회당 또는 일일 변경 한도에 도달했습니다.');
  const active=schedule.mode==='ACTIVE';
  const execute=active&&automationEnabled===true;
  const status=active&&!automationEnabled?'SETUP_REQUIRED':schedule.mode;
  return {
    platform:'NAVER',ncc_adgroup_id:schedule.ncc_adgroup_id,mode:schedule.mode,status,execute,
    slot:scheduleSlot(schedule,now),daily_executed_count:Number(dailyExecutedCount)||0,
    daily_remaining:dailyRemaining,actions,blocked,
    summary:{candidates:candidates.length,enabled_rules:ruleMap.size,planned:actions.length,blocked:blocked.length}
  };
}

module.exports={
  ESTIMATE_BATCH_SIZE,INTERVALS,MAX_STALE_DAYS,MODES,NaverBidScheduleError,
  buildEstimateCandidates,buildNaverBidSchedulePlan,kstParts,scheduleDue,scheduleSlot,validateNaverBidSchedule
};
