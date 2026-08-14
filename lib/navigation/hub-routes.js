'use strict';

const HUB_NAV = [
  { id:'main', group:'home', label:'메인', href:'/', icon:'H', description:'오늘 현황' },
  { id:'orders', group:'operations', label:'주문', href:'/orders', icon:'O', description:'출고·배송 처리' },
  { id:'cs', group:'operations', label:'CS', href:'/cs', icon:'C', description:'문의·반품·교환' },
  { id:'inventory', group:'operations', label:'재고관리', href:'/inventory', icon:'S', description:'품절·재입고 관리' },
  { id:'settlement', group:'operations', label:'정산·비용', href:'/settlement-costs', icon:'₩', description:'지급·수수료·물류비' },
  { id:'collection', group:'data', label:'데이터수집', href:'/data-collection', icon:'D', description:'채널 수집 상태' },
  { id:'insight', group:'data', label:'인사이트', href:'/insights', icon:'I', description:'성과 원인 분석' },
  { id:'keyword', group:'data', label:'키워드', href:'/keywords', icon:'K', description:'검색광고 진단' },
  { id:'product', group:'data', label:'상품', href:'/products', icon:'P', description:'상품·원가·연결' },
  { id:'knowledge', group:'data', label:'AI 기준자료', href:'/ai-knowledge', icon:'AI', description:'기획서·운영기준 관리' },
  { id:'reports', group:'execution', label:'진단목록', href:'/diagnoses', icon:'R', description:'저장된 보고서' },
  { id:'changes', group:'execution', label:'변경승인', href:'/approvals', icon:'A', description:'승인·복구 기록' },
  { id:'validation', group:'execution', label:'실행검증', href:'/execution-validation', icon:'V', description:'고객·7일·14일 결과' },
  { id:'experiments', group:'execution', label:'A/B 테스트', href:'/ab-tests', icon:'B', description:'실험·기준값 평가' },
  { id:'notifications', group:'execution', label:'알림', href:'/notifications', icon:'N', description:'위험·오류 확인' }
];

const HUB_NAV_GROUPS = [
  { id:'home', label:'홈', icon:'H', description:'오늘의 결정', items:['main'] },
  { id:'operations', label:'운영', icon:'O', description:'주문·CS·재고·정산', items:['orders','cs','inventory','settlement'] },
  { id:'data', label:'데이터·분석', icon:'D', description:'수집·성과·상품 분석', items:['collection','insight','keyword','product','knowledge'] },
  { id:'execution', label:'실행·관리', icon:'E', description:'진단·승인·결과 검증', items:['reports','changes','validation','experiments','notifications'] }
];

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
const COUPANG_OPERATION_VIEWS = new Set(['orders','cs','inventory','settlement']);
const CHANNEL_SCOPED_VIEWS = new Set(['insight','keyword','product']);
const routeFor = view => HUB_NAV.find(item => item.id === view)?.href || '/';
const normalizePath = value => {
  const path = String(value || '/').split('?')[0].replace(/\/+$/,'');
  return path || '/';
};
const viewForPath = pathname => HUB_NAV.find(item => normalizePath(item.href) === normalizePath(pathname))?.id
  || HUB_LEGACY_ROUTES.find(item => normalizePath(item.href) === normalizePath(pathname))?.view
  || 'main';
const cleanProduct = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100) || 'ALL';

function groupForView(view) {
  return HUB_NAV.find(item => item.id === view)?.group || 'home';
}

function navigationContext(view, platform='all') {
  const item = HUB_NAV.find(value => value.id === view) || HUB_NAV[0];
  const group = HUB_NAV_GROUPS.find(value => value.id === item.group) || HUB_NAV_GROUPS[0];
  const platformName = { all:'전체', naver:'네이버', coupang:'쿠팡', cafe24:'Cafe24' }[platform] || '전체';
  return { group, item, platform:platformName };
}

function normalizeHubState(input = {}) {
  const view = VIEW_IDS.has(input.view) ? input.view : 'main';
  const requestedPlatform = PLATFORMS.has(input.platform) ? input.platform : 'all';
  const platform = COUPANG_OPERATION_VIEWS.has(view) ? 'coupang' : CHANNEL_SCOPED_VIEWS.has(view) ? requestedPlatform : 'all';
  const requestedPeriod = PERIODS.has(String(input.period || '').toUpperCase()) ? String(input.period).toUpperCase() : 'DAY';
  const period = CHANNEL_SCOPED_VIEWS.has(view) ? requestedPeriod : 'DAY';
  const product = CHANNEL_SCOPED_VIEWS.has(view) ? cleanProduct(input.product) : 'ALL';
  return { view, platform, period, product };
}

function buildHubHref(input = {}) {
  const state = normalizeHubState(input);
  const params = new URLSearchParams();
  if (state.platform !== 'all' && CHANNEL_SCOPED_VIEWS.has(state.view)) params.set('platform',state.platform);
  if (state.period !== 'DAY') params.set('period',state.period);
  if (state.product !== 'ALL') params.set('product',state.product);
  const query = params.toString();
  return `${routeFor(state.view)}${query ? `?${query}` : ''}`;
}

function parseHubHref(input = '/') {
  let url;
  try { url = new URL(String(input || '/'), 'https://hub.local'); }
  catch { url = new URL('/', 'https://hub.local'); }
  const queryView = url.pathname === '/' ? url.searchParams.get('view') : null;
  return normalizeHubState({
    view:VIEW_IDS.has(queryView) ? queryView : viewForPath(url.pathname),
    platform:url.searchParams.get('platform'),
    period:url.searchParams.get('period'),
    product:url.searchParams.get('product')
  });
}

module.exports = { HUB_NAV, HUB_NAV_GROUPS, HUB_LEGACY_ROUTES, normalizeHubState, buildHubHref, parseHubHref, routeFor, viewForPath, groupForView, navigationContext };
