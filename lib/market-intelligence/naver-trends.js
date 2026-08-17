'use strict';

const crypto=require('node:crypto');
const projects=require('./projects.js');
const naverApiHub=require('../naver-api-hub/client.js');

const PERIOD_DAYS=new Set([7,30,90,180,365]);
const TIME_UNITS=new Set(['date','week','month']);
const SNAPSHOT_KINDS=['SEARCH_TREND','SHOPPING_KEYWORD'];

class MarketNaverTrendError extends Error{
  constructor(message,status=400,code='MARKET_NAVER_TREND_INVALID'){
    super(message);this.name='MarketNaverTrendError';this.status=status;this.code=code;
  }
}

const cleanText=(value,max=160)=>String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);

function normalizeKeywords(value,{fallback=[]}={}){
  const source=Array.isArray(value)?value:String(value||'').split(/[\n,]/u);
  const normalized=[...new Set(source.map(item=>cleanText(item,80)).filter(Boolean))].slice(0,5);
  if(normalized.length)return normalized;
  const safeFallback=[...new Set(fallback.map(item=>cleanText(item,80)).filter(Boolean))].slice(0,5);
  if(!safeFallback.length)throw new MarketNaverTrendError('비교할 검색어를 1개 이상 입력해주세요.');
  return safeFallback;
}

function productKeyword(productName){
  const raw=cleanText(productName,120);
  const stripped=raw
    .replace(/\([^)]*\)/gu,' ')
    .replace(/(?:haccp|해썹인증|국내산|대용량|티백형|티백)/giu,' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|tb|개|팩|포|봉)\b/giu,' ')
    .replace(/\s+/gu,' ').trim();
  return (stripped||raw||'선택 상품').slice(0,80);
}

function normalizeProfile(input,{productName}={}){
  const fallback=productKeyword(productName);
  const topicName=cleanText(input?.topic_name||fallback,120);
  const keywords=normalizeKeywords(input?.keywords,{fallback:[fallback]});
  const code=cleanText(input?.shopping_category_code,8);
  if(code&&!/^\d{8}$/u.test(code))throw new MarketNaverTrendError('네이버 쇼핑 카테고리 코드는 숫자 8자리로 입력해주세요.');
  const periodDays=Number(input?.period_days||90);
  const timeUnit=cleanText(input?.time_unit||'date',12);
  if(!PERIOD_DAYS.has(periodDays))throw new MarketNaverTrendError('조회 기간을 다시 선택해주세요.');
  if(!TIME_UNITS.has(timeUnit))throw new MarketNaverTrendError('조회 단위를 다시 선택해주세요.');
  return {
    topic_name:topicName||fallback,keywords,
    shopping_category_code:code||null,
    shopping_category_name:code?cleanText(input?.shopping_category_name||'직접 선택 카테고리',120):null,
    period_days:periodDays,time_unit:timeUnit,owner_confirmed:Boolean(input?.owner_confirmed)
  };
}

function dateKey(value){return value.toISOString().slice(0,10);}
function dateRange(periodDays,now=new Date()){
  const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-1));
  const start=new Date(end);start.setUTCDate(start.getUTCDate()-(periodDays-1));
  return {startDate:dateKey(start),endDate:dateKey(end)};
}

function normalizePoints(data){
  if(!Array.isArray(data))return [];
  return data.map(item=>{
    const period=cleanText(item?.period,20),ratio=Number(item?.ratio);
    return period&&Number.isFinite(ratio)?{period,ratio}:null;
  }).filter(Boolean).sort((a,b)=>a.period.localeCompare(b.period));
}

function normalizeSeries(payload,requestedKeywords){
  const results=Array.isArray(payload?.results)?payload.results:[];
  return results.map((item,index)=>({
    label:cleanText(item?.title||item?.keyword||requestedKeywords[index]||`검색어 ${index+1}`,80),
    keywords:(Array.isArray(item?.keywords)?item.keywords:Array.isArray(item?.keyword)?item.keyword:[item?.keyword||requestedKeywords[index]]).map(value=>cleanText(value,80)).filter(Boolean),
    points:normalizePoints(item?.data)
  })).filter(item=>item.label);
}

function summarizeSeries(series,requestedKeywords){
  const values=series.flatMap(item=>item.points.map(point=>point.ratio));
  const missingKeywords=requestedKeywords.filter(keyword=>!series.some(item=>item.label===keyword&&item.points.length));
  if(!values.length)return {data_status:'NO_DATA',summary:{series_count:series.length,point_count:0,missing_keywords:requestedKeywords}};
  const seriesSummary=series.map(item=>{
    const ratios=item.points.map(point=>point.ratio),first=ratios[0],latest=ratios.at(-1),average=ratios.reduce((sum,value)=>sum+value,0)/Math.max(1,ratios.length);
    return {label:item.label,point_count:ratios.length,latest_ratio:latest??null,peak_ratio:ratios.length?Math.max(...ratios):null,average_ratio:ratios.length?Number(average.toFixed(2)):null,change_ratio_points:ratios.length?Number((latest-first).toFixed(2)):null};
  });
  return {data_status:missingKeywords.length?'PARTIAL':'READY',summary:{
    series_count:series.length,point_count:values.length,peak_ratio:Math.max(...values),series:seriesSummary,missing_keywords:missingKeywords
  }};
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
  const result=await db.from('market_naver_trend_profiles').upsert({
    project_id:project.id,master_product_id:project.master_product_id,...profile,created_by:cleanText(actor,160)||'OWNER'
  },{onConflict:'project_id'}).select('*').single();
  if(result.error)throw result.error;
  return {project,product,profile:result.data};
}

async function latestSnapshots(db,projectId){
  const result=await db.from('market_naver_trend_snapshots').select('*').eq('project_id',projectId).order('fetched_at',{ascending:false}).limit(20);
  if(result.error)throw result.error;
  const latest={};
  for(const row of result.data||[])if(!latest[row.snapshot_kind])latest[row.snapshot_kind]=row;
  return latest;
}

function decorateSnapshot(row){
  if(!row)return null;
  const ageMs=Date.now()-new Date(row.fetched_at).getTime();
  return {...row,is_stale:Number.isFinite(ageMs)&&ageMs>72*60*60*1000,metric_notice:'상대지수 · 구간 내 최고값 100 · 실제 검색량/클릭수 아님'};
}

async function loadWorkbench({db,projectId}){
  const {project,product}=await resolveProject(db,projectId);
  const [profileResult,snapshots]=await Promise.all([
    db.from('market_naver_trend_profiles').select('*').eq('project_id',project.id).maybeSingle(),
    latestSnapshots(db,project.id)
  ]);
  if(profileResult.error)throw profileResult.error;
  const defaultProfile=normalizeProfile(profileResult.data||{},{productName:product?.name||project.product_snapshot?.name});
  return {
    product:{id:project.master_product_id,name:product?.name||project.product_snapshot?.name||'선택 상품'},
    profile:profileResult.data||{project_id:project.id,master_product_id:project.master_product_id,...defaultProfile},
    snapshots:Object.fromEntries(SNAPSHOT_KINDS.map(kind=>[kind,decorateSnapshot(snapshots[kind])] )),
    readiness:{configured:Boolean(process.env.NAVER_API_HUB_CLIENT_ID&&process.env.NAVER_API_HUB_CLIENT_SECRET),shopping_ready:Boolean(profileResult.data?.shopping_category_code&&profileResult.data?.owner_confirmed)}
  };
}

async function collectOne({db,project,profile,kind,range,actor}){
  const jobType=kind==='SEARCH_TREND'?'API_HUB_SEARCH_TREND_COLLECT':'API_HUB_SHOPPING_INSIGHT_COLLECT';
  const endpoint=kind==='SEARCH_TREND'?'SEARCH_TREND':'SHOPPING_INSIGHT_KEYWORD';
  const requestBody={startDate:range.startDate,endDate:range.endDate,timeUnit:profile.time_unit,keywords:profile.keywords,...(kind==='SHOPPING_KEYWORD'?{category:profile.shopping_category_code}:{})};
  const logId=await startLog(db,jobType,{project_id:project.id,master_product_id:project.master_product_id,period:range,keyword_count:profile.keywords.length});
  try{
    const response=kind==='SEARCH_TREND'
      ?await naverApiHub.fetchSearchTrend({...range,timeUnit:profile.time_unit,keywordGroups:profile.keywords.map(keyword=>({groupName:keyword,keywords:[keyword]}))})
      :await naverApiHub.fetchShoppingKeywordTrend({...range,timeUnit:profile.time_unit,category:profile.shopping_category_code,keywords:profile.keywords});
    const series=normalizeSeries(response.data,profile.keywords),computed=summarizeSeries(series,profile.keywords);
    const row={
      project_id:project.id,master_product_id:project.master_product_id,profile_id:project.id,snapshot_kind:kind,
      request_fingerprint:fingerprint({kind,...requestBody}),topic_name:profile.topic_name,keywords:profile.keywords,
      shopping_category_code:kind==='SHOPPING_KEYWORD'?profile.shopping_category_code:null,
      shopping_category_name:kind==='SHOPPING_KEYWORD'?profile.shopping_category_name:null,
      period_start:range.startDate,period_end:range.endDate,time_unit:profile.time_unit,series,summary:computed.summary,
      data_status:computed.data_status,source_endpoint:endpoint,owner_confirmed:false,confirmed_at:null,
      fetched_at:new Date().toISOString(),created_by:cleanText(actor,160)||'OWNER'
    };
    const stored=await db.from('market_naver_trend_snapshots').upsert(row,{onConflict:'project_id,snapshot_kind,request_fingerprint'}).select('*').single();
    if(stored.error)throw stored.error;
    await finishLog(db,logId,{status:'SUCCESS',rows_received:computed.summary.point_count,metadata:{project_id:project.id,master_product_id:project.master_product_id,period:range,data_status:computed.data_status,series_count:computed.summary.series_count}});
    return decorateSnapshot(stored.data);
  }catch(error){
    await finishLog(db,logId,{status:'FAILED',rows_received:0,error_message:cleanText(error?.message||'수집 실패',500),metadata:{project_id:project.id,master_product_id:project.master_product_id,period:range,code:error?.code||'COLLECT_FAILED'}});
    throw error;
  }
}

async function collectTrends({db,projectId,input,actor='OWNER',now=new Date()}){
  const saved=await saveProfile({db,projectId,input,actor}),range=dateRange(saved.profile.period_days,now);
  const tasks=[{kind:'SEARCH_TREND'}];
  if(saved.profile.shopping_category_code&&saved.profile.owner_confirmed)tasks.push({kind:'SHOPPING_KEYWORD'});
  const settled=await Promise.allSettled(tasks.map(task=>collectOne({db,project:saved.project,profile:saved.profile,range,actor,...task})));
  const results={},errors=[];
  settled.forEach((result,index)=>{const kind=tasks[index].kind;if(result.status==='fulfilled')results[kind]=result.value;else errors.push({kind,message:cleanText(result.reason?.message||'수집 실패',240),code:result.reason?.code||'COLLECT_FAILED'});});
  if(!results.SEARCH_TREND&&errors.length===tasks.length){
    const first=settled[0]?.reason;
    throw new MarketNaverTrendError(cleanText(first?.message||'네이버 트렌드 수집에 실패했습니다.'),Number(first?.status)||502,first?.code||'NAVER_TREND_COLLECT_FAILED');
  }
  return {profile:saved.profile,range,results,errors,shopping_skipped:!saved.profile.shopping_category_code||!saved.profile.owner_confirmed};
}

async function confirmSnapshot({db,projectId,snapshotId,confirmed=true}){
  const {project}=await resolveProject(db,projectId),id=projects.requiredUuid(snapshotId,'스냅샷');
  const result=await db.from('market_naver_trend_snapshots').update({owner_confirmed:Boolean(confirmed),confirmed_at:confirmed?new Date().toISOString():null}).eq('id',id).eq('project_id',project.id).eq('master_product_id',project.master_product_id).select('*').maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw new MarketNaverTrendError('확인할 트렌드 자료를 찾지 못했습니다.',404,'SNAPSHOT_NOT_FOUND');
  return decorateSnapshot(result.data);
}

module.exports={
  MarketNaverTrendError,PERIOD_DAYS,TIME_UNITS,normalizeKeywords,productKeyword,normalizeProfile,dateRange,
  normalizePoints,normalizeSeries,summarizeSeries,fingerprint,saveProfile,loadWorkbench,collectTrends,confirmSnapshot
};
