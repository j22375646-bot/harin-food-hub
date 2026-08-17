'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const apiHub = require('../lib/naver-api-hub/client.js');
const evidence = require('../lib/market-intelligence/naver-evidence.js');

const root = path.join(__dirname, '..');

test('phase 18-5 uses each official NAVER API HUB Search route with server headers', async () => {
  const requests = [];
  for (const [type, pathname] of Object.entries(apiHub.SEARCH_PATHS)) {
    const result = await apiHub.fetchSearch({
      type, query:'작두콩차 후기', display:30, start:0, sort:type === 'KIN' ? 'point' : 'sim',
      config:{clientId:'client-id',clientSecret:'client-secret'},
      fetchImpl:async (url, options) => {
        requests.push({type,url,options});
        return {ok:true,status:200,json:async()=>({items:[]})};
      }
    });
    assert.equal(result.pathname, pathname);
  }
  assert.equal(requests.length, 4);
  for (const request of requests) {
    const url = new URL(request.url);
    assert.equal(url.pathname, apiHub.SEARCH_PATHS[request.type]);
    assert.equal(url.searchParams.get('query'), '작두콩차 후기');
    assert.equal(url.searchParams.get('display'), '10');
    assert.equal(url.searchParams.get('start'), '1');
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.headers['X-NCP-APIGW-API-KEY-ID'], 'client-id');
    assert.equal(request.options.headers['X-NCP-APIGW-API-KEY'], 'client-secret');
  }
});

test('search items are normalized without HTML and keep a safe original URL', () => {
  const item = evidence.normalizeItem('BLOG', {
    title:'<b>작두콩차</b> 후기', description:'따뜻한&nbsp;<b>차</b> 이야기',
    link:'https://blog.naver.com/example/123#comment', bloggername:'하린 이웃', postdate:'20260817'
  }, {query:'작두콩차',fetchedAt:'2026-08-17T01:00:00.000Z'});
  assert.equal(item.title, '작두콩차 후기');
  assert.equal(item.description, '따뜻한 차 이야기');
  assert.equal(item.source_url, 'https://blog.naver.com/example/123');
  assert.equal(item.published_at, '2026-08-17');
  assert.match(item.external_key, /^[a-f0-9]{64}$/u);
});

test('candidate signatures prevent the browser from changing a saved source', () => {
  const candidate = evidence.normalizeItem('NEWS', {
    title:'작두콩차 소식', description:'공개 기사 요약',
    originallink:'https://news.example.com/article/1', pubDate:'Mon, 17 Aug 2026 10:00:00 +0900'
  }, {query:'작두콩차',fetchedAt:'2026-08-17T01:00:00.000Z'});
  const token = evidence.signCandidate(candidate, 'test-secret');
  assert.equal(evidence.verifyCandidate(candidate, token, 'test-secret'), true);
  assert.equal(evidence.verifyCandidate({...candidate,title:'바꾼 제목'}, token, 'test-secret'), false);
  assert.equal(evidence.verifyCandidate(candidate, 'not-a-token', 'test-secret'), false);
});

test('unsupported protocols and source types are rejected', () => {
  assert.throws(() => evidence.safeUrl('javascript:alert(1)'), /원문 주소/);
  assert.throws(() => evidence.normalizeTypes(['video']), /1개 이상/);
  assert.deepEqual(evidence.normalizeTypes(['blog','BLOG','news']), ['BLOG','NEWS']);
});

test('the data-room flow keeps candidates review-only and does not crawl original pages', () => {
  const service = fs.readFileSync(path.join(root,'lib/market-intelligence/naver-evidence.js'),'utf8');
  const route = fs.readFileSync(path.join(root,'app/api/market-intelligence/projects/[projectId]/naver-evidence/route.js'),'utf8');
  const workspace = fs.readFileSync(path.join(root,'app/market-intelligence/[projectId]/workspace-page.js'),'utf8');
  assert.match(service, /status:'OWNER_CONFIRMATION_REQUIRED'/);
  assert.match(service, /ingest_status:'REVIEW_REQUIRED'/);
  assert.match(service, /external_page_fetch:false/);
  assert.match(service, /automatic_fact_confirmation:false/);
  assert.match(route, /isAuthorized\(request,authModule\)/);
  assert.match(route, /maxBytes:64\*1024/);
  assert.match(workspace, /MarketNaverEvidenceSearch/);
});
