'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const routes=require('../lib/navigation/hub-routes.js');

test('22-8 migrates old view query bookmarks to canonical route pages',()=>{
  assert.equal(routes.canonicalLegacyHubHref('/?view=notifications'),'/notifications');
  assert.equal(routes.canonicalLegacyHubHref('/?view=collection&workspace=naver-api'),'/data-collection/naver-api');
  assert.equal(
    routes.canonicalLegacyHubHref('/?view=insight&workspace=causes&platform=coupang&period=WEEK&product=SKU-1'),
    '/insights/causes?platform=coupang&period=WEEK&product=SKU-1'
  );
  assert.equal(routes.canonicalLegacyHubHref('/?view=unknown'),null);
  assert.equal(routes.canonicalLegacyHubHref('/orders?view=notifications'),null);
});

test('22-8 keeps all old path redirects unique and free of redirect cycles',async()=>{
  const redirects=await require('../next.config.js').redirects();
  const legacyRedirects=redirects.filter(item=>routes.HUB_LEGACY_ROUTES.some(route=>route.href===item.source));
  assert.equal(legacyRedirects.length,routes.HUB_LEGACY_ROUTES.length);
  assert.equal(new Set(redirects.map(item=>item.source)).size,redirects.length);
  const sources=new Set(redirects.map(item=>item.source));
  for(const item of redirects){
    assert.equal(item.permanent,true);
    assert.notEqual(item.source,item.destination);
    assert.equal(sources.has(item.destination),false);
  }
});

test('22-8 canonical migration runs after login and preserves owner-only protection',()=>{
  const proxy=fs.readFileSync(path.resolve(__dirname,'..','proxy.js'),'utf8');
  assert.match(proxy,/canonicalLegacyHubHref/);
  assert.match(proxy,/NextResponse\.redirect\(new URL\(canonicalHref, request\.url\), 308\)/);
  assert.ok(proxy.indexOf('if (!session)')<proxy.indexOf('canonicalLegacyHubHref'));
  assert.ok(proxy.indexOf('canonicalLegacyHubHref')<proxy.indexOf("session.role !== 'OWNER'"));
});

test('22-8 ships an explicit phase rollback boundary',()=>{
  const rollback=fs.readFileSync(path.resolve(__dirname,'..','docs','PHASE22_ROLLBACK.md'),'utf8');
  assert.match(rollback,/v1\.34\.0/);
  assert.match(rollback,/git checkout v1\.34\.0/);
  assert.match(rollback,/harin-cafe24-sync\.vercel\.app/);
  assert.match(rollback,/데이터베이스 되돌리기 불필요/);
});
