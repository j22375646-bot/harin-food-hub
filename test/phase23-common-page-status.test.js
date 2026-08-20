'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { relativeFreshnessLabel } = require('../lib/ui/freshness.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const client = read('app/dashboard-client.js');
const shell = read('app/_shell/harin-app-shell.js');
const main = read('app/_main/harin-main-command-center.js');
const analysis = read('app/_analysis/harin-analysis-workbench.js');
const execution = read('app/_execution/harin-execution-workbench.js');
const project = read('app/market-intelligence/project-home.js');
const styles = read('app/globals.css');

test('relative freshness labels use short owner-readable elapsed times', () => {
  const now = new Date('2026-08-20T10:00:00.000Z');
  assert.equal(relativeFreshnessLabel(null, now), '갱신 기록 없음');
  assert.equal(relativeFreshnessLabel('2026-08-20T09:59:30.000Z', now), '방금 전');
  assert.equal(relativeFreshnessLabel('2026-08-20T09:52:00.000Z', now), '8분 전');
  assert.equal(relativeFreshnessLabel('2026-08-20T07:40:00.000Z', now), '2시간 전');
  assert.equal(relativeFreshnessLabel('2026-08-18T10:00:00.000Z', now), '2일 전');
  assert.equal(relativeFreshnessLabel('not-a-date', now), '시각 확인 필요');
});

test('one common status strip owns connection and freshness on every page', () => {
  assert.match(client, /function DataStatusPanel\(\{ data, platform='all', refreshedAt, generatedAt, onOpenCollection \}\)/);
  assert.match(client, /window\.setInterval\(\(\)=>setClock\(Date\.now\(\)\),60\*1000\)/);
  assert.match(client, /최근 전체 갱신 \{refreshAge\}/);
  assert.match(client, /relativeFreshnessLabel\(lastAt,relativeNow\)/);
  assert.match(client, /<HarinIcon name="database" size=\{18\}\/?>/);
  assert.match(client, /<DataStatusPanel data=\{initialData\} platform=\{platform\}/);
  assert.doesNotMatch(client, /view!==['"]main['"]&&<DataStatusPanel/);
  assert.doesNotMatch(shell, /refreshedLabel/);
});

test('status strip remains compact and horizontally readable on mobile', () => {
  assert.match(styles, /\.pageDataStatusChannels>span\{[^}]*min-width:124px/);
  assert.match(styles, /\.pageDataStatusChannels>span>span\{[^}]*flex-direction:column/);
  assert.match(styles, /\.pageDataStatusChannels\{grid-column:1\/-1;grid-row:2;justify-content:flex-start;overflow-x:auto/);
  assert.match(styles, /scrollbar-width:none/);
});

test('major workbench top labels use simple Korean instead of decorative English', () => {
  for (const value of ['SMART SCHEDULE','EXCEPTION INBOX','TODAY ACTION · TOP 3','BUSINESS PACING','CHANNEL HEALTH','PRODUCT SIGNAL','30-DAY OUTLOOK']) {
    assert.doesNotMatch(main, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const value of ['오늘 시간표','운영 예외함','오늘의 우선 행동 · 3개','월간 매출 속도','채널 수집 상태','상품 성과 신호','앞으로 30일']) assert.match(main, new RegExp(value));
  for (const value of ['PERFORMANCE SNAPSHOT','CAUSE PATH','CHANNEL MATRIX','PROFIT WATERFALL']) assert.doesNotMatch(analysis, new RegExp(value));
  for (const value of ['기간별 성과 요약','원인 흐름','채널 비교표','실제 이익 흐름']) assert.match(analysis, new RegExp(value));
  for (const value of ['진단 근거','변경 안전 기록','실행 결과 검증','실험 학습']) assert.match(execution, new RegExp(value));
  for (const value of ['상품개발','재사용 개발 흐름','개발 진행판']) assert.match(project, new RegExp(value));
});
