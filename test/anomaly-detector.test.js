'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const detector = require('../lib/anomaly/detector.js');

const okCoverage = { cafe24_traffic:{status:'OK'}, naver_ads:{status:'OK'} };

test('매출과 주문의 직전 동일기간 급락을 이상징후로 탐지한다', () => {
  const rows = detector.detectAnomalies({
    comparison:{
      cafe24_revenue:{current:60000,previous:100000,change_rate:-40},
      cafe24_orders:{current:8,previous:10,change_rate:-20}
    },
    coverage:okCoverage
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].severity, 'ERROR');
  assert.equal(rows[1].severity, 'WARNING');
});

test('CPC 상승, CVR 하락, CPA 상승을 각각 탐지한다', () => {
  const rows = detector.detectAnomalies({
    platform:'NAVER',
    comparison:{
      naver_cpc:{current:700,previous:500,change_rate:40},
      naver_cvr:{current:2,previous:4,change_rate:-50},
      naver_cpa:{current:15000,previous:10000,change_rate:50}
    },
    coverage:okCoverage
  });
  assert.deepEqual(rows.map(item=>item.metric), ['CPC','CVR','CPA']);
  assert.ok(rows.every(item=>item.severity==='ERROR'));
});

test('데이터 미수집 또는 기간 비교 왜곡 시 오탐을 만들지 않는다', () => {
  const comparison={naver_cpc:{current:1000,previous:500,change_rate:100}};
  assert.equal(detector.detectAnomalies({comparison,coverage:{naver_ads:{status:'INCOMPLETE'}}}).length,0);
  assert.equal(detector.detectAnomalies({comparison,coverage:okCoverage,comparisonSafe:false}).length,0);
});

test('기준값이 너무 작은 표본의 큰 증감률은 무시한다', () => {
  const rows=detector.detectAnomalies({comparison:{cafe24_orders:{current:0,previous:1,change_rate:-100}},coverage:okCoverage});
  assert.equal(rows.length,0);
});

test('광고비와 매출이 함께 성장하면 광고비 상승 경보를 억제한다', () => {
  const rows=detector.detectAnomalies({platform:'NAVER',comparison:{naver_spend:{current:14000,previous:10000,change_rate:40},naver_revenue:{current:150000,previous:100000,change_rate:50}},coverage:okCoverage});
  assert.equal(rows.length,0);
});

test('쿠팡 광고 CPC, CVR, CPA도 동일 기준으로 탐지한다', () => {
  const rows=detector.detectAnomalies({platform:'COUPANG',comparison:{coupang_ad_cpc:{current:650,previous:500,change_rate:30},coupang_ad_cvr:{current:2,previous:3,change_rate:-33.3},coupang_ad_cpa:{current:13000,previous:10000,change_rate:30}}});
  assert.deepEqual(rows.map(item=>item.metric),['CPC','CVR','CPA']);
});
