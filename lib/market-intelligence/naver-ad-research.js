'use strict';

const crypto=require('node:crypto');
const projects=require('./projects.js');
const naverAds=require('../naver/client.js');
const naverTrends=require('./naver-trends.js');

const ESTIMATE_PERIODS=new Set(['DAY','MONTH']);
const SNAPSHOT_KINDS=['KEYWORD_TOOL','BID_ESTIMATE'];
const MAX_DISCOVERY_ROWS=100;
const MAX_SELECTED_KEYWORDS=20;

class MarketNaverAdResearchError extends Error{
  constructor(message,status=400,code='MARKET_NAVER_AD_RESEARCH_INVALID'){
    super(message);this.name='MarketNaverAdResearchError';this.status=status;this.code=code;
  }
}

const cleanText=(value,max=160)=>String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
const normalizedKey=value=>cleanText(value,80).replace(/\s+/gu,'').toLocaleLowerCase('ko-KR');

function normalizeList(value,{max,fallback=[]}={}){
  const source=Array.isArray(value)?value:String(value||'').split(/[\n,]/u);
  const result=[],seen=new Set();
  for(const item of source){
    const text=cleanText(item,80),key=normalizedKey(text);
    if(!text||!key||seen.has(key))continue;
    seen.add(key);result.push(text);
    if(result.length>=max)break;
  }
  if(result.length||!fallback.length)return result;
  return normalizeList(fallback,{max});
}

function normalizeProfile(input,{productName}={}){
  const fallback=naverTrends.productKeyword(productName);
  const seedKeywords=normalizeList(input?.seed_keywords,{max:5,fallback:[fallback]});
  if(!seedKeywords.length)throw new MarketNaverAdResearchError('시작 검색어를 1개 이상 입력해주세요.');
  const selectedKeywords=normalizeList(input?.selected_keywords,{max:MAX_SELECTED_KEYWORDS});
  const targetPosition=Number(input?.target_position||3);
  const estimatePeriod=cleanText(input?.estimate_period||'MONTH',12).toUpperCase();
  if(!Number.isInteger(targetPosition)||targetPosition<1||targetPosition>5)throw new MarketNaverAdResearchError('목표 순위는 PC와 모바일에 공통으로 적용 가능한 1~5위 중에서 선택해주세요.');
  if(!ESTIMATE_PERIODS.has(estimatePeriod))throw new MarketNaverAdResearchError('입찰 예상 기준 기간을 다시 선택해주세요.');
  return {
    seed_keywords:seedKeywords,
    selected_keywords:selectedKeywords,
    target_position:targetPosition,
    estimate_period:estimatePeriod,
    owner_confirmed:Boolean(input?.owner_confirmed)
  };
}

function parseMetric(value){
  const text=cleanText(value,40);
  if(!text)return {value:null,status:'NO_DATA',label:'자료 없음'};
  if(/^<\s*10$/u.test(text))return {value:null,status:'LT_10',label:'10 미만'};
  const parsed=Number(text.replace(/,/gu,''));
  return Number.isFinite(parsed)?{value:parsed,status:'EXACT',label:parsed.toLocaleString('ko-KR')}:{value:null,status:'NO_DATA',label:'자료 없음'};
}

function keywordToolPayload(payload){
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.keywordList))return payload.keywordList;
  if(Array.isArray(payload?.data))return payload.data;
  return [];
}

function normalizeKeywordToolRows(payload,seedKeywords=[]){
  const seedKeys=new Set(seedKeywords.map(normalizedKey));
  const deduped=new Map();
  for(const item of keywordToolPayload(payload)){
    const keyword=cleanText(item?.relKeyword||item?.keyword,80),key=normalizedKey(keyword);
    if(!keyword||!key||deduped.has(key))continue;
    const pcQueries=parseMetric(item?.monthlyPcQcCnt),mobileQueries=parseMetric(item?.monthlyMobileQcCnt);
    const pcClicks=parseMetric(item?.monthlyAvePcClkCnt),mobileClicks=parseMetric(item?.monthlyAveMobileClkCnt);
    const pcCtr=parseMetric(item?.monthlyAvePcCtr),mobileCtr=parseMetric(item?.monthlyAveMobileCtr);
    const averageDepth=parseMetric(item?.plAvgDepth);
    deduped.set(key,{
      keyword,normalized_keyword:key,is_seed:seedKeys.has(key),
      monthly_pc_queries:pcQueries.value,monthly_pc_queries_status:pcQueries.status,
      monthly_mobile_queries:mobileQueries.value,monthly_mobile_queries_status:mobileQueries.status,
      monthly_pc_ad_clicks:pcClicks.value,monthly_pc_ad_clicks_status:pcClicks.status,
      monthly_mobile_ad_clicks:mobileClicks.value,monthly_mobile_ad_clicks_status:mobileClicks.status,
      monthly_pc_ad_ctr:pcCtr.value,monthly_pc_ad_ctr_status:pcCtr.status,
      monthly_mobile_ad_ctr:mobileCtr.value,monthly_mobile_ad_ctr_status:mobileCtr.status,
      average_pc_ad_depth:averageDepth.value,average_pc_ad_depth_status:averageDepth.status,
      competition:cleanText(item?.compIdx,20).toLowerCase()||null
    });
  }
  return [...deduped.values()].sort((left,right)=>Number(right.is_seed)-Number(left.is_seed)
    ||((right.monthly_pc_queries||0)+(right.monthly_mobile_queries||0))-((left.monthly_pc_queries||0)+(left.monthly_mobile_queries||0))
    ||left.keyword.localeCompare(right.keyword,'ko')).slice(0,MAX_DISCOVERY_ROWS);
}

function summarizeKeywordRows(rows){
  if(!rows.length)return {data_status:'NO_DATA',summary:{keyword_count:0,exact_query_count:0,less_than_ten_count:0}};
  const lessThanTen=rows.filter(row=>row.monthly_pc_queries_status==='LT_10'||row.monthly_mobile_queries_status==='LT_10').length;
  const exact=rows.filter(row=>row.monthly_pc_queries_status==='EXACT'||row.monthly_mobile_queries_status==='EXACT').length;
  const highCompetition=rows.filter(row=>row.competition==='high').length;
  return {data_status:exact?'READY':'PARTIAL',summary:{keyword_count:rows.length,exact_query_count:exact,less_than_ten_count:lessThanTen,high_competition_count:highCompetition}};
}

function estimatePayload(payload){return Array.isArray(payload?.estimate)?payload.estimate:Array.isArray(payload)?payload:[];}
function estimateMap(payload){
  const result=new Map();
  for(const item of estimatePayload(payload)){
    const keyword=cleanText(item?.keyword||item?.key,80),key=normalizedKey(keyword),bid=Number(item?.bid);
    if(key&&Number.isFinite(bid))result.set(key,{keyword,bid,position:Number.isFinite(Number(item?.position))?Number(item.position):null});
  }
  return result;
}

function mergeBidEstimateRows({keywords,averagePc,averageMobile,minimumPc,minimumMobile}){
  const maps={averagePc:estimateMap(averagePc),averageMobile:estimateMap(averageMobile),minimumPc:estimateMap(minimumPc),minimumMobile:estimateMap(minimumMobile)};
  return keywords.map(keyword=>{
    const key=normalizedKey(keyword);
    return {
      keyword,normalized_keyword:key,
      pc_average_position_bid:maps.averagePc.get(key)?.bid??null,
      mobile_average_position_bid:maps.averageMobile.get(key)?.bid??null,
      pc_exposure_minimum_bid:maps.minimumPc.get(key)?.bid??null,
      mobile_exposure_minimum_bid:maps.minimumMobile.get(key)?.bid??null
    };
  });
}

function summarizeBidRows(rows,{successfulSources=0,totalSources=4}={}){
  const complete=rows.filter(row=>[row.pc_average_position_bid,row.mobile_average_position_bid,row.pc_exposure_minimum_bid,row.mobile_exposure_minimum_bid].every(value=>Number.isFinite(value))).length;
  const withAny=rows.filter(row=>[row.pc_average_position_bid,row.mobile_average_position_bid,row.pc_exposure_minimum_bid,row.mobile_exposure_minimum_bid].some(value=>Number.isFinite(value))).length;
  return {
    data_status:withAny===0?'NO_DATA':successfulSources===totalSources&&complete===rows.length?'READY':'PARTIAL',
    summary:{keyword_count:rows.length,complete_keyword_count:complete,estimated_keyword_count:withAny,successful_sources:successfulSources,total_sources:totalSources}
  };
}

const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function startLog(db,jobType,metadata){
  const result=await db.from('sync_logs').insert({platform:'NAVER',job_type:jobType,status:'RUNNING',metadata}).select('id').single();
  return result.error?null:result.data.id;
}
async function finishLog(db,id,values){if(id)await db.from('sync_logs').update({finished_at:new Date().toISOString(),...values}).eq('id',id);}
async function resolveProject(db,projectId){return projects.loadProject({db,projectId});}

async function saveProfile({db,projectId,input,actor='OWNER'}){
  const {project,product}=await resolveProject(db,projectId);
  const profile=normalizeProfile(input,{productName:product?.name||project.product_snapshot?.name});
  const result=await db.from('market_naver_ad_research_profiles').upsert({
    project_id:project.id,master_product_id:project.master_product_id,...profile,created_by:cleanText(actor,160)||'OWNER'
  },{onConflict:'project_id'}).select('*').single();
  if(result.error)throw result.error;
  return {project,product,profile:result.data};
}

async function latestSnapshots(db,projectId){
  const result=await db.from('market_naver_ad_research_snapshots').select('*').eq('project_id',projectId).order('fetched_at',{ascending:false}).limit(20);
  if(result.error)throw result.error;
  const latest={};
  for(const row of result.data||[])if(!latest[row.snapshot_kind])latest[row.snapshot_kind]=row;
  return latest;
}

function decorateSnapshot(row){
  if(!row)return null;
  const ageMs=Date.now()-new Date(row.fetched_at).getTime();
  const staleAfter=row.snapshot_kind==='BID_ESTIMATE'?24*60*60*1000:7*24*60*60*1000;
  return {...row,is_stale:Number.isFinite(ageMs)&&ageMs>staleAfter,estimate_notice:row.snapshot_kind==='BID_ESTIMATE'?'네이버의 시점별 예상 CPC이며 실제 순위·비용을 보장하지 않습니다.':'최근 30일 검색량과 최근 4주 광고 클릭 통계입니다.'};
}

async function loadOperationalLinks(db,masterProductId){
  const links=await db.from('naver_keyword_product_links').select('ncc_keyword_id').eq('master_product_id',masterProductId).limit(500);
  if(links.error)throw links.error;
  const ids=(links.data||[]).map(item=>item.ncc_keyword_id).filter(Boolean);
  if(!ids.length)return [];
  const keywords=await db.from('naver_keywords').select('ncc_keyword_id,keyword,bid_amount,status,updated_at').in('ncc_keyword_id',ids).limit(500);
  if(keywords.error)throw keywords.error;
  return keywords.data||[];
}

async function loadWorkbench({db,projectId}){
  const {project,product}=await resolveProject(db,projectId);
  const [profileResult,snapshots,operationalKeywords]=await Promise.all([
    db.from('market_naver_ad_research_profiles').select('*').eq('project_id',project.id).maybeSingle(),
    latestSnapshots(db,project.id),
    loadOperationalLinks(db,project.master_product_id)
  ]);
  if(profileResult.error)throw profileResult.error;
  const defaultProfile=normalizeProfile(profileResult.data||{},{productName:product?.name||project.product_snapshot?.name});
  let configured=true;
  try{naverAds.config();}catch{configured=false;}
  return {
    product:{id:project.master_product_id,name:product?.name||project.product_snapshot?.name||'선택 상품'},
    profile:profileResult.data||{project_id:project.id,master_product_id:project.master_product_id,...defaultProfile},
    snapshots:Object.fromEntries(SNAPSHOT_KINDS.map(kind=>[kind,decorateSnapshot(snapshots[kind])])),
    operational_keywords:operationalKeywords.map(item=>({...item,normalized_keyword:normalizedKey(item.keyword)})),
    readiness:{configured,estimate_ready:Boolean(profileResult.data?.owner_confirmed&&profileResult.data?.selected_keywords?.length)},
    operation_href:'/keywords/naver'
  };
}

async function storeSnapshot({db,project,profile,kind,requestFingerprint,rows,summary,dataStatus,sourceEndpoints,actor}){
  const stored=await db.from('market_naver_ad_research_snapshots').upsert({
    project_id:project.id,master_product_id:project.master_product_id,profile_id:project.id,snapshot_kind:kind,
    request_fingerprint:requestFingerprint,seed_keywords:profile.seed_keywords,selected_keywords:profile.selected_keywords,
    target_position:kind==='BID_ESTIMATE'?profile.target_position:null,estimate_period:kind==='BID_ESTIMATE'?profile.estimate_period:null,
    rows,summary,data_status:dataStatus,source_endpoints:sourceEndpoints,owner_confirmed:false,confirmed_at:null,
    fetched_at:new Date().toISOString(),created_by:cleanText(actor,160)||'OWNER'
  },{onConflict:'project_id,snapshot_kind,request_fingerprint'}).select('*').single();
  if(stored.error)throw stored.error;
  return decorateSnapshot(stored.data);
}

async function discoverKeywords({db,projectId,input,actor='OWNER'}){
  const saved=await saveProfile({db,projectId,input,actor});
  const requestSeeds=saved.profile.seed_keywords.map(keyword=>keyword.replace(/\s+/gu,''));
  const logId=await startLog(db,'SEARCH_AD_KEYWORD_TOOL',{project_id:saved.project.id,master_product_id:saved.project.master_product_id,seed_keyword_count:requestSeeds.length});
  try{
    const response=await naverAds.request('GET','/keywordstool',{hintKeywords:requestSeeds.join(','),showDetail:1});
    const rows=normalizeKeywordToolRows(response.data,saved.profile.seed_keywords),computed=summarizeKeywordRows(rows);
    const snapshot=await storeSnapshot({db,project:saved.project,profile:saved.profile,kind:'KEYWORD_TOOL',requestFingerprint:fingerprint({kind:'KEYWORD_TOOL',seeds:requestSeeds}),rows,summary:computed.summary,dataStatus:computed.data_status,sourceEndpoints:['GET /keywordstool'],actor});
    await finishLog(db,logId,{status:'SUCCESS',rows_received:rows.length,metadata:{project_id:saved.project.id,master_product_id:saved.project.master_product_id,data_status:computed.data_status,source:'GET /keywordstool'}});
    return {profile:saved.profile,snapshot};
  }catch(error){
    await finishLog(db,logId,{status:'FAILED',rows_received:0,error_message:cleanText(error?.message||'키워드 탐색 실패',500),metadata:{project_id:saved.project.id,master_product_id:saved.project.master_product_id,code:error?.code||'KEYWORD_TOOL_FAILED'}});
    throw new MarketNaverAdResearchError(cleanText(error?.message||'네이버 키워드 도구를 불러오지 못했습니다.'),Number(error?.status)||502,error?.code||'NAVER_KEYWORD_TOOL_FAILED');
  }
}

async function estimateBids({db,projectId,input,actor='OWNER'}){
  const saved=await saveProfile({db,projectId,input,actor}),keywords=saved.profile.selected_keywords;
  if(!keywords.length)throw new MarketNaverAdResearchError('입찰가를 예상할 검색어를 1개 이상 선택해주세요.');
  if(!saved.profile.owner_confirmed)throw new MarketNaverAdResearchError('선택한 검색어가 이 상품에 맞는지 먼저 직접 확인해주세요.',409,'OWNER_CONFIRMATION_REQUIRED');
  const logId=await startLog(db,'SEARCH_AD_BID_ESTIMATE',{project_id:saved.project.id,master_product_id:saved.project.master_product_id,keyword_count:keywords.length,target_position:saved.profile.target_position});
  const specs=[
    {key:'averagePc',endpoint:'/estimate/average-position-bid/keyword',body:{device:'PC',items:keywords.map(key=>({key,position:saved.profile.target_position}))}},
    {key:'averageMobile',endpoint:'/estimate/average-position-bid/keyword',body:{device:'MOBILE',items:keywords.map(key=>({key,position:saved.profile.target_position}))}},
    {key:'minimumPc',endpoint:'/estimate/exposure-minimum-bid/keyword',body:{device:'PC',period:saved.profile.estimate_period,items:keywords}},
    {key:'minimumMobile',endpoint:'/estimate/exposure-minimum-bid/keyword',body:{device:'MOBILE',period:saved.profile.estimate_period,items:keywords}}
  ];
  const settled=await Promise.allSettled(specs.map(spec=>naverAds.request('POST',spec.endpoint,null,spec.body)));
  const payloads={},errors=[],sourceEndpoints=[];
  settled.forEach((result,index)=>{
    const spec=specs[index];
    if(result.status==='fulfilled'){payloads[spec.key]=result.value.data;sourceEndpoints.push(`POST ${spec.endpoint} · ${spec.body.device}`);}
    else errors.push({source:spec.key,message:cleanText(result.reason?.message||'예상치 조회 실패',240),code:result.reason?.code||'BID_ESTIMATE_FAILED'});
  });
  if(!sourceEndpoints.length){
    const first=settled[0]?.reason;
    await finishLog(db,logId,{status:'FAILED',rows_received:0,error_message:cleanText(first?.message||'입찰 예상 실패',500),metadata:{project_id:saved.project.id,master_product_id:saved.project.master_product_id,errors}});
    throw new MarketNaverAdResearchError(cleanText(first?.message||'네이버 입찰 예상치를 불러오지 못했습니다.'),Number(first?.status)||502,first?.code||'NAVER_BID_ESTIMATE_FAILED');
  }
  const rows=mergeBidEstimateRows({keywords,...payloads}),computed=summarizeBidRows(rows,{successfulSources:sourceEndpoints.length,totalSources:specs.length});
  const snapshot=await storeSnapshot({db,project:saved.project,profile:saved.profile,kind:'BID_ESTIMATE',requestFingerprint:fingerprint({kind:'BID_ESTIMATE',keywords,target_position:saved.profile.target_position,period:saved.profile.estimate_period}),rows,summary:{...computed.summary,errors},dataStatus:computed.data_status,sourceEndpoints,actor});
  await finishLog(db,logId,{status:errors.length?'PARTIAL':'SUCCESS',rows_received:computed.summary.estimated_keyword_count,metadata:{project_id:saved.project.id,master_product_id:saved.project.master_product_id,data_status:computed.data_status,successful_sources:sourceEndpoints.length,errors}});
  return {profile:saved.profile,snapshot,errors};
}

async function confirmSnapshot({db,projectId,snapshotId,confirmed=true}){
  const {project}=await resolveProject(db,projectId),id=projects.requiredUuid(snapshotId,'스냅샷');
  const result=await db.from('market_naver_ad_research_snapshots').update({owner_confirmed:Boolean(confirmed),confirmed_at:confirmed?new Date().toISOString():null}).eq('id',id).eq('project_id',project.id).eq('master_product_id',project.master_product_id).select('*').maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw new MarketNaverAdResearchError('확인할 네이버 광고 자료를 찾지 못했습니다.',404,'SNAPSHOT_NOT_FOUND');
  return decorateSnapshot(result.data);
}

module.exports={
  MarketNaverAdResearchError,ESTIMATE_PERIODS,MAX_DISCOVERY_ROWS,MAX_SELECTED_KEYWORDS,cleanText,normalizedKey,normalizeList,
  normalizeProfile,parseMetric,normalizeKeywordToolRows,summarizeKeywordRows,mergeBidEstimateRows,summarizeBidRows,fingerprint,
  saveProfile,loadWorkbench,discoverKeywords,estimateBids,confirmSnapshot
};
