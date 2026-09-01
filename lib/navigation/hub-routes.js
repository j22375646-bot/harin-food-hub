'use strict';

const HUB_NAV = [
  { id:'main', group:'today', label:'메인', href:'/', icon:'H', description:'오늘 현황' },
  { id:'calendar', group:'today', label:'캘린더', href:'/calendar', icon:'D', description:'일정·메모 관리' },
  { id:'orders', group:'orders', label:'주문', href:'/orders', icon:'O', description:'출고·배송 처리' },
  { id:'cs', group:'customer', label:'CS', href:'/cs', icon:'C', description:'문의·반품·교환' },
  { id:'inventory', group:'inventory', label:'재고관리', href:'/inventory', icon:'S', description:'품절·재입고 관리' },
  { id:'settlement', group:'settlement', label:'정산·비용', href:'/settlement-costs', icon:'₩', description:'지급·수수료·물류비' },
  { id:'collection', group:'system', label:'데이터수집', href:'/data-collection', icon:'D', description:'채널 수집 상태' },
  { id:'insight', group:'analysis', label:'인사이트', href:'/insights', icon:'I', description:'성과 원인 분석' },
  { id:'keyword', group:'analysis', label:'키워드', href:'/keywords', icon:'K', description:'검색광고 진단' },
  { id:'product-analysis', group:'development', label:'상품분석', href:'/product-analysis', icon:'PA', description:'상품별 시장·고객 근거' },
  { id:'market', group:'development', label:'상품개발', href:'/market-intelligence', icon:'M', description:'상품별 시장·실험·검증' },
  { id:'product', group:'inventory', label:'상품', href:'/products', icon:'P', description:'상품·원가·연결' },
  { id:'knowledge', group:'system', label:'AI 기준자료', href:'/ai-knowledge', icon:'AI', description:'기획서·운영기준 관리' },
  { id:'reports', group:'analysis', label:'진단목록', href:'/diagnoses', icon:'R', description:'저장된 진단·보고서' },
  { id:'changes', group:'system', label:'변경기록', href:'/approvals', icon:'A', description:'실행·검증·복구 이력' },
  { id:'validation', group:'development', label:'실행검증', href:'/execution-validation', icon:'V', description:'실험 전후 7·14일 결과' },
  { id:'experiments', group:'development', label:'A/B 테스트', href:'/ab-tests', icon:'B', description:'상품 실험·기준값 평가' },
  { id:'notifications', group:'system', label:'알림', href:'/notifications', icon:'N', description:'위험·오류 확인' }
];

const HUB_NAV_GROUPS = [
  { id:'today', label:'오늘', icon:'T', description:'오늘 가장 먼저 볼 판단', items:['main','calendar'] },
  { id:'orders', label:'주문·배송', icon:'O', description:'출고·배송 처리', items:['orders'] },
  { id:'customer', label:'고객·CS', icon:'C', description:'문의·반품·교환', items:['cs'] },
  { id:'inventory', label:'재고·상품', icon:'S', description:'재고·상품·원가 연결', items:['inventory','product'] },
  { id:'settlement', label:'정산·비용', icon:'W', description:'지급·수수료·물류비', items:['settlement'] },
  { id:'analysis', label:'분석', icon:'I', description:'성과·키워드·진단 보고서', items:['insight','keyword','reports'] },
  { id:'development', label:'개발', icon:'B', description:'상품분석·개발·실험·결과 검증', items:['product-analysis','market','validation','experiments'] },
  { id:'system', label:'시스템', icon:'G', description:'수집·기록·알림 설정', items:['collection','changes','notifications','knowledge'] }
];

const HUB_WORKSPACES = {
  collection:[
    { id:'overview', label:'전체 수집상태', description:'채널별 수집·재시도', href:'/data-collection' },
    { id:'naver-api', label:'네이버 API', description:'커머스·광고·API HUB 연결', href:'/data-collection/naver-api' },
    { id:'advertising', label:'광고 API', description:'운영 채널별 읽기·변경 준비', href:'/data-collection/advertising' },
    { id:'provider-fallback', label:'유료 보완 API', description:'무료 우선·검색·OCR·경쟁자료 판단', href:'/data-collection/provider-fallback' },
    { id:'optional-providers', label:'선택형 자료 API', description:'번역·트렌드·공공조달 조건 확인', href:'/data-collection/optional-providers' },
    { id:'provider-runtime', label:'API 사용량·안전', description:'할당량·캐시·중복차단·이전자료', href:'/data-collection/provider-runtime' },
    { id:'execution-paths', label:'실행 경로·전환', description:'systemd·Cron·큐 단일 경로', href:'/data-collection/execution-paths' },
    { id:'owned-site', label:'자사몰 분석 API', description:'검색·방문·속도·사용성 연결', href:'/data-collection/owned-site' },
    { id:'shipping-reference', label:'출고 일정·주소', description:'공휴일·주소·배송일 계산', href:'/data-collection/shipping-reference' },
    { id:'operations-health', label:'서버·배포 상태', description:'AWS 워커·Vercel 운영 신호', href:'/data-collection/operations-health' }
  ],
  insight:[
    { id:'overview', label:'사장님 브리프', description:'네이버 주간 결정·위험·행동', href:'/insights/overview' },
    { id:'causes', label:'원인 분석', description:'기존 주소 호환 · 사장님 브리프로 이동', href:'/insights/causes' },
    { id:'saved', label:'저장 주간 진단', description:'네이버 주간 보고서와 상세 근거', href:'/insights/saved' },
    { id:'diagnostics', label:'누적 주간 진단', description:'네이버 주간 자동진단 기록', href:'/insights/diagnostics' }
  ],
  keyword:[
    { id:'registered', label:'광고 키워드 운영', description:'입찰 초안과 성과를 한 표에서 관리', href:'/keywords/registered' },
    { id:'search-terms', label:'실제 검색어', description:'고객이 입력한 검색어', href:'/keywords/search-terms' },
    { id:'diagnosis', label:'절감·확대 후보', description:'손실·성장 후보와 AI 분석', href:'/keywords/diagnosis' },
    { id:'performance', label:'순위·성과', description:'평균순위·입찰가·성과 추이', href:'/keywords/performance' },
    { id:'history', label:'변경 기록·검증', description:'실행·재조회·성과 확인', href:'/keywords/history' }
  ],
  product:[
    { id:'catalog', label:'상품목록', description:'판매·품절·중단 분류', href:'/products/catalog' },
    { id:'mappings', label:'상품매칭', description:'채널 상품 연결', href:'/products/mappings' },
    { id:'costs', label:'원가', description:'상품·수수료·배송비', href:'/products/costs' },
    { id:'profit', label:'이익', description:'채널 통합 공헌이익', href:'/products/profit' },
    { id:'offers', label:'판매구성', description:'1개·묶음 구성 비교', href:'/products/offers' },
    { id:'ad-targets', label:'광고목표', description:'목표 ROAS·CPA·CPC', href:'/products/ad-targets' }
  ]
};

const HUB_LEGACY_ROUTES = [
  { href:'/dashboard', view:'main' },
  { href:'/coupang/orders', view:'orders' },
  { href:'/coupang/cs', view:'cs' },
  { href:'/coupang/inventory', view:'inventory' },
  { href:'/coupang/settlement', view:'settlement' },
  { href:'/collection', view:'collection' },
  { href:'/reports', view:'reports' },
  { href:'/actions', view:'reports' },
  { href:'/changes', view:'changes' },
  { href:'/validation', view:'validation' },
  { href:'/experiments', view:'experiments' },
  { href:'/lab', view:'experiments' },
  { href:'/alerts', view:'notifications' }
];

const VIEW_IDS = new Set(HUB_NAV.map(item => item.id));
const PLATFORMS = new Set(['all','naver','coupang','cafe24']);
const PERIODS = new Set(['DAY','WEEK','MONTH']);
const COUPANG_OPERATION_VIEWS = new Set(['cs','inventory','settlement']);
const CHANNEL_SCOPED_VIEWS = new Set(['insight','keyword','product']);
const workspaceForView = (view, workspace) => {
  const items=HUB_WORKSPACES[view]||[];
  if(!items.length)return null;
  return items.some(item=>item.id===workspace)?workspace:items[0].id;
};
const routeFor = (view, workspace) => {
  const focused=(HUB_WORKSPACES[view]||[]).find(item=>item.id===workspaceForView(view,workspace));
  return focused?.href||HUB_NAV.find(item => item.id === view)?.href || '/';
};
const normalizePath = value => {
  const path = String(value || '/').split('?')[0].replace(/\/+$/,'');
  return path || '/';
};
const viewForPath = pathname => Object.entries(HUB_WORKSPACES).find(([,items])=>items.some(item=>normalizePath(item.href)===normalizePath(pathname)))?.[0]
  || HUB_NAV.find(item => normalizePath(item.href) === normalizePath(pathname))?.id
  || HUB_LEGACY_ROUTES.find(item => normalizePath(item.href) === normalizePath(pathname))?.view
  || 'main';
const workspaceForPath = (view, pathname) => (HUB_WORKSPACES[view]||[]).find(item=>normalizePath(item.href)===normalizePath(pathname))?.id;
const cleanProduct = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100) || 'ALL';

function groupForView(view) {
  return HUB_NAV.find(item => item.id === view)?.group || 'today';
}

function navigationContext(view, platform='all') {
  const item = HUB_NAV.find(value => value.id === view) || HUB_NAV[0];
  const group = HUB_NAV_GROUPS.find(value => value.id === item.group) || HUB_NAV_GROUPS[0];
  const platformName = { all:'전체', naver:'네이버', coupang:'쿠팡', cafe24:'Cafe24' }[platform] || '전체';
  return { group, item, platform:view==='orders' ? '전체 채널' : platformName };
}

function primaryNavigationState(view) {
  if (view === 'keyword') {
    return { view:'keyword', workspace:'registered', platform:'naver', product:'ALL', period:'DAY' };
  }
  return { view, product:'ALL', period:'DAY' };
}

function normalizeHubState(input = {}) {
  const view = VIEW_IDS.has(input.view) ? input.view : 'main';
  const workspace=workspaceForView(view,input.workspace);
  const requestedPlatform = PLATFORMS.has(input.platform) ? input.platform : 'all';
  const platform = COUPANG_OPERATION_VIEWS.has(view) ? 'coupang' : view==='product'&&workspace!=='catalog' ? 'all' : view==='keyword'&&['search-terms','performance'].includes(workspace) ? 'naver' : view==='keyword'&&!['naver','coupang'].includes(requestedPlatform) ? 'naver' : CHANNEL_SCOPED_VIEWS.has(view) ? requestedPlatform : 'all';
  const requestedPeriod = PERIODS.has(String(input.period || '').toUpperCase()) ? String(input.period).toUpperCase() : 'DAY';
  const period = CHANNEL_SCOPED_VIEWS.has(view) ? requestedPeriod : 'DAY';
  const product = CHANNEL_SCOPED_VIEWS.has(view) ? cleanProduct(input.product) : 'ALL';
  return { view, workspace, platform, period, product };
}

function buildHubHref(input = {}) {
  const state = normalizeHubState(input);
  const params = new URLSearchParams();
  if (state.platform !== 'all' && CHANNEL_SCOPED_VIEWS.has(state.view)) params.set('platform',state.platform);
  if (state.period !== 'DAY') params.set('period',state.period);
  if (state.product !== 'ALL') params.set('product',state.product);
  const query = params.toString();
  return `${routeFor(state.view,state.workspace)}${query ? `?${query}` : ''}`;
}

function parseHubHref(input = '/') {
  let url;
  try { url = new URL(String(input || '/'), 'https://hub.local'); }
  catch { url = new URL('/', 'https://hub.local'); }
  const queryView = url.pathname === '/' ? url.searchParams.get('view') : null;
  const parsedView=VIEW_IDS.has(queryView)?queryView:viewForPath(url.pathname);
  return normalizeHubState({
    view:parsedView,
    workspace:url.searchParams.get('workspace')||(VIEW_IDS.has(queryView)?null:workspaceForPath(parsedView,url.pathname)),
    platform:url.searchParams.get('platform'),
    period:url.searchParams.get('period'),
    product:url.searchParams.get('product')
  });
}

function canonicalLegacyHubHref(input = '/') {
  let url;
  try { url=new URL(String(input||'/'),'https://hub.local'); }
  catch { return null; }
  const queryView=url.pathname==='/'?url.searchParams.get('view'):null;
  if(!VIEW_IDS.has(queryView))return null;
  return buildHubHref({
    view:queryView,
    workspace:url.searchParams.get('workspace'),
    platform:url.searchParams.get('platform'),
    period:url.searchParams.get('period'),
    product:url.searchParams.get('product')
  });
}

module.exports = { HUB_NAV, HUB_NAV_GROUPS, HUB_WORKSPACES, HUB_LEGACY_ROUTES, normalizeHubState, buildHubHref, parseHubHref, canonicalLegacyHubHref, routeFor, viewForPath, workspaceForView, primaryNavigationState, groupForView, navigationContext };
