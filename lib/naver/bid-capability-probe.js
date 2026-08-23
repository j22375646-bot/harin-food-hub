'use strict';

const defaultApi=require('./client.js');

const JOB_TYPE='SEARCH_AD_BID_CAPABILITY_TEST';
const CORE_KEYS=new Set([
  'campaigns','adgroups','keywords','current_bid','base_stats',
  'average_position_pc','average_position_mobile',
  'minimum_exposure_pc','minimum_exposure_mobile'
]);
const API_KEYS=[
  'campaigns','adgroups','keywords','current_bid','base_stats',
  'device_breakdown','weekday_breakdown','hour_breakdown','region_breakdown',
  'average_position_pc','average_position_mobile',
  'minimum_exposure_pc','minimum_exposure_mobile','position_15'
];

const DEFINITIONS={
  campaigns:['캠페인 읽기','계정의 광고 캠페인을 읽습니다.','GET /ncc/campaigns'],
  adgroups:['광고그룹 읽기','표본 캠페인의 광고그룹을 읽습니다.','GET /ncc/adgroups'],
  keywords:['등록 키워드 읽기','표본 광고그룹의 등록 키워드를 읽습니다.','GET /ncc/keywords'],
  current_bid:['현재 입찰가','키워드 응답의 현재 입찰가를 확인합니다.','GET /ncc/keywords'],
  base_stats:['최근 성과·평균 순위','최근 7일 노출·클릭·광고비·전환·평균 순위 제공 범위를 확인합니다.','GET /stats'],
  device_breakdown:['PC·모바일 성과 분리','기기별 성과 분해를 확인합니다.','GET /stats · pcMblTp'],
  weekday_breakdown:['요일별 성과','요일별 성과 분해를 확인합니다.','GET /stats · dayw'],
  hour_breakdown:['시간대별 성과','시간대별 성과 분해를 확인합니다.','GET /stats · hh24'],
  region_breakdown:['지역별 성과','지역별 성과 분해를 확인합니다. 실시간 지역 순위와는 다릅니다.','GET /stats · regnNo'],
  average_position_pc:['PC 목표 순위 예상 입찰가','PC 목표 순위별 예상 입찰가를 확인합니다.','POST /estimate/average-position-bid/keyword'],
  average_position_mobile:['모바일 목표 순위 예상 입찰가','모바일 목표 순위별 예상 입찰가를 확인합니다.','POST /estimate/average-position-bid/keyword'],
  minimum_exposure_pc:['PC 최소 노출 예상 입찰가','PC 최소 노출 예상 입찰가를 확인합니다.','POST /estimate/exposure-minimum-bid/keyword'],
  minimum_exposure_mobile:['모바일 최소 노출 예상 입찰가','모바일 최소 노출 예상 입찰가를 확인합니다.','POST /estimate/exposure-minimum-bid/keyword'],
  position_15:['15위 목표 예상','1~5위 밖의 목표 순위 지원 여부를 별도로 확인합니다.','POST /estimate/average-position-bid/keyword'],
  exact_live_rank:['순간 실제 노출 순위','공식 성과·예상 API와 실제 검색 화면의 순간 순위는 구분합니다.','공식 API 범위 구분'],
  competitor_bid_distribution:['경쟁 입찰 분포','경쟁사 실제 입찰가는 제공값이 아니며 순위별 예상가로만 비교합니다.','예상 입찰가 파생'],
  bid_write:['입찰가 변경 준비','쓰기 환경 잠금 상태만 확인하며 이번 진단에서는 변경하지 않습니다.','서버 안전 잠금']
};

function definition(key){
  const [label,description,source]=DEFINITIONS[key];
  return {key,label,description,source};
}

function list(value){
  if(Array.isArray(value))return value;
  if(Array.isArray(value?.data))return value.data;
  if(Array.isArray(value?.estimate))return value.estimate;
  if(Array.isArray(value?.items))return value.items;
  return [];
}

function responseRows(response){return list(response?.data);}

function safeError(error){
  const code=String(error?.code||'');
  const status=Number(error?.status)||0;
  if(code==='NAVER_SEARCH_AD_CONFIG_REQUIRED'||status===503)return '네이버 검색광고 서버 자격증명을 확인해주세요.';
  if(status===401||status===403)return '인증키 또는 광고계정 API 권한을 확인해주세요.';
  if(status===429)return '네이버 요청 한도에 도달했습니다. 잠시 뒤 다시 확인해주세요.';
  if(status===400)return '현재 광고유형 또는 표본에서는 이 조회 조건을 확인하지 못했습니다.';
  if(/timeout|abort/i.test(String(error?.name||'')))return '네이버 응답이 늦어 이 항목 확인을 끝내지 못했습니다.';
  return '네이버 응답을 확인하지 못했습니다. 다른 항목은 계속 검사했습니다.';
}

function check(key,status,{count=null,note='',errorCode=null}={}){
  return {...definition(key),status,count,note,errorCode:errorCode?String(errorCode).slice(0,80):null};
}

function skippedChecks(existing=[]){
  const used=new Set(existing.map(item=>item.key));
  return API_KEYS.filter(key=>!used.has(key)).map(key=>check(key,'SKIPPED',{note:'앞 단계의 표본이 없어 호출하지 않았습니다.'}));
}

async function attempt(checks,key,execute,{emptyStatus='NO_SAMPLE',readyNote='실계정 읽기 확인 완료'}={}){
  try{
    const response=await execute();
    const rows=responseRows(response);
    const status=rows.length?'READY':emptyStatus;
    const item=check(key,status,{count:rows.length,note:rows.length?readyNote:'API 호출은 성공했지만 이 기간의 표본이 없습니다.'});
    checks.push(item);
    return {ok:true,response,rows,item};
  }catch(error){
    const item=check(key,'VERIFY_REQUIRED',{note:safeError(error),errorCode:error?.code||error?.status||'PROBE_FAILED'});
    checks.push(item);
    return {ok:false,error,rows:[],item};
  }
}

function kstDate(value){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).reduce((all,item)=>({...all,[item.type]:item.value}),{});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function period(now){
  const since=new Date(now.getTime()-6*24*60*60*1000);
  return {since:kstDate(since),until:kstDate(now)};
}

async function startLog(db,startedAt){
  if(!db)return null;
  const saved=await db.from('sync_logs').insert({platform:'NAVER',job_type:JOB_TYPE,status:'RUNNING',started_at:startedAt}).select('id').single();
  if(saved.error)throw saved.error;
  return saved.data?.id||null;
}

async function finishLog(db,id,result){
  if(!db||!id)return;
  const saved=await db.from('sync_logs').update({
    status:result.status==='FAILED'?'FAILED':result.status==='PARTIAL'?'PARTIAL':'SUCCESS',
    finished_at:result.checkedAt,
    rows_received:result.counts.keywords||0,
    error_message:result.status==='FAILED'?'네이버 자동입찰 핵심 읽기 검증이 끝나지 않았습니다.':null,
    metadata:{provider:result.provider,mode:result.mode,status:result.status,coreReady:result.coreReady,counts:result.counts,checks:result.checks,writeProbePerformed:false}
  }).eq('id',id);
  if(saved.error)throw saved.error;
}

function finalize({checks,counts,env,now,statusOverride=null}){
  checks.push(check('exact_live_rank','ESTIMATE_ONLY',{note:'공식 API의 평균 순위·예상 입찰가를 사용하고 순간 검색 순위로 표시하지 않습니다.'}));
  checks.push(check('competitor_bid_distribution','DERIVED_ONLY',{note:'경쟁사 실제 입찰가는 저장하지 않고 순위별 예상 입찰가로만 비교합니다.'}));
  const writeEnabled=String(env.NAVER_SEARCH_AD_WRITE_ENABLED||'').toLowerCase()==='true';
  checks.push(check('bid_write',writeEnabled?'CONFIGURED_NOT_TESTED':'LOCKED',{note:writeEnabled?'쓰기 잠금은 열려 있지만 24-0에서는 실제 변경을 호출하지 않았습니다.':'쓰기 잠금이 닫혀 있으며 24-0은 읽기 전용입니다.'}));
  const coreReady=[...CORE_KEYS].every(key=>checks.some(item=>item.key===key&&item.status==='READY'));
  const verificationRequired=checks.some(item=>item.status==='VERIFY_REQUIRED');
  const noData=checks.some(item=>CORE_KEYS.has(item.key)&&['NO_DATA','NO_SAMPLE','SKIPPED'].includes(item.status));
  const status=statusOverride||(coreReady?(verificationRequired?'PARTIAL':'READY'):noData?'NO_DATA':'FAILED');
  return {
    phase:'24-0',provider:'NAVER_SEARCH_ADS',mode:'READ_ONLY',status,coreReady,
    checkedAt:new Date(now).toISOString(),writeProbePerformed:false,counts,checks,
    rules:[
      '네이버와 쿠팡 키워드 자료와 실행 경로를 섞지 않습니다.',
      '실제값·평균값·예상값을 서로 다른 상태로 표시합니다.',
      '이 진단은 GET과 예상용 POST만 호출하며 광고값을 변경하지 않습니다.'
    ]
  };
}

async function probeBidCapabilities({db,api=defaultApi,env=process.env,now=new Date()}={}){
  const checkedAt=new Date(now).toISOString();
  const logId=await startLog(db,checkedAt);
  const checks=[];
  const counts={campaigns:null,adgroups:null,keywords:null};
  try{
    const campaignsResult=await attempt(checks,'campaigns',()=>api.request('GET','/ncc/campaigns'));
    if(!campaignsResult.ok){
      checks.push(...skippedChecks(checks));
      const result=finalize({checks,counts,env,now,statusOverride:campaignsResult.error?.code==='NAVER_SEARCH_AD_CONFIG_REQUIRED'?'SETUP_REQUIRED':'FAILED'});
      await finishLog(db,logId,result);
      return result;
    }
    counts.campaigns=campaignsResult.rows.length;
    if(!campaignsResult.rows.length){
      campaignsResult.item.status='NO_DATA';
      campaignsResult.item.note='연결은 됐지만 운영 중인 광고 캠페인 표본이 없습니다.';
      checks.push(...skippedChecks(checks));
      const result=finalize({checks,counts,env,now,statusOverride:'NO_DATA'});
      await finishLog(db,logId,result);
      return result;
    }

    const campaign=campaignsResult.rows[0];
    const groupsResult=await attempt(checks,'adgroups',()=>api.request('GET','/ncc/adgroups',{nccCampaignId:campaign.nccCampaignId}));
    counts.adgroups=groupsResult.ok?groupsResult.rows.length:null;
    if(!groupsResult.ok||!groupsResult.rows.length){
      if(groupsResult.ok){groupsResult.item.status='NO_DATA';groupsResult.item.note='표본 캠페인에 확인할 광고그룹이 없습니다.';}
      checks.push(...skippedChecks(checks));
      const result=finalize({checks,counts,env,now,statusOverride:groupsResult.ok?'NO_DATA':'FAILED'});
      await finishLog(db,logId,result);
      return result;
    }

    const group=groupsResult.rows[0];
    const keywordsResult=await attempt(checks,'keywords',()=>api.request('GET','/ncc/keywords',{nccAdgroupId:group.nccAdgroupId}));
    counts.keywords=keywordsResult.ok?keywordsResult.rows.length:null;
    if(!keywordsResult.ok||!keywordsResult.rows.length){
      if(keywordsResult.ok){keywordsResult.item.status='NO_DATA';keywordsResult.item.note='표본 광고그룹에 등록 키워드가 없습니다.';}
      checks.push(...skippedChecks(checks));
      const result=finalize({checks,counts,env,now,statusOverride:keywordsResult.ok?'NO_DATA':'FAILED'});
      await finishLog(db,logId,result);
      return result;
    }

    const keyword=keywordsResult.rows[0];
    const bid=Number(keyword.bidAmt);
    checks.push(check('current_bid',Number.isFinite(bid)&&bid>0?'READY':'NO_DATA',{count:Number.isFinite(bid)&&bid>0?1:0,note:Number.isFinite(bid)&&bid>0?'현재 입찰가 필드 확인 완료':'현재 입찰가 표본을 확인하지 못했습니다.'}));
    const timeRange=period(now);
    const statsQuery={id:keyword.nccKeywordId,fields:['impCnt','clkCnt','salesAmt','ccnt','convAmt','avgRnk','recentAvgRnk'],timeRange};
    await attempt(checks,'base_stats',()=>api.request('GET','/stats',statsQuery));
    for(const [key,breakdown] of [['device_breakdown','pcMblTp'],['weekday_breakdown','dayw'],['hour_breakdown','hh24'],['region_breakdown','regnNo']]){
      await attempt(checks,key,()=>api.request('GET','/stats',{...statsQuery,fields:['impCnt','clkCnt','salesAmt','avgRnk'],breakdown}));
    }
    const keywordText=String(keyword.keyword||'').trim();
    const averageItems=[{key:keywordText,position:1},{key:keywordText,position:5}];
    await attempt(checks,'average_position_pc',()=>api.request('POST','/estimate/average-position-bid/keyword',null,{device:'PC',items:averageItems}));
    await attempt(checks,'average_position_mobile',()=>api.request('POST','/estimate/average-position-bid/keyword',null,{device:'MOBILE',items:averageItems}));
    await attempt(checks,'minimum_exposure_pc',()=>api.request('POST','/estimate/exposure-minimum-bid/keyword',null,{device:'PC',period:'DAY',items:[keywordText]}));
    await attempt(checks,'minimum_exposure_mobile',()=>api.request('POST','/estimate/exposure-minimum-bid/keyword',null,{device:'MOBILE',period:'DAY',items:[keywordText]}));
    await attempt(checks,'position_15',()=>api.request('POST','/estimate/average-position-bid/keyword',null,{device:'PC',items:[{key:keywordText,position:15}]}),{emptyStatus:'NOT_SUPPORTED',readyNote:'15위 목표 예상 응답 확인 완료'});
    const result=finalize({checks,counts,env,now});
    await finishLog(db,logId,result);
    return result;
  }catch(error){
    const result=finalize({checks:[...checks,...skippedChecks(checks)],counts,env,now,statusOverride:'FAILED'});
    await finishLog(db,logId,result).catch(()=>{});
    return result;
  }
}

async function latestStoredProbe({db}={}){
  if(!db)return null;
  const result=await db.from('sync_logs').select('status,started_at,finished_at,metadata').eq('platform','NAVER').eq('job_type',JOB_TYPE).order('started_at',{ascending:false}).limit(1).maybeSingle();
  if(result.error)throw result.error;
  const metadata=result.data?.metadata;
  if(!metadata?.checks)return null;
  return {...metadata,phase:'24-0',checkedAt:result.data.finished_at||result.data.started_at||null,writeProbePerformed:false};
}

module.exports={JOB_TYPE,DEFINITIONS,probeBidCapabilities,latestStoredProbe,safeError,responseRows};

