'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HUB_NAV, HUB_NAV_GROUPS, HUB_LEGACY_ROUTES, normalizeHubState, buildHubHref, parseHubHref, groupForView, navigationContext } = require('../lib/navigation/hub-routes.js');

test('all fifteen hub functions have stable unique addresses', () => {
  assert.equal(HUB_NAV.length,15);
  assert.equal(new Set(HUB_NAV.map(item=>item.href)).size,15);
  assert.deepEqual(HUB_NAV.map(item=>item.label),['메인','주문','CS','재고관리','정산·비용','데이터수집','인사이트','키워드','상품','AI 기준자료','진단목록','변경승인','실행검증','A/B 테스트','알림']);
  assert.equal(buildHubHref({view:'orders',platform:'naver'}),'/orders');
  assert.equal(buildHubHref({view:'cs'}),'/cs');
  assert.equal(buildHubHref({view:'inventory'}),'/inventory');
  assert.equal(buildHubHref({view:'settlement'}),'/settlement-costs');
  assert.equal(buildHubHref({view:'validation'}),'/execution-validation');
  assert.equal(buildHubHref({view:'experiments'}),'/ab-tests');
  assert.equal(buildHubHref({view:'collection'}),'/data-collection');
  assert.equal(buildHubHref({view:'notifications'}),'/notifications');
  assert.equal(buildHubHref({view:'knowledge'}),'/ai-knowledge');
});

test('platform, product, and period survive a refresh through the URL', () => {
  const href=buildHubHref({view:'insight',platform:'coupang',product:'123-ABC',period:'WEEK'});
  assert.equal(href,'/insights?platform=coupang&period=WEEK&product=123-ABC');
  assert.deepEqual(normalizeHubState({view:'insight',platform:'coupang',product:'123-ABC',period:'WEEK'}),{
    view:'insight',platform:'coupang',product:'123-ABC',period:'WEEK'
  });
});

test('main is canonicalized to the all-channel command center', () => {
  assert.equal(buildHubHref({view:'main',platform:'coupang'}),'/');
  assert.deepEqual(parseHubHref('/?platform=naver&period=WEEK&product=old-product'),{view:'main',platform:'all',product:'ALL',period:'DAY'});
});

test('Coupang operation pages stay locked to Coupang without a redundant query', () => {
  for (const view of ['orders','cs','inventory','settlement']) {
    const href=buildHubHref({view,platform:'naver'});
    const state=parseHubHref(href);
    assert.equal(state.view,view);
    assert.equal(state.platform,'coupang');
    assert.doesNotMatch(href,/platform=/);
  }
});

test('only insight, keyword, and product pages retain a channel selection', () => {
  for (const view of ['insight','keyword','product']) {
    assert.equal(normalizeHubState({view,platform:'naver'}).platform,'naver');
  }
  for (const view of ['collection','knowledge','reports','changes','validation','experiments','notifications']) {
    const state=normalizeHubState({view,platform:'naver',period:'MONTH',product:'ignored'});
    assert.deepEqual({platform:state.platform,period:state.period,product:state.product},{platform:'all',period:'DAY',product:'ALL'});
    assert.doesNotMatch(buildHubHref({view,platform:'naver',period:'MONTH',product:'ignored'}),/[?&](platform|period|product)=/);
  }
});

test('unknown URL state falls back safely', () => {
  assert.deepEqual(normalizeHubState({view:'admin',platform:'unknown',product:'../../secret',period:'YEAR'}),{
    view:'main',platform:'all',product:'ALL',period:'DAY'
  });
});

test('visible hub addresses restore the matching client view', () => {
  assert.deepEqual(parseHubHref('https://harin-cafe24-sync.vercel.app/products?platform=coupang&period=WEEK&product=123'), {
    view:'product', platform:'coupang', period:'WEEK', product:'123'
  });
  assert.equal(parseHubHref('/approvals').view,'changes');
  assert.equal(parseHubHref('/execution-validation').view,'validation');
  assert.equal(parseHubHref('/ab-tests').view,'experiments');
  assert.equal(parseHubHref('/?view=notifications').view,'notifications');
  assert.equal(parseHubHref('/ai-knowledge').view,'knowledge');
});

test('all existing functions appear once in the four approved sidebar groups', () => {
  assert.deepEqual(HUB_NAV_GROUPS.map(group=>group.label),['홈','운영','데이터·분석','실행·관리']);
  const grouped=HUB_NAV_GROUPS.flatMap(group=>group.items);
  assert.equal(grouped.length,HUB_NAV.length);
  assert.equal(new Set(grouped).size,HUB_NAV.length);
  assert.deepEqual(new Set(grouped),new Set(HUB_NAV.map(item=>item.id)));
  assert.equal(groupForView('keyword'),'data');
  assert.equal(groupForView('product'),'data');
  assert.equal(groupForView('knowledge'),'data');
  assert.equal(groupForView('changes'),'execution');
  assert.equal(groupForView('notifications'),'execution');
});

test('breadcrumb context uses group, function, and selected platform', () => {
  const context=navigationContext('product','coupang');
  assert.equal(context.group.label,'데이터·분석');
  assert.equal(context.item.label,'상품');
  assert.equal(context.platform,'쿠팡');
});

test('legacy addresses still open their original functions', () => {
  assert.ok(HUB_LEGACY_ROUTES.length>=7);
  assert.equal(parseHubHref('/dashboard').view,'main');
  assert.equal(parseHubHref('/reports').view,'reports');
  assert.equal(parseHubHref('/actions').view,'reports');
  assert.equal(parseHubHref('/changes').view,'changes');
  assert.equal(parseHubHref('/validation').view,'validation');
  assert.equal(parseHubHref('/experiments').view,'experiments');
  assert.equal(parseHubHref('/lab').view,'experiments');
  assert.equal(parseHubHref('/alerts').view,'notifications');
  assert.equal(parseHubHref('/coupang/orders').view,'orders');
  assert.equal(parseHubHref('/coupang/cs').view,'cs');
  assert.equal(parseHubHref('/coupang/inventory').view,'inventory');
  assert.equal(parseHubHref('/coupang/settlement').view,'settlement');
});

test('Next rewrites serve canonical and legacy addresses through the dashboard', async () => {
  const rewrites=await require('../next.config.js').rewrites();
  assert.ok(rewrites.some(item=>item.source==='/products'&&item.destination==='/?view=product'));
  assert.ok(rewrites.some(item=>item.source==='/orders'&&item.destination==='/?view=orders'));
  assert.ok(rewrites.some(item=>item.source==='/settlement-costs'&&item.destination==='/?view=settlement'));
  assert.ok(rewrites.some(item=>item.source==='/execution-validation'&&item.destination==='/?view=validation'));
  assert.ok(rewrites.some(item=>item.source==='/ab-tests'&&item.destination==='/?view=experiments'));
  assert.ok(rewrites.some(item=>item.source==='/reports'&&item.destination==='/?view=reports'));
  assert.ok(rewrites.some(item=>item.source==='/alerts'&&item.destination==='/?view=notifications'));
  assert.ok(rewrites.some(item=>item.source==='/ai-knowledge'&&item.destination==='/?view=knowledge'));
});
