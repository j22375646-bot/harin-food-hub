'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const presentation = require('../lib/reports/presentation.js');

const report = {
  platform:'CAFE24', report_type:'WEEKLY', period_start:'2026-08-01', period_end:'2026-08-07', version:2,
  title:'Cafe24 주간 보고서', created_at:'2026-08-08T00:00:00Z',
  summary_json:{ score:88, cafe24:{ revenue:500000,orders:10,visitors:100,conversion_rate:10,analytics:{coverage:{referrerAttribution:'NOT_COLLECTED'}}}, executive:{ doing_well:[{body:'매출이 증가했습니다.'}], problems:[{body:'직접 유입이 많습니다.'}], opportunities:[{title:'UTM 정리'}], today_actions:[{title:'링크 정리'}] }, data_coverage:{cafe24_traffic:{status:'PARTIAL',actual_days:6,expected_days:7}} }
};

test('owner summary contains server-calculated KPIs and data caveats', () => {
  const result = presentation.ownerSummary(report);
  assert.equal(result.version, 2);
  assert.deepEqual(result.kpis[0], ['결제 매출','500,000원']);
  assert.match(result.dataNotes.join(' '), /6\/7일/);
  assert.match(result.dataNotes.join(' '), /미수집/);
});

test('print HTML escapes stored content and exposes PDF print action', () => {
  const html = presentation.ownerHtml({...report,title:'<script>alert(1)</script>'});
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /window\.print/);
  assert.match(html, /오늘의 액션 TOP 3/);
});

test('full report contains detailed diagnosis and tables', () => {
  const html = presentation.fullHtml({...report,summary_json:{...report.summary_json,insights:[{title:'진단',body:'설명'}],recommendations:[{title:'조치',reason:'이유'}],cafe24:{...report.summary_json.cafe24,top_products:[{name:'상품 A',orders:2,quantity:3,revenue:10000}]}}});
  assert.match(html, /자동 진단/);
  assert.match(html, /상품 성과/);
  assert.match(html, /상품 A/);
});
