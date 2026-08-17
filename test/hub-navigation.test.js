'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HUB_NAV, HUB_NAV_GROUPS, HUB_WORKSPACES, HUB_LEGACY_ROUTES, normalizeHubState, buildHubHref, parseHubHref, groupForView, navigationContext } = require('../lib/navigation/hub-routes.js');

test('all sixteen hub functions have stable unique addresses', () => {
  assert.equal(HUB_NAV.length,16);
  assert.equal(new Set(HUB_NAV.map(item=>item.href)).size,16);
  assert.deepEqual(HUB_NAV.map(item=>item.label),['메인','주문','CS','재고관리','정산·비용','데이터수집','인사이트','키워드','시장·전환','상품','AI 기준자료','진단목록','변경승인','실행검증','A/B 테스트','알림']);
  assert.equal(buildHubHref({view:'orders',platform:'naver'}),'/orders');
  assert.equal(buildHubHref({view:'cs'}),'/cs');
  assert.equal(buildHubHref({view:'inventory'}),'/inventory');
  assert.equal(buildHubHref({view:'settlement'}),'/settlement-costs');
  assert.equal(buildHubHref({view:'validation'}),'/execution-validation');
  assert.equal(buildHubHref({view:'experiments'}),'/ab-tests');
  assert.equal(buildHubHref({view:'collection'}),'/data-collection');
  assert.equal(buildHubHref({view:'notifications'}),'/notifications');
  assert.equal(buildHubHref({view:'knowledge'}),'/ai-knowledge');
  assert.equal(buildHubHref({view:'market'}),'/market-intelligence');
});

test('platform, product, and period survive a refresh through the URL', () => {
  const href=buildHubHref({view:'insight',platform:'coupang',product:'123-ABC',period:'WEEK'});
  assert.equal(href,'/insights/overview?platform=coupang&period=WEEK&product=123-ABC');
  assert.deepEqual(normalizeHubState({view:'insight',platform:'coupang',product:'123-ABC',period:'WEEK'}),{
    view:'insight',workspace:'overview',platform:'coupang',product:'123-ABC',period:'WEEK'
  });
});

test('main is canonicalized to the all-channel command center', () => {
  assert.equal(buildHubHref({view:'main',platform:'coupang'}),'/');
  assert.deepEqual(parseHubHref('/?platform=naver&period=WEEK&product=old-product'),{view:'main',workspace:null,platform:'all',product:'ALL',period:'DAY'});
});

test('unified orders stay all-channel while Coupang-only operation pages remain locked', () => {
  const ordersHref=buildHubHref({view:'orders',platform:'coupang'});
  assert.equal(parseHubHref(ordersHref).platform,'all');
  assert.doesNotMatch(ordersHref,/platform=/);
  for (const view of ['cs','inventory','settlement']) {
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
  for (const view of ['market','collection','knowledge','reports','changes','validation','experiments','notifications']) {
    const state=normalizeHubState({view,platform:'naver',period:'MONTH',product:'ignored'});
    assert.deepEqual({platform:state.platform,period:state.period,product:state.product},{platform:'all',period:'DAY',product:'ALL'});
    assert.doesNotMatch(buildHubHref({view,platform:'naver',period:'MONTH',product:'ignored'}),/[?&](platform|period|product)=/);
  }
});

test('unknown URL state falls back safely', () => {
  assert.deepEqual(normalizeHubState({view:'admin',platform:'unknown',product:'../../secret',period:'YEAR'}),{
    view:'main',workspace:null,platform:'all',product:'ALL',period:'DAY'
  });
});

test('visible hub addresses restore the matching client view', () => {
  assert.deepEqual(parseHubHref('https://harin-cafe24-sync.vercel.app/products?platform=coupang&period=WEEK&product=123'), {
    view:'product', workspace:'catalog', platform:'coupang', period:'WEEK', product:'123'
  });
  assert.equal(parseHubHref('/approvals').view,'changes');
  assert.equal(parseHubHref('/execution-validation').view,'validation');
  assert.equal(parseHubHref('/ab-tests').view,'experiments');
  assert.equal(parseHubHref('/?view=notifications').view,'notifications');
  assert.equal(parseHubHref('/ai-knowledge').view,'knowledge');
});

test('phase 13-6 focused workspaces have real addresses and restore their exact state', () => {
  assert.deepEqual(Object.keys(HUB_WORKSPACES),['collection','insight','keyword','product']);
  assert.deepEqual(HUB_WORKSPACES.collection.map(item=>item.id),['overview','naver-api','advertising','owned-site','shipping-reference','operations-health']);
  assert.deepEqual(HUB_WORKSPACES.insight.map(item=>item.id),['overview','causes','channels','profitability']);
  assert.deepEqual(HUB_WORKSPACES.keyword.map(item=>item.id),['search-terms','registered','diagnosis','history']);
  assert.deepEqual(HUB_WORKSPACES.product.map(item=>item.id),['catalog','mappings','costs','profit','offers','ad-targets']);
  for (const [view,items] of Object.entries(HUB_WORKSPACES)) {
    for (const item of items) {
      const href=buildHubHref({view,workspace:item.id,platform:'naver'});
      const state=parseHubHref(href);
      assert.equal(href,view==='collection'?item.href:item.href+(view==='product'&&item.id!=='catalog'?'':'?platform=naver'));
      assert.equal(state.view,view);
      assert.equal(state.workspace,item.id);
      assert.equal(state.platform,view==='collection'||view==='product'&&item.id!=='catalog'?'all':'naver');
    }
  }
});

test('all existing functions appear once in the nine owner-oriented sidebar groups', () => {
  assert.deepEqual(HUB_NAV_GROUPS.map(group=>group.label),['오늘','주문·배송','고객·CS','재고·상품','정산·비용','분석','실행','수집상태','설정']);
  const grouped=HUB_NAV_GROUPS.flatMap(group=>group.items);
  assert.equal(grouped.length,HUB_NAV.length);
  assert.equal(new Set(grouped).size,HUB_NAV.length);
  assert.deepEqual(new Set(grouped),new Set(HUB_NAV.map(item=>item.id)));
  assert.equal(groupForView('main'),'today');
  assert.equal(groupForView('orders'),'orders');
  assert.equal(groupForView('cs'),'customer');
  assert.equal(groupForView('keyword'),'analysis');
  assert.equal(groupForView('market'),'analysis');
  assert.equal(groupForView('product'),'inventory');
  assert.equal(groupForView('knowledge'),'settings');
  assert.equal(groupForView('changes'),'execution');
  assert.equal(groupForView('notifications'),'execution');
  assert.equal(groupForView('collection'),'collection');
});

test('breadcrumb context uses group, function, and selected platform', () => {
  const context=navigationContext('product','coupang');
  assert.equal(context.group.label,'재고·상품');
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

test('legacy addresses redirect to canonical route pages', async () => {
  const redirects=await require('../next.config.js').redirects();
  assert.ok(redirects.some(item=>item.source==='/reports'&&item.destination==='/diagnoses'));
  assert.ok(redirects.some(item=>item.source==='/alerts'&&item.destination==='/notifications'));
  assert.ok(redirects.some(item=>item.source==='/coupang/orders'&&item.destination==='/orders'));
  assert.ok(redirects.every(item=>item.permanent===true));
});
