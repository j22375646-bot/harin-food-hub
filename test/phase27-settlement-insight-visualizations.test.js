const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('27-4 정산 작업대는 금액 변화와 원인, 다음 행동을 하나의 공개 흐름으로 보여준다', () => {
  const source = read('app/unified-settlement-operations-center.js');

  assert.match(source, /data-core-visualization="settlement-flow"/);
  assert.match(source, />금액 변화</);
  assert.match(source, />원인 확인</);
  assert.match(source, />다음 행동</);
  assert.match(source, /상품 원가와 광고비를 반영한 실제 이익은/);
});

test('27-4 정산 흐름은 알 수 없는 금액을 0원으로 바꾸지 않는다', () => {
  const source = read('app/unified-settlement-operations-center.js');

  assert.doesNotMatch(source, /waterfall\.(?:gross_sales|refunds|fees|expected_payout|logistics|actual_payout|variance)\s*\|\|\s*0/);
  assert.match(source, /value == null \? '확인 필요'/);
});

test('27-4 인사이트는 변화, 원인, 이익, 행동 시각화를 분리하고 플랫폼 범위를 유지한다', () => {
  const source = read('app/_analysis/harin-analysis-workbench.js');

  assert.match(source, /data-core-visualization="insight-decision-flow"/);
  assert.match(source, /data-core-visualization="insight-change"/);
  assert.match(source, /data-core-visualization="insight-cause-action"/);
  assert.match(source, /data-core-visualization="insight-profit-flow"/);
  assert.match(source, /변화/);
  assert.match(source, /원인/);
  assert.match(source, /이익/);
  assert.match(source, /행동/);
  assert.match(source, /scopeReportPlatform\(report\.platform,platform\)/);
});
