'use strict';

const number=value=>{if(value===null||value===undefined||value==='')return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const numeric=value=>number(value)??0;
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const operationalState=(status,userLock=false)=>{
  const normalized=upper(status);
  if(userLock===true||(normalized&&normalized!=='ELIGIBLE'))return 'INACTIVE';
  if(normalized==='ELIGIBLE')return 'ACTIVE';
  return 'UNKNOWN';
};
const combinedOperationalState=(...states)=>{
  const normalized=states.filter(Boolean);
  if(normalized.includes('INACTIVE'))return 'INACTIVE';
  if(normalized.length&&normalized.every(state=>state==='ACTIVE'))return 'ACTIVE';
  return 'UNKNOWN';
};
const KEYWORD_PAGE_SIZES=[12,24,36];
const DEFAULT_KEYWORD_VIEW={quickFilter:'ALL',sort:'COST_DESC',pageSize:KEYWORD_PAGE_SIZES[0]};
const KEYWORD_SORT_OPTIONS=[
  {value:'COST_DESC',label:'광고비 높은 순',field:'COST',direction:'DESC'},
  {value:'COST_ASC',label:'광고비 낮은 순',field:'COST',direction:'ASC'},
  {value:'CURRENT_BID_DESC',label:'현재 입찰가 높은 순',field:'CURRENT_BID',direction:'DESC',naverOnly:true},
  {value:'CURRENT_BID_ASC',label:'현재 입찰가 낮은 순',field:'CURRENT_BID',direction:'ASC',naverOnly:true},
  {value:'RECOMMENDED_BID_DESC',label:'추천 입찰가 높은 순',field:'RECOMMENDED_BID',direction:'DESC',naverOnly:true},
  {value:'RECOMMENDED_BID_ASC',label:'추천 입찰가 낮은 순',field:'RECOMMENDED_BID',direction:'ASC',naverOnly:true},
  {value:'CLICKS_DESC',label:'클릭 많은 순',field:'CLICKS',direction:'DESC'},
  {value:'CLICKS_ASC',label:'클릭 적은 순',field:'CLICKS',direction:'ASC'},
  {value:'ORDERS_DESC',label:'주문 많은 순',field:'ORDERS',direction:'DESC'},
  {value:'ORDERS_ASC',label:'주문 적은 순',field:'ORDERS',direction:'ASC'},
  {value:'ROAS_DESC',label:'ROAS 높은 순',field:'ROAS',direction:'DESC'},
  {value:'ROAS_ASC',label:'ROAS 낮은 순',field:'ROAS',direction:'ASC'},
  {value:'KEYWORD_ASC',label:'키워드 가나다 순',field:'KEYWORD',direction:'ASC'},
  {value:'KEYWORD_DESC',label:'키워드 역순',field:'KEYWORD',direction:'DESC'}
];
const KEYWORD_SORT_CONFIG={
  COST_DESC:['cost','DESC','number'],COST_ASC:['cost','ASC','number'],
  CURRENT_BID_DESC:['currentBid','DESC','number'],CURRENT_BID_ASC:['currentBid','ASC','number'],
  RECOMMENDED_BID_DESC:['recommendedBid','DESC','number'],RECOMMENDED_BID_ASC:['recommendedBid','ASC','number'],
  CLICKS_DESC:['clicks','DESC','number'],CLICKS_ASC:['clicks','ASC','number'],
  ORDERS_DESC:['orders','DESC','number'],ORDERS_ASC:['orders','ASC','number'],
  ROAS_DESC:['roas','DESC','number'],ROAS_ASC:['roas','ASC','number'],
  KEYWORD_ASC:['keyword','ASC','text'],KEYWORD_DESC:['keyword','DESC','text']
};
const KEYWORD_QUICK_FILTERS={
  naver:['ALL','ACTIVE_ADS','INACTIVE_ADS','NO_ORDER_COST','LOW_ROAS','READY'],
  coupang:['ALL','NO_ORDER_COST','LOW_ROAS','MANUAL']
};
const KEYWORD_QUICK_FILTER_LABELS={
  ACTIVE_ADS:'운영 중 광고',INACTIVE_ADS:'사용중지 광고',NO_ORDER_COST:'광고비 사용·주문 0',LOW_ROAS:'ROAS 700% 미만',READY:'변경 가능한 키워드',MANUAL:'WING 수동 적용'
};

function normalizeKeywordView(platform='naver',settings={}){
  const scopedPlatform=platform==='coupang'?'coupang':'naver';
  const quickFilter=KEYWORD_QUICK_FILTERS[scopedPlatform].includes(settings?.quickFilter)?settings.quickFilter:DEFAULT_KEYWORD_VIEW.quickFilter;
  const allowedSorts=KEYWORD_SORT_OPTIONS.filter(option=>scopedPlatform==='naver'||!option.naverOnly).map(option=>option.value);
  const sort=allowedSorts.includes(settings?.sort)?settings.sort:DEFAULT_KEYWORD_VIEW.sort;
  const pageSize=KEYWORD_PAGE_SIZES.includes(Number(settings?.pageSize))?Number(settings.pageSize):DEFAULT_KEYWORD_VIEW.pageSize;
  return {quickFilter,sort,pageSize};
}

function describeKeywordView({platform='naver',query='',quickFilter='ALL',sort='COST_DESC',pageSize=KEYWORD_PAGE_SIZES[0],campaignName='',adgroupName='',filteredCount=null}={}){
  const view=normalizeKeywordView(platform,{quickFilter,sort,pageSize});
  const parts=[];
  if(text(query))parts.push(`검색: ${text(query)}`);
  if(view.quickFilter!=='ALL')parts.push(KEYWORD_QUICK_FILTER_LABELS[view.quickFilter]||view.quickFilter);
  if(view.sort!==DEFAULT_KEYWORD_VIEW.sort)parts.push(KEYWORD_SORT_OPTIONS.find(option=>option.value===view.sort)?.label||view.sort);
  if(view.pageSize!==DEFAULT_KEYWORD_VIEW.pageSize)parts.push(`${view.pageSize}개씩`);
  if(text(campaignName)&&upper(campaignName)!=='ALL')parts.push(text(campaignName));
  if(text(adgroupName)&&upper(adgroupName)!=='ALL')parts.push(text(adgroupName));
  const countValue=number(filteredCount);
  return {
    activeCount:parts.length,
    filteredCount:countValue,
    headline:countValue==null?'키워드 수 확인 필요':`${Math.max(0,Math.round(countValue)).toLocaleString('ko-KR')}개 키워드를 보는 중`,
    description:parts.length?parts.join(' · '):'기본 보기'
  };
}

function nextKeywordSort(currentSort,field){
  const normalized=upper(field);
  const first=normalized==='KEYWORD'?'ASC':'DESC';
  const second=first==='ASC'?'DESC':'ASC';
  if(currentSort===`${normalized}_${first}`)return `${normalized}_${second}`;
  return `${normalized}_${first}`;
}

function compareKeywordSortValue(a,b,direction,kind){
  const aMissing=a===null||a===undefined||a==='';
  const bMissing=b===null||b===undefined||b==='';
  if(aMissing||bMissing){
    if(aMissing&&bMissing)return 0;
    return aMissing?1:-1;
  }
  const result=kind==='text'
    ? String(a).localeCompare(String(b),'ko')
    : Number(a)-Number(b);
  return direction==='DESC'?-result:result;
}

function naverRegisteredRows(workbench={}){
  return (workbench.candidates||[]).map(candidate=>{
    const campaignOperationalState=text(candidate.campaign_operational_state)||operationalState(candidate.campaign_status,candidate.campaign_user_lock);
    const adgroupOperationalState=text(candidate.adgroup_operational_state)||operationalState(candidate.adgroup_status,candidate.adgroup_user_lock);
    const adCategoryState=text(candidate.ad_category_state)||combinedOperationalState(campaignOperationalState,adgroupOperationalState);
    return ({
    id:`NAVER:${candidate.ncc_keyword_id}`,
    platform:'NAVER',
    source:'REGISTERED',
    keyword:text(candidate.keyword)||'키워드 이름 없음',
    campaignId:text(candidate.ncc_campaign_id),
    campaignName:text(candidate.campaign_name)||'캠페인 확인 필요',
    campaignType:text(candidate.campaign_type),
    campaignStatus:text(candidate.campaign_status),
    campaignUserLock:candidate.campaign_user_lock===true,
    campaignOperationalState,
    adgroupId:text(candidate.ncc_adgroup_id),
    adgroupName:text(candidate.adgroup_name)||'광고그룹 확인 필요',
    adgroupStatus:text(candidate.adgroup_status),
    adgroupUserLock:candidate.adgroup_user_lock===true,
    adgroupOperationalState,
    adCategoryState,
    campaign:text(candidate.campaign_name)||'캠페인 확인 필요',
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
    recommendationReady:candidate.recommendation_ready===true,
    manualDecreaseOnly:candidate.manual_decrease_only===true,
    applicationMode:candidate.can_request_approval===true?(candidate.manual_decrease_only===true?'OWNER_DIRECT_LOWER':'OWNER_DIRECT'):'BLOCKED',
    freshness:candidate.period_end||null,
    reasons:(candidate.reasons||[]).map(item=>text(item.message)).filter(Boolean),
    snapshotToken:candidate.snapshot_token||null
    });
  });
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
  let filtered=rows.filter(item=>!keyword||upper(`${item.keyword} ${item.campaign} ${item.campaignName} ${item.adgroupName} ${item.product}`).includes(keyword));
  if(quickFilter==='ACTIVE_ADS')filtered=filtered.filter(item=>item.adCategoryState==='ACTIVE');
  if(quickFilter==='INACTIVE_ADS')filtered=filtered.filter(item=>item.adCategoryState==='INACTIVE');
  if(quickFilter==='NO_ORDER_COST')filtered=filtered.filter(item=>item.cost>0&&item.orders<=0);
  if(quickFilter==='LOW_ROAS')filtered=filtered.filter(item=>item.roas!=null&&item.roas<700);
  if(quickFilter==='READY')filtered=filtered.filter(item=>item.canDraft);
  if(quickFilter==='MANUAL')filtered=filtered.filter(item=>item.applicationMode==='MANUAL_REQUIRED');
  const [field,direction,kind]=KEYWORD_SORT_CONFIG[sort]||KEYWORD_SORT_CONFIG.COST_DESC;
  return [...filtered].sort((a,b)=>{
    const operationalRank={ACTIVE:0,UNKNOWN:1,INACTIVE:2};
    const byOperationalState=(operationalRank[a.adCategoryState]??1)-(operationalRank[b.adCategoryState]??1);
    if(byOperationalState)return byOperationalState;
    const compared=compareKeywordSortValue(a[field],b[field],direction,kind);
    if(compared)return compared;
    const byKeyword=text(a.keyword).localeCompare(text(b.keyword),'ko');
    if(byKeyword)return byKeyword;
    return text(a.id).localeCompare(text(b.id),'ko');
  });
}

function groupedMetric(rows=[],idKey,nameKey,stateKey){
  const grouped=new Map();
  for(const item of rows){
    const id=text(item[idKey])||'UNMAPPED';
    const current=grouped.get(id)||{id,name:text(item[nameKey])||'확인 필요',keywordCount:0,clicks:0,cost:0,orders:0,revenue:0,adgroupIds:new Set(),operationalStates:new Set()};
    current.keywordCount+=1;
    current.clicks+=numeric(item.clicks);
    current.cost+=numeric(item.cost);
    current.orders+=numeric(item.orders);
    current.revenue+=numeric(item.revenue);
    if(text(item.adgroupId))current.adgroupIds.add(text(item.adgroupId));
    if(stateKey)current.operationalStates.add(text(item[stateKey])||'UNKNOWN');
    grouped.set(id,current);
  }
  return [...grouped.values()].map(item=>({
    id:item.id,name:item.name,keywordCount:item.keywordCount,adgroupCount:item.adgroupIds.size,
    clicks:item.clicks,cost:item.cost,orders:item.orders,revenue:item.revenue,
    roas:item.cost>0?Math.round(item.revenue/item.cost*1000)/10:null,
    operationalState:item.operationalStates.has('INACTIVE')?'INACTIVE':item.operationalStates.size===1&&item.operationalStates.has('ACTIVE')?'ACTIVE':'UNKNOWN'
  }));
}

function buildNaverAdgroupWorkspace(rows=[],{campaignId='ALL',adgroupId='ALL'}={}){
  const naverRows=rows.filter(item=>item.platform==='NAVER'&&item.source==='REGISTERED');
  const selectedCampaign=text(campaignId)||'ALL';
  const selectedAdgroup=text(adgroupId)||'ALL';
  const campaigns=groupedMetric(naverRows,'campaignId','campaignName','campaignOperationalState');
  const campaignRows=selectedCampaign==='ALL'?naverRows:naverRows.filter(item=>(text(item.campaignId)||'UNMAPPED')===selectedCampaign);
  const adgroups=groupedMetric(campaignRows,'adgroupId','adgroupName','adCategoryState').map(({adgroupCount,...item})=>item);
  const filteredRows=selectedAdgroup==='ALL'?campaignRows:campaignRows.filter(item=>(text(item.adgroupId)||'UNMAPPED')===selectedAdgroup);
  const cost=filteredRows.reduce((sum,item)=>sum+numeric(item.cost),0);
  const revenue=filteredRows.reduce((sum,item)=>sum+numeric(item.revenue),0);
  return {
    campaigns,adgroups,filteredRows,
    summary:{
      campaigns:new Set(filteredRows.map(item=>text(item.campaignId)||'UNMAPPED')).size,
      adgroups:new Set(filteredRows.map(item=>text(item.adgroupId)||'UNMAPPED')).size,
      keywords:filteredRows.length,
      clicks:filteredRows.reduce((sum,item)=>sum+numeric(item.clicks),0),
      cost,
      orders:filteredRows.reduce((sum,item)=>sum+numeric(item.orders),0),
      revenue,
      roas:cost>0?Math.round(revenue/cost*1000)/10:null
    }
  };
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

const OWNER_WORKSPACES={
  naver:[
    ['registered','광고 키워드','입찰가와 성과를 한 표에서 관리','keyword','blue'],
    ['search-terms','실제 검색어','고객이 입력한 검색어를 분리해 확인','search','mint'],
    ['diagnosis','절감·확대','손실과 성장 후보만 모아 확인','shield','amber'],
    ['performance','순위·성과','평균순위와 입찰가·성과 추이','growth','pink'],
    ['history','변경 기록','반영 전후 값과 재조회 결과','growth','lavender']
  ],
  coupang:[
    ['registered','WING 작업','쿠팡 전용 수동 적용 목록','keyword','pink'],
    ['diagnosis','절감 후보','광고비 손실 후보만 모아 확인','shield','amber'],
    ['history','작업 기록','수동 운영 기록과 확인 결과','growth','lavender']
  ]
};

function keywordOwnerWorkspace({platform='naver',workspace='registered',naverBidWorkbench={},searchTermCenter={},coupang={},financialChanges=[]}={}){
  const scopedPlatform=platform==='coupang'?'coupang':'naver';
  const available=OWNER_WORKSPACES[scopedPlatform];
  const currentWorkspace=available.some(([id])=>id===workspace)?workspace:'registered';
  const rows=normalizeKeywordRows({naverBidWorkbench,searchTermCenter,coupang,financialChanges,workspace:currentWorkspace,platform:scopedPlatform});
  const summary=keywordOperationSummary(rows);
  const platformWorkspace=['search-terms','performance'].includes(workspace)?'registered':workspace;
  const platforms=[
    {id:'naver',label:'네이버',active:scopedPlatform==='naver',href:`/keywords/${workspace}?platform=naver`,mode:'API 직접 변경'},
    {id:'coupang',label:'쿠팡',active:scopedPlatform==='coupang',href:`/keywords/${platformWorkspace}?platform=coupang`,mode:'WING 수동 적용'}
  ];
  const workspaces=available.map(([id,label,description,icon,tone])=>({id,label,description,icon,tone,active:id===currentWorkspace,href:`/keywords/${id}?platform=${scopedPlatform}`}));
  const mode=scopedPlatform==='coupang'
    ? {label:'WING 수동 운영',action:'작업표 확인 후 WING 반영',description:'쿠팡 공개 입찰 쓰기 연결 없이 선택 항목만 작업표로 정리합니다.'}
    : {label:'API 직접 운영',action:'한 번 확인 후 반영·재조회',description:'선택한 키워드만 마지막으로 확인한 뒤 네이버 반영과 재조회를 이어서 실행합니다.'};
  return {
    ownerLabel:'사장님 전용 작업대',platform:scopedPlatform,platformLabel:scopedPlatform==='naver'?'네이버':'쿠팡',currentWorkspace,
    headline:`${scopedPlatform==='naver'?'네이버':'쿠팡'} 키워드 ${summary.total.toLocaleString('ko-KR')}개를 관리해요`,
    separationNote:'네이버와 쿠팡의 키워드·선택·변경 경로는 서로 섞이지 않습니다.',
    mode,platforms,workspaces,summary
  };
}

module.exports={DEFAULT_KEYWORD_VIEW,KEYWORD_PAGE_SIZES,KEYWORD_SORT_OPTIONS,normalizeKeywordView,describeKeywordView,nextKeywordSort,normalizeKeywordRows,filterKeywordRows,paginateKeywordRows,keywordOperationSummary,keywordOwnerWorkspace,buildNaverAdgroupWorkspace,naverRegisteredRows,naverSearchTermRows,coupangKeywordRows,historyRows};
