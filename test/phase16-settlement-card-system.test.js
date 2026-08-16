'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('16-6 정산 흐름은 텍스트 배경 충돌 없이 의미 기반 팩토그램을 쓴다', () => {
  const source = read('app/unified-settlement-operations-center.js');
  const styles = read('app/_operations/harin-operations-v8.css');
  assert.match(source, /function platformIcon/);
  assert.match(source, /settlementJourneyCopy/);
  assert.match(source, /settlementOpsChannelTitle/);
  assert.match(source, /name=\{platformIcon\(item\.platform\)\}/);
  assert.doesNotMatch(source, /<em><b>\{label\}<\/b>/);
  assert.match(styles, /Phase 16-6: settlement pictograms and clean pastel money flow/);
  assert.match(styles, /article\.minus span>em/);
  assert.match(styles, /article\.result span>em\{background:transparent!important/);
});

test('16-6 동급 흐름 카드는 인사이트·상품·수집 화면까지 같은 규격을 쓴다', () => {
  const marketing = read('app/marketing-diagnosis-center.js');
  const styles = read('app/_operations/harin-operations-v8.css');
  assert.match(marketing, /marketingFunnelStage/);
  for (const icon of ['search','target','orders','growth']) {
    assert.match(marketing, new RegExp(`icon:'${icon}'`));
  }
  assert.match(styles, /\.settlementMoneyJourney article,\.marketingFunnelStage>section,\.growthSteps>span,\.collectionOpsFlow article/);
  assert.match(styles, /@media\(max-width:900px\)\{\.marketingFunnel\{grid-template-columns:1fr 1fr\}/);
  assert.match(styles, /@media\(max-width:600px\)/);
});
