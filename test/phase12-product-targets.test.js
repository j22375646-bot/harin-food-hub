'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('12-1 상품 화면은 상품별 광고 목표 계산센터와 서버 API를 연결한다', () => {
  const dashboard=fs.readFileSync('app/dashboard-client.js','utf8');
  const page=fs.readFileSync('app/page.js','utf8');
  assert.match(dashboard,/ProductAdTargetsCenter/);
  assert.match(page,/buildProductAdTargets/);
  assert.match(page,/product_ad_targets/);
});

test('상품별 목표 테이블은 브라우저 역할을 차단하고 service role만 허용한다', () => {
  const migration=fs.readFileSync('supabase/migrations/20260814122404_add_product_ad_targets.sql','utf8');
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/revoke all on public\.product_ad_targets from anon, authenticated/i);
  assert.match(migration,/grant select, insert, update, delete on public\.product_ad_targets to service_role/i);
});
