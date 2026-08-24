'use strict';

const SHARED_KEEP=[
  {id:'BULK_SELECTION',status:'KEEP',label:'현재 화면·검색 결과 전체선택과 일괄 작업'},
  {id:'PLATFORM_ISOLATION',status:'KEEP',label:'네이버·쿠팡 데이터와 쓰기 경로 완전 분리'},
  {id:'PAGE_AI',status:'KEEP',label:'키워드 페이지 전용 AI 분석'}
];

const NAVER_FEATURES=[
  {id:'NAVER_DIRECT_BID',status:'KEEP',label:'네이버 현재 입찰가 조회·직접 변경'},
  {id:'NAVER_SAFETY_RULES',status:'KEEP',label:'변경폭·예산·목표 ROAS 안전 규칙'},
  {id:'NAVER_SCHEDULES',status:'KEEP',label:'광고그룹별 자동입찰 예약'},
  {id:'NAVER_EMERGENCY_PAUSE',status:'KEEP',label:'자동입찰 긴급 중지'},
  {id:'NAVER_LIVE_VERIFY',status:'KEEP',label:'실행 직전 재조회와 반영 후 검증'},
  {id:'NAVER_BID_HISTORY',status:'KEEP',label:'변경·복구·검증 기록'},
  {id:'NAVER_RANK_TRENDS',status:'KEEP',label:'일별 순위와 목표 적중 신호'},
  {id:'NAVER_EXPORT_SEARCH',status:'KEEP',label:'현재 보기 CSV와 네이버 검색 확인'},
  ...SHARED_KEEP,
  {id:'THREE_PANE_WORKBENCH',status:'ADD',phase:'25-1',label:'범위·운영표·상세 패널 3단 작업대'},
  {id:'GLOBAL_KEYWORD_FINDER',status:'ENHANCE',phase:'25-2',label:'전체 키워드 검색과 바로 이동'},
  {id:'CONDITIONAL_BULK_EDIT',status:'ENHANCE',phase:'25-3',label:'조건 선택과 일괄 입찰 입력'},
  {id:'REGION_DEVICE_SCOPE',status:'ADD',phase:'25-4',label:'지역·기기별 운영 범위'},
  {id:'SCHEDULE_HEATMAP_COOLDOWN',status:'ADD',phase:'25-5',label:'시간대 히트맵과 변경 휴지기'},
  {id:'MARKET_ESTIMATE_PANEL',status:'ADD',phase:'25-6',label:'시장·추천 입찰 추정 근거'},
  {id:'DETAIL_INSPECTOR',status:'ENHANCE',phase:'25-7',label:'선택 키워드 상세 패널 통합'},
  {id:'RESPONSIVE_ACCESSIBILITY',status:'ENHANCE',phase:'25-8',label:'모바일·성능·접근성 정리'},
  {id:'LIVE_VERIFICATION_RELEASE',status:'ENHANCE',phase:'25-9',label:'실연결 검증과 운영 배포'},
  {id:'MULTI_USER',status:'EXCLUDE',label:'다중 사용자와 권한 관리',reason:'사장님 한 명이 사용하는 단일 오너 허브'},
  {id:'MULTI_ACCOUNT',status:'EXCLUDE',label:'여러 광고계정 전환',reason:'현재 운영 광고계정은 한 개'}
];

const COUPANG_FEATURES=[
  {id:'COUPANG_WING_WORKLIST',status:'KEEP',label:'쿠팡 WING 수동 적용 작업표'},
  ...SHARED_KEEP,
  {id:'DETAIL_INSPECTOR',status:'ENHANCE',phase:'25-7',label:'선택 키워드 상세 패널 통합'},
  {id:'RESPONSIVE_ACCESSIBILITY',status:'ENHANCE',phase:'25-8',label:'모바일·성능·접근성 정리'},
  {id:'LIVE_VERIFICATION_RELEASE',status:'ENHANCE',phase:'25-9',label:'수동 적용 흐름 검증과 운영 배포'},
  {id:'MULTI_USER',status:'EXCLUDE',label:'다중 사용자와 권한 관리',reason:'사장님 한 명이 사용하는 단일 오너 허브'},
  {id:'MULTI_ACCOUNT',status:'EXCLUDE',label:'여러 광고계정 전환',reason:'현재 운영 광고계정은 한 개'}
];

function normalizePlatform(value){
  return String(value||'').toLowerCase()==='coupang'?'coupang':'naver';
}

function keywordWorkbenchContract({platform='naver'}={}){
  const normalized=normalizePlatform(platform);
  return {
    platform:normalized.toUpperCase(),
    singleOwner:true,
    writeMode:normalized==='naver'?'NAVER_API_OWNER_CONFIRM':'COUPANG_WING_MANUAL',
    features:(normalized==='naver'?NAVER_FEATURES:COUPANG_FEATURES).map(item=>({...item}))
  };
}

function keywordWorkbenchPresentation({ownerShellVisible=true}={}){
  return {
    showOperationsContext:ownerShellVisible!==true,
    showOwnerShell:ownerShellVisible===true,
    showLegacyToolsAsDisclosure:true
  };
}

function keywordWorkbenchLayout({platform='naver',workspace='registered',hasDetail=false}={}){
  const normalized=normalizePlatform(platform);
  const scopedNaver=normalized==='naver'&&['registered','diagnosis'].includes(String(workspace||'registered'));
  const panes=scopedNaver?[
    {id:'scope',label:'캠페인·광고그룹 범위'},
    {id:'operations',label:'키워드 운영표'},
    {id:'inspector',label:'선택 키워드 상세'}
  ]:[
    {id:'operations',label:normalized==='coupang'?'쿠팡 WING 운영표':'키워드 운영표'},
    {id:'inspector',label:'선택 키워드 상세'}
  ];
  return {
    mode:scopedNaver?'THREE_PANE':'TABLE_INSPECTOR',
    panes,
    scope:scopedNaver?{kind:'NAVER_CAMPAIGN_ADGROUP',mobileCollapsible:true}:null,
    detailState:hasDetail?'SELECTED':'EMPTY_GUIDANCE',
    mobile:{
      order:panes.map(item=>item.id),
      scopeDefaultOpen:false,
      inspector:'FOLLOW_ON_SELECT'
    }
  };
}

function keywordDetailOpenPlan({detailId='',viewportWidth=null}={}){
  const active=Boolean(String(detailId||'').trim());
  const width=Number(viewportWidth);
  const compact=Number.isFinite(width)&&width<=700;
  return {
    active,
    followDetail:active&&compact,
    focusTarget:active&&compact?'DETAIL_CLOSE':'ROW',
    scrollBehavior:active&&compact?'INSTANT':'NONE'
  };
}

function keywordDetailKeyPlan({detailId='',key='',overlayOpen=false}={}){
  const activeId=String(detailId||'').trim();
  if(activeId&&key==='Escape'&&overlayOpen!==true){
    return {action:'CLOSE',restoreRowId:activeId};
  }
  return {action:'NONE',restoreRowId:''};
}

module.exports={keywordWorkbenchContract,keywordWorkbenchPresentation,keywordWorkbenchLayout,keywordDetailOpenPlan,keywordDetailKeyPlan};
