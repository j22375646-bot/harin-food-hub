'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HUB_NAV, normalizeHubState, buildHubHref } = require('../lib/navigation/hub-routes.js');

test('all nine hub functions have stable unique addresses', () => {
  assert.equal(HUB_NAV.length,9);
  assert.equal(new Set(HUB_NAV.map(item=>item.href)).size,9);
  assert.equal(buildHubHref({view:'collection'}),'/data-collection');
  assert.equal(buildHubHref({view:'notifications'}),'/notifications');
});

test('platform, product, and period survive a refresh through the URL', () => {
  const href=buildHubHref({view:'main',platform:'coupang',product:'123-ABC',period:'WEEK'});
  assert.equal(href,'/?platform=coupang&period=WEEK&product=123-ABC');
  assert.deepEqual(normalizeHubState({view:'main',platform:'coupang',product:'123-ABC',period:'WEEK'}),{
    view:'main',platform:'coupang',product:'123-ABC',period:'WEEK'
  });
});

test('unknown URL state falls back safely', () => {
  assert.deepEqual(normalizeHubState({view:'admin',platform:'unknown',product:'../../secret',period:'YEAR'}),{
    view:'main',platform:'all',product:'secret',period:'DAY'
  });
});
