'use strict';

const keywordOperations=require('../../marketing/keyword-operations.js');

const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const numberOrNull=value=>hasNumber(value)?Number(value):null;
const text=value=>String(value==null?'':value).trim();
const frozenRows=items=>Object.freeze(items.map(item=>Object.freeze(item)));

const DECISIONS={
  LOWER:{code:'LOWER',label:'감액 후보',tone:'lower'},
  LOWER_BID:{code:'LOWER',label:'감액 후보',tone:'lower'},
  EXCLUDE:{code:'LOWER',label:'제외 검토',tone:'lower'},
  RAISE:{code:'RAISE',label:'확대 후보',tone:'raise'},
  RAISE_BID:{code:'RAISE',label:'확대 후보',tone:'raise'},
  KEEP:{code:'KEEP',label:'유지',tone:'hold'},
  KEEP_BID:{code:'KEEP',label:'유지',tone:'hold'},
  WATCH:{code:'KEEP',label:'관찰',tone:'hold'},
  OBSERVE:{code:'KEEP',label:'관찰',tone:'hold'},
  HISTORY:{code:'HISTORY',label:'변경 기록',tone:'hold'},
  BLOCKED:{code:'BLOCKED',label:'판단 보류',tone:'blocked'},
  HOLD_FOR_DATA:{code:'BLOCKED',label:'판단 보류',tone:'blocked'},
  HOLD_FOR_FINANCIAL_DATA:{code:'BLOCKED',label:'판단 보류',tone:'blocked'}
};

function decisionFor(row={}){
  const raw=text(row.decision||row.status||'BLOCKED').toUpperCase();
  if(row.platform==='COUPANG'&&row.applicationMode==='MANUAL_REQUIRED'){
    const base=DECISIONS[raw]||DECISIONS.BLOCKED;
    return {...base,label:base.code==='LOWER'?'WING 감액 검토':base.code==='BLOCKED'?'확인 필요':'WING 관찰'};
  }
  return DECISIONS[raw]||DECISIONS.BLOCKED;
}

function compactRow(row={}){
  const decision=decisionFor(row);
  const channel=text(row.platform).toUpperCase()==='COUPANG'?'COUPANG':'NAVER';
  return Object.freeze({
    id:text(row.id)||`${channel}:${text(row.keyword)||'unknown'}`,
    channel,
    source:text(row.source)||'REGISTERED',
    keyword:text(row.keyword)||'키워드 확인 필요',
    campaign:text(row.campaignName||row.campaign)||'캠페인 확인 필요',
    adgroup:text(row.adgroupName)||null,
    product:text(row.product)||'상품 연결 확인 필요',
    currentBid:numberOrNull(row.currentBid),
    recommendedBid:numberOrNull(row.recommendedBid),
    observedBid:numberOrNull(row.observedBid),
    minimumBid:numberOrNull(row.minimumBid)??70,
    maximumBid:numberOrNull(row.maximumBid)??100000,
    impressions:numberOrNull(row.impressions),
    clicks:numberOrNull(row.clicks),
    cost:numberOrNull(row.cost),
    orders:numberOrNull(row.orders),
    revenue:numberOrNull(row.revenue),
    roas:numberOrNull(row.roas),
    decision:decision.code,
    tone:decision.tone,
    statusLabel:decision.label,
    canDraft:channel==='NAVER'&&row.canDraft===true&&Boolean(row.snapshotToken)&&numberOrNull(row.currentBid)!=null,
    snapshotToken:row.snapshotToken||null,
    applicationMode:channel==='NAVER'?'OWNER_CONFIRM':'WING_MANUAL',
    freshness:row.freshness||null,
    classification:text(row.classification)||null,
    reasons:Object.freeze((Array.isArray(row.reasons)?row.reasons:[]).map(text).filter(Boolean).slice(0,4))
  });
}

function sumKnown(rows,key){
  const known=rows.filter(row=>row[key]!=null);
  return known.length?known.reduce((sum,row)=>sum+Number(row[key]),0):null;
}

function buildPhase28KeywordsModel(data={},options={}){
  const platform=options.platform==='coupang'?'coupang':'naver';
  const requestedWorkspace=text(options.workspace||data.loadedWorkspace||'registered');
  const workspace=platform==='coupang'&&['search-terms','performance'].includes(requestedWorkspace)?'registered':requestedWorkspace;
  const normalized=keywordOperations.normalizeKeywordRows({
    naverBidWorkbench:data.naverBidWorkbench||{},
    searchTermCenter:data.naver?.searchTermCenter||{},
    coupang:data.coupang||{},
    financialChanges:data.financialChanges||[],
    workspace,
    platform
  });
  const rows=frozenRows(normalized.map(compactRow));
  const cost=sumKnown(rows,'cost');
  const clicks=sumKnown(rows,'clicks');
  const orders=sumKnown(rows,'orders');
  const revenue=sumKnown(rows,'revenue');
  const noOrderSpend=rows.filter(row=>row.orders===0&&row.cost!=null).reduce((sum,row)=>sum+row.cost,0);
  const actions={
    lower:rows.filter(row=>row.decision==='LOWER').length,
    raise:rows.filter(row=>row.decision==='RAISE').length,
    hold:rows.filter(row=>['KEEP','HISTORY'].includes(row.decision)).length,
    blocked:rows.filter(row=>row.decision==='BLOCKED').length
  };
  const owner=keywordOperations.keywordOwnerWorkspace({
    platform,workspace,naverBidWorkbench:data.naverBidWorkbench||{},
    searchTermCenter:data.naver?.searchTermCenter||{},coupang:data.coupang||{},financialChanges:data.financialChanges||[]
  });
  const checkCount=actions.lower+actions.blocked;
  return Object.freeze({
    kind:'keywords',writePolicy:'GUARDED',platform,workspace,
    visibleLimit:20,
    generatedAt:data.generatedAt||null,
    hero:Object.freeze({
      checkCount,
      headline:checkCount?`오늘 조정할 키워드 ${checkCount.toLocaleString('ko-KR')}건이 있어요.`:'오늘 바로 조정할 키워드는 없어요.',
      summary:'광고비가 주문으로 이어지는 흐름을 보고, 네이버 API와 쿠팡 WING 작업을 섞지 않고 처리해요.'
    }),
    mode:Object.freeze(owner.mode),
    channels:frozenRows([
      {id:'naver',brand:'NAVER',label:'네이버 검색광고',description:'현재 입찰가·추천가·재조회',writeMode:'OWNER_CONFIRM',active:platform==='naver',href:'/keywords/registered?platform=naver'},
      {id:'coupang',brand:'COUPANG',label:'쿠팡 상품광고',description:'WING 작업표·수동 확인',writeMode:'WING_MANUAL',active:platform==='coupang',href:'/keywords/registered?platform=coupang'}
    ]),
    workspaces:frozenRows(owner.workspaces.map(item=>({...item}))),
    rows,
    summary:Object.freeze({total:rows.length,cost,clicks,orders,revenue,noOrderSpend,actions})
  });
}

module.exports={buildPhase28KeywordsModel};
