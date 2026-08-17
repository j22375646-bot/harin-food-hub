'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readiness = require('../lib/naver/api-readiness.js');
const routes = require('../lib/navigation/hub-routes.js');

const root = path.join(__dirname, '..');

test('phase 18-1 keeps all three Naver credential domains separate', () => {
  const center = readiness.buildNaverApiReadiness({ syncs:[], env:{}, now:new Date('2026-08-17T01:00:00Z') });
  assert.equal(center.phase, '18-1');
  assert.deepEqual(center.services.map(item => item.key), ['commerce','searchAds','apiHub']);
  assert.equal(center.services.every(item => item.status === 'SETUP_REQUIRED'), true);
  assert.equal(center.services.every(item => item.writeEnabled === false), true);
});

test('a failed API HUB probe does not downgrade Commerce or Search Ads', () => {
  const center = readiness.buildNaverApiReadiness({
    syncs:[
      { platform:'NAVER', job_type:'COMMERCE_CONNECTION_TEST', status:'SUCCESS', finished_at:'2026-08-17T00:00:00Z', metadata:{ capabilities:{ products:{read:true}, orders:{read:true} } } },
      { platform:'NAVER', job_type:'SEARCH_AD_CONNECTION_TEST', status:'SUCCESS', finished_at:'2026-08-17T00:01:00Z', metadata:{ capabilities:{ campaigns:{read:true}, keywords:{read:true}, bids:{read:true} } } },
      { platform:'NAVER', job_type:'API_HUB_CONNECTION_TEST', status:'FAILED', finished_at:'2026-08-17T00:02:00Z', error_message:'invalid key', metadata:{ requestAttempted:true } }
    ],
    env:{}, now:new Date('2026-08-17T01:00:00Z')
  });
  assert.equal(center.services.find(item => item.key === 'commerce').status, 'READY');
  assert.equal(center.services.find(item => item.key === 'searchAds').status, 'READY');
  assert.equal(center.services.find(item => item.key === 'apiHub').status, 'FAILED');
});

test('API HUB usage counts only this month requests attempted by the hub', () => {
  const center = readiness.buildNaverApiReadiness({
    syncs:[
      { platform:'NAVER', job_type:'API_HUB_CONNECTION_TEST', status:'SUCCESS', started_at:'2026-08-01T00:00:00Z', metadata:{ requestAttempted:true } },
      { platform:'NAVER', job_type:'API_HUB_CONNECTION_TEST', status:'FAILED', started_at:'2026-08-16T00:00:00Z', metadata:{ requestAttempted:true } },
      { platform:'NAVER', job_type:'API_HUB_CONNECTION_TEST', status:'FAILED', started_at:'2026-08-16T01:00:00Z', metadata:{ requestAttempted:false, code:'NAVER_API_HUB_CONFIG_REQUIRED' } },
      { platform:'NAVER', job_type:'API_HUB_CONNECTION_TEST', status:'SUCCESS', started_at:'2026-07-31T00:00:00Z', metadata:{ requestAttempted:true } }
    ],
    env:{}, now:new Date('2026-08-17T01:00:00Z')
  });
  const quota = center.services.find(item => item.key === 'apiHub').quota;
  assert.equal(quota.used, 2);
  assert.equal(quota.limit, 50_000);
  assert.equal(quota.consoleExcluded, true);
});

test('data collection exposes a real Naver API workspace route', () => {
  assert.equal(routes.buildHubHref({ view:'collection', workspace:'naver-api' }), '/data-collection/naver-api');
  assert.deepEqual(routes.parseHubHref('/data-collection/naver-api'), {
    view:'collection', workspace:'naver-api', platform:'all', period:'DAY', product:'ALL'
  });
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/naver-api/page.js')), true);
});

test('probe routes require a signed dashboard session and never expose credentials', () => {
  const files = [
    'app/api/naver/probe/route.js', 'app/api/naver-api-hub/probe/route.js',
    'app/api/naver-commerce/probe/route.js', 'app/naver-api-connection-center.js'
  ].map(file => fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  assert.match(files, /verifySession/);
  assert.doesNotMatch(files, /NEXT_PUBLIC_NAVER/);
  assert.doesNotMatch(files, /clientSecret\s*[:=]\s*result/);
});

test('API HUB probe uses the official gateway path and server-only headers', () => {
  const source = fs.readFileSync(path.join(root,'lib/naver-api-hub/client.js'),'utf8');
  assert.match(source, /naverapihub\.apigw\.ntruss\.com/);
  assert.match(source, /search-trend\/v1\/search/);
  assert.match(source, /X-NCP-APIGW-API-KEY-ID/);
  assert.match(source, /X-NCP-APIGW-API-KEY/);
  assert.match(source, /NAVER_API_HUB_CLIENT_ID/);
  assert.match(source, /NAVER_API_HUB_CLIENT_SECRET/);
});
