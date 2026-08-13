'use strict';

const HUB_NAV = [
  { id:'main', label:'메인', href:'/', icon:'H', description:'오늘 현황' },
  { id:'collection', label:'데이터수집', href:'/data-collection', icon:'D', description:'채널 수집 상태' },
  { id:'insight', label:'인사이트', href:'/insights', icon:'I', description:'성과 원인 분석' },
  { id:'keyword', label:'키워드', href:'/keywords', icon:'K', description:'검색광고 진단' },
  { id:'product', label:'상품', href:'/products', icon:'P', description:'상품·재고 관리' },
  { id:'reports', label:'진단목록', href:'/diagnoses', icon:'R', description:'저장된 보고서' },
  { id:'changes', label:'변경승인', href:'/approvals', icon:'A', description:'승인·복구 기록' },
  { id:'experiments', label:'실험실', href:'/experiments', icon:'E', description:'실행 결과 검증' },
  { id:'notifications', label:'알림', href:'/notifications', icon:'N', description:'위험·오류 확인' }
];

const VIEW_IDS = new Set(HUB_NAV.map(item => item.id));
const PLATFORMS = new Set(['all','naver','coupang','cafe24']);
const PERIODS = new Set(['DAY','WEEK','MONTH']);
const routeFor = view => HUB_NAV.find(item => item.id === view)?.href || '/';
const normalizePath = value => {
  const path = String(value || '/').split('?')[0].replace(/\/+$/,'');
  return path || '/';
};
const viewForPath = pathname => HUB_NAV.find(item => normalizePath(item.href) === normalizePath(pathname))?.id || 'main';
const cleanProduct = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100) || 'ALL';

function normalizeHubState(input = {}) {
  const view = VIEW_IDS.has(input.view) ? input.view : 'main';
  const platform = PLATFORMS.has(input.platform) ? input.platform : 'all';
  const period = PERIODS.has(String(input.period || '').toUpperCase()) ? String(input.period).toUpperCase() : 'DAY';
  return { view, platform, period, product:cleanProduct(input.product) };
}

function buildHubHref(input = {}) {
  const state = normalizeHubState(input);
  const params = new URLSearchParams();
  if (state.platform !== 'all') params.set('platform',state.platform);
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

module.exports = { HUB_NAV, normalizeHubState, buildHubHref, parseHubHref, routeFor, viewForPath };
