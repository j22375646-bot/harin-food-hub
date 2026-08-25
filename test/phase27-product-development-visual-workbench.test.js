const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('27-6 상품 화면은 판매상품에서 운영 준비 완료까지 실제 상태 흐름을 보여준다', () => {
  const center = read('app/unified-product-operations-center.js');
  const visual = read('app/_products/product-readiness-flow.js');

  assert.match(center, /ProductReadinessFlow/);
  assert.match(center, /<ProductReadinessFlow center=\{center\}\/>/);
  assert.match(visual, /data-core-visualization="product-readiness-flow"/);
  for (const label of ['판매 기준상품', '채널 연결 완료', '확인 필요', '운영 준비 완료']) {
    assert.match(visual, new RegExp(label));
  }
  assert.match(visual, /판단 보류/);
  assert.match(visual, /\/products\/mappings/);
  assert.match(visual, /\/products\/costs/);
});

test('27-6 상품개발은 전체 상품 카드 대신 현재 선택 상품의 개발 흐름만 보여준다', () => {
  const home = read('app/market-intelligence/project-home.js');
  const visual = read('app/market-intelligence/selected-product-development-flow.js');

  assert.match(home, /SelectedProductDevelopmentFlow/);
  assert.match(home, /selected=\{selected\}/);
  assert.doesNotMatch(home, /상품별 개발 현황/);
  assert.doesNotMatch(home, /marketProjectGrid|marketDevelopmentCard/);
  assert.match(visual, /data-core-visualization="selected-product-development-flow"/);
  assert.match(visual, /현재 선택 상품/);
  for (const label of ['자료 준비', '시장 분석', '경쟁·전환 설계', 'A\/B 실험', '결과 학습']) {
    assert.match(visual, new RegExp(label));
  }
  assert.match(visual, /\/ab-tests\?/);
  assert.doesNotMatch(visual, /작수차|카페24 상품/);
});

test('27-6 시각 작업대는 평면 V8 규칙과 모바일·동작 감소 설정을 지킨다', () => {
  const productCss = read('app/_products/product-readiness-flow.module.css');
  const developmentCss = read('app/market-intelligence/selected-product-development-flow.module.css');
  const marketCss = read('app/_analysis/harin-market-intelligence.css');
  const css = `${productCss}\n${developmentCss}`;

  assert.doesNotMatch(css, /gradient\(|backdrop-filter|filter:\s*blur/i);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /border-radius:\s*(12|14|16)px/);
  assert.doesNotMatch(marketCss, /\.harinV8 \.marketHubMain\{[^}]*radial-gradient/);
  assert.doesNotMatch(marketCss, /\.harinV8 \.marketProductPicker\{[^}]*gradient/);
  assert.doesNotMatch(marketCss, /\.harinV8 \.marketFlowGrid|\.harinV8 \.marketProjectGrid/);
}
);
