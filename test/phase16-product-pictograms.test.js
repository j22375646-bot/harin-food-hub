'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('16-5 상품 연결은 커머스 실상품만 노출하고 네이버 광고그룹을 제외한다', () => {
  const service = read('lib/products/mapping-service.js');
  const productWorkbench = read('app/_products/harin-product-workbench.js');
  assert.match(service, /const PLATFORMS = new Set\(\['NAVER','COUPANG'\]\)/);
  assert.match(service, /NAVER_COMMERCE_PRODUCT/);
  assert.doesNotMatch(service, /source_type:'NAVER_ADGROUP'/);
  assert.match(service, /네이버 광고그룹은 제외되며 스마트스토어 실상품만 연결/);
  assert.match(productWorkbench, /mappingPlatformTabs/);
  assert.match(productWorkbench, /네이버 스마트스토어/);
  assert.match(productWorkbench, /네이버 광고그룹 제외/);
  assert.match(productWorkbench, /채널별 탭에서 따로 연결/);
});

test('16-5 상품 목록과 성장센터는 의미 기반 팩토그램을 사용한다', () => {
  const product = read('app/unified-product-operations-center.js');
  const growth = read('app/product-growth-center.js');
  const icons = read('app/_design-system/harin-icon.js');
  for (const icon of ['store','link','target','price','checklist','growth','database','server','naverStore','shoppingBag']) {
    assert.match(icons, new RegExp(`\\b${icon}:`));
  }
  assert.match(product, /productOpsHeroCopy/);
  assert.match(product, /FILTERS\.map/);
  assert.match(product, /<HarinIcon name="shield"/);
  assert.match(growth, /GrowthBlockTitle/);
  assert.match(growth, /growthCenterTitle/);
  assert.match(growth, /name="growth"/);
});

test('16-5 데이터수집도 채널·흐름·워커 팩토그램과 모바일 규칙을 갖는다', () => {
  const collection = read('app/unified-collection-operations-center.js');
  const styles = read('app/_operations/harin-operations-v8.css');
  assert.match(collection, /collectionChannelTitle/);
  assert.match(collection, /name="database"/);
  assert.match(collection, /name="server"/);
  assert.match(styles, /Phase 16-5: semantic pictograms/);
  assert.match(styles, /\.productMappingRealOnly/);
  assert.match(styles, /\.collectionChannelTitle/);
  assert.match(styles, /@media\(max-width:760px\)/);
});
