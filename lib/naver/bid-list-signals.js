'use strict';

const naverClient=require('./client.js');
const analysis=require('./bid-performance-analysis.js');

const FORMULA_VERSION='phase24-15-bid-list-signals-v1';
const MAX_KEYWORDS=36;
const MAX_CONCURRENT_PROBES=3;

const text=value=>String(value??'').trim();
const number=value=>{
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};

function inputError(message,code){
  return Object.assign(new Error(message),{status:400,code});
}

function validateKeywordIds(value){
  const source=Array.isArray(value)?value:String(value??'').split(',');
  const ids=Array.from(new Set(source.map(text).filter(Boolean)));
  if(!ids.length)throw inputError('현재 화면에서 확인할 네이버 키워드가 없습니다.','NAVER_KEYWORD_IDS_REQUIRED');
  if(ids.length>MAX_KEYWORDS)throw inputError(`한 번에 최대 ${MAX_KEYWORDS}개 키워드만 확인할 수 있습니다.`,'TOO_MANY_NAVER_KEYWORD_IDS');
  if(ids.some(id=>!/^[A-Za-z0-9_-]{1,120}$/.test(id)))throw inputError('네이버 키워드 식별자를 다시 확인해주세요.','INVALID_NAVER_KEYWORD_ID');
  return ids;
}

function kstDateKey(value){
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(value,days){
  const date=new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function entityRows(entities){
  if(Array.isArray(entities))return entities;
  if(Array.isArray(entities?.data))return entities.data;
  return entities&&typeof entities==='object'?[entities]:[];
}

function entityId(entity,index,keywordIds){
  return text(entity?.id||entity?.nccKeywordId||entity?.ncc_keyword_id||keywordIds[index]);
}

async function mapLimit(items,limit,worker){
  const results=new Array(items.length);
  let nextIndex=0;
  async function run(){
    while(nextIndex<items.length){
      const index=nextIndex;
      nextIndex+=1;
      results[index]=await worker(items[index],index);
    }
  }
  const workerCount=Math.min(Math.max(1,limit),items.length);
  await Promise.all(Array.from({length:workerCount},run));
  return results;
}

function buildBidListSignals({entities=[],rules=[],keywordIds=[]}={}){
  const ids=validateKeywordIds(keywordIds);
  const ruleMap=new Map((rules||[]).map(rule=>[text(rule?.ncc_keyword_id||rule?.nccKeywordId),rule]));
  const entityMap=new Map();
  entityRows(entities).forEach((entity,index)=>{
    const id=entityId(entity,index,ids);
    if(id&&ids.includes(id))entityMap.set(id,entity);
  });
  return ids.map(id=>{
    const metrics=analysis.responsePoints(entityMap.get(id)).map(analysis.pointMetrics);
    const targetRank=number(ruleMap.get(id)?.target_rank);
    const hitRate=analysis.targetHitRate(metrics,targetRank);
    const competition=analysis.competitionStrength(metrics);
    return {
      ncc_keyword_id:id,
      target_rank:targetRank,
      hit_rate:hitRate,
      competition,
      status:hitRate.status==='READY'?'READY':hitRate.status,
      notice:'경쟁 강도는 경쟁사 실제 입찰가가 아니라 최근 7일 네이버 평균순위 변동성으로 만든 운영 신호입니다.'
    };
  });
}

async function loadBidListSignals({db,api=naverClient,keywordIds,now=new Date()}={}){
  if(!db)throw Object.assign(new Error('데이터베이스 연결이 필요합니다.'),{status:503,code:'DATABASE_REQUIRED'});
  const ids=validateKeywordIds(keywordIds);
  const ruleResult=await db.from('naver_bid_keyword_rules').select('ncc_keyword_id,target_rank,enabled,updated_at').in('ncc_keyword_id',ids);
  if(ruleResult.error)throw ruleResult.error;
  // Search Ads daily ranks are finalized through the previous KST day.
  // Including the still-open current day makes /stats reject the whole batch.
  const until=shiftDate(kstDateKey(now),-1),since=shiftDate(until,-6);
  // Naver responds with provider code 11001 for the batched combination of
  // multiple keyword ids and daily average-rank time series. Keep the request
  // scoped to the visible page, probe one keyword at a time, and cap pressure.
  const entities=await mapLimit(ids,MAX_CONCURRENT_PROBES,async id=>{
    const response=await api.request('GET','/stats',{id,fields:['avgRnk'],timeRange:{since,until},timeIncrement:1});
    const rows=entityRows(response.data);
    const entity=rows.find(row=>entityId(row,0,[id])===id)||rows[0];
    return entity?{...entity,id:entityId(entity,0,[id])||id}:{id,data:[]};
  });
  return {
    platform:'NAVER',
    formula_version:FORMULA_VERSION,
    period:{since,until},
    signals:buildBidListSignals({entities,rules:ruleResult.data||[],keywordIds:ids})
  };
}

module.exports={FORMULA_VERSION,MAX_KEYWORDS,MAX_CONCURRENT_PROBES,validateKeywordIds,buildBidListSignals,loadBidListSignals};
