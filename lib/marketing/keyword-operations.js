'use strict';

const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const numeric=value=>number(value)??0;
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const KEYWORD_PAGE_SIZES=[12,24,36];

function naverRegisteredRows(workbench={}){
  return (workbench.candidates||[]).map(candidate=>({
    id:`NAVER:${candidate.ncc_keyword_id}`,
    platform:'NAVER',
    source:'REGISTERED',
    keyword:text(candidate.keyword)||'키워드 이름 없음',
    campaign:text(candidate.ncc_adgroup_id)||'광고그룹 확인 필요',
    product:text(candidate.product_target?.name)||'상품 연결 필요',
    currentBid:number(candidate.current_bid),
    recommendedBid:number(candidate.recommended_bid),
    minimumBid:number(candidate.minimum_owner_bid),
    maximumBid:number(candidate.maximum_owner_bid),
    impressions:numeric(candidate.metrics?.impressions),
    clicks:numeric(candidate.metrics?.clicks),
    cost:numeric(candidate.metrics?.cost),
    orders:numeric(candidate.metrics?.conversions),
    revenue:numeric(candidate.metrics?.conversion_revenue),
    roas:number(candidate.metrics?.roas),
    actualProfit:null,
    decision:text(candidate.decision)||'BLOCKED',
    status:text(candidate.status)||'BLOCKED',
    canDraft:candidate.can_request_approval===true,
    applicationMode:candidate.can_request_approval===true?'OWNER_APPROVAL':'BLOCKED',
    freshness:candidate.period_end||null,
    reasons:(candidate.reasons||[]).map(item=>text(item.message)).filter(Boolean),
    snapshotToken:candidate.snapshot_token||null
  }));
}

function naverSearchTermRows(center={}){
  return (center.items||[]).map(item=>({
    id:`NAVER_SEARCH:${item.id||item.search_term}`,
    platform:'NAVER',
    source:'SEARCH_TERM',
    keyword:text(item.search_term)||'검색어 없음',
    campaign:text(item.adgroup_name||item.ncc_adgroup_id)||'검색광고',
    product:item.is_registered_exact?'정확 등록됨':'미등록 검색어',
    currentBid:null,recommendedBid:null,minimumBid:null,maximumBid:null,
    impressions:numeric(item.impressions),clicks:numeric(item.clicks),cost:numeric(item.cost),orders:numeric(item.conversions),
    revenue:numeric(item.conversion_revenue),roas:number(item.roas),actualProfit:null,
    decision:text(item.recommended_action)||'OBSERVE',
    status:text(item.action_status)||'REVIEW',
    canDraft:false,applicationMode:'SEARCH_TERM_REVIEW',
    freshness:center.period?.period_end||null,
    classification:text(item.classification),
    reasons:[text(item.action_reason)].filter(Boolean)
  }));
}

function coupangKeywordRows(coupang={}){
  const keyed=new Map();
  for(const item of [...(coupang.adKeywordTop||[]),...(coupang.adKeywordWaste||[])]){
    const key=[item.campaign_id,item.advertised_option_id,item.keyword].map(text).join(':');
    if(keyed.has(key))continue;
    const cost=numeric(item.ad_spend),orders=numeric(item.orders??item.orders_14d),revenue=numeric(item.revenue??item.revenue_14d);
    keyed.set(key,{
      id:`COUPANG:${key||keyed.size}`,
      platform:'COUPANG',source:'REGISTERED',keyword:text(item.keyword)||'키워드 없음',
      campaign:text(item.campaign_name)||'캠페인 확인 필요',
      product:text(item.advertised_product_name)||text(item.converted_product_name)||'상품 연결 확인',
      currentBid:null,recommendedBid:null,minimumBid:null,maximumBid:null,
      impressions:numeric(item.impressions),clicks:numeric(item.clicks),cost,orders,revenue,
      roas:number(item.roas??item.roas_14d)??(cost>0?revenue/cost*100:null),actualProfit:null,
      decision:orders<=0&&cost>0?'LOWER':'WATCH',status:'MANUAL',canDraft:false,applicationMode:'MANUAL_REQUIRED',
      freshness:item.date||item.updated_at||null,
      reasons:['쿠팡 광고 입찰 쓰기 연결이 없어 WING에서 직접 적용해야 합니다.']
    });
  }
  return [...keyed.values()];
}

function historyRows(changes=[]){
  return changes.filter(item=>upper(item.change_type)==='NAVER_BID'&&upper(item.platform)==='NAVER').map((item,index)=>({
    id:`HISTORY:${item.id||index}`,platform:'NAVER',source:'HISTORY',
    keyword:text(item.impact_preview?.metadata?.keyword)||text(item.target_key)||'네이버 키워드',campaign:'네이버 입찰 변경',product:text(item.impact_preview?.metadata?.product_target?.name)||'-',
    currentBid:number(item.before_value?.values?.bid_amount??item.before_value?.bid_amount),recommendedBid:number(item.proposed_value?.values?.bid_amount??item.proposed_value?.bid_amount),
    observedBid:number(item.verification_result?.actual?.values?.bid_amount),
    minimumBid:null,maximumBid:null,impressions:0,clicks:0,cost:0,orders:0,revenue:0,roas:null,actualProfit:null,
    decision:'HISTORY',status:upper(item.status)||'HISTORY',canDraft:false,applicationMode:'HISTORY',freshness:item.verified_at||item.executed_at||item.created_at||null,
    reasons:[text(item.error_message),item.status==='VERIFIED'?'네이버 현재 입찰가를 다시 조회해 승인 값과 일치함을 확인했습니다.':''].filter(Boolean)
  }));
}

function normalizeKeywordRows({naverBidWorkbench={},searchTermCenter={},coupang={},financialChanges=[],workspace='registered',platform='naver'}={}){
  let rows=workspace==='search-terms'?naverSearchTermRows(searchTermCenter):workspace==='history'?historyRows(financialChanges):[...naverRegisteredRows(naverBidWorkbench),...coupangKeywordRows(coupang)];
  if(workspace==='diagnosis')rows=rows.filter(item=>['LOWER','RAISE','BLOCKED'].includes(item.decision)||item.status==='MANUAL');
  if(platform!=='all')rows=rows.filter(item=>item.platform===upper(platform));
  return rows;
}

function filterKeywordRows(rows=[],{query='',quickFilter='ALL',sort='COST_DESC'}={}){
  const keyword=upper(query);
  let filtered=rows.filter(item=>!keyword||upper(`${item.keyword} ${item.campaign} ${item.product}`).includes(keyword));
  if(quickFilter==='NO_ORDER_COST')filtered=filtered.filter(item=>item.cost>0&&item.orders<=0);
  if(quickFilter==='LOW_ROAS')filtered=filtered.filter(item=>item.roas!=null&&item.roas<700);
  if(quickFilter==='READY')filtered=filtered.filter(item=>item.canDraft);
  if(quickFilter==='MANUAL')filtered=filtered.filter(item=>item.applicationMode==='MANUAL_REQUIRED');
  const compare={COST_DESC:(a,b)=>b.cost-a.cost,CLICKS_DESC:(a,b)=>b.clicks-a.clicks,ROAS_DESC:(a,b)=>(b.roas??-1)-(a.roas??-1),KEYWORD_ASC:(a,b)=>a.keyword.localeCompare(b.keyword,'ko')}[sort]||((a,b)=>b.cost-a.cost);
  return [...filtered].sort(compare);
}

function paginateKeywordRows(rows=[],page=1,pageSize=KEYWORD_PAGE_SIZES[0]){
  const size=KEYWORD_PAGE_SIZES.includes(Number(pageSize))?Number(pageSize):KEYWORD_PAGE_SIZES[0];
  const totalPages=Math.max(1,Math.ceil(rows.length/size));
  const current=Math.min(totalPages,Math.max(1,Number(page)||1));
  return {items:rows.slice((current-1)*size,current*size),page:current,pageSize:size,total:rows.length,totalPages};
}

function keywordOperationSummary(rows=[]){
  return {total:rows.length,ready:rows.filter(item=>item.canDraft).length,noOrderCost:rows.filter(item=>item.cost>0&&item.orders<=0).reduce((sum,item)=>sum+item.cost,0),manual:rows.filter(item=>item.applicationMode==='MANUAL_REQUIRED').length};
}

module.exports={KEYWORD_PAGE_SIZES,normalizeKeywordRows,filterKeywordRows,paginateKeywordRows,keywordOperationSummary,naverRegisteredRows,naverSearchTermRows,coupangKeywordRows,historyRows};
