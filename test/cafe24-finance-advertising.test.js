'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const finance = require('../lib/cafe24/finance-advertising.js');
const configModule = require('../lib/cafe24/config.js');

test('Cafe24 일별 매출통계 응답을 결제·환불·판매건수로 보존한다', () => {
  const rows = finance.mapDailySales({
    financials: [
      { date:'2026-08-30', payment_amount:'120,000', refund_amount:'10,000', sales_count:'4' },
      { date:'2026-08-31', payment_amount:null, refund_amount:'0', sales_count:'0' }
    ]
  }, { shopNo:1 });

  assert.deepEqual(rows.map(({raw_data,...row})=>row), [
    { date:'2026-08-30', shop_no:1, payment_amount:120000, refund_amount:10000, sales_count:4, source_status:'OK' },
    { date:'2026-08-31', shop_no:1, payment_amount:null, refund_amount:0, sales_count:0, source_status:'PARTIAL' }
  ]);
});

test('Cafe24 광고매체·키워드 성과를 기간 귀속 자료로 합친다', () => {
  const rows = finance.mapAdAttribution({
    adDetails:{ addetails:[
      { ad:'네이버', keyword:'작두콩차', visit_count:'20', purchase_count:'3', order_amount:'45,000', purchase_rate:'15.0' }
    ]},
    adSales:{ adsales:[
      { ad:'네이버', order_count:'5', order_amount:'70,000', join_count:'2' },
      { ad:'구글', order_count:'1', order_amount:'12,000', join_count:'0' }
    ]},
    adVisits:{ ads:[
      { ad:'네이버', visit_count:'50' },
      { ad:'구글', visit_count:'8' }
    ]}
  }, { shopNo:1, period:{start_date:'2026-08-25',end_date:'2026-08-31'} });

  const media = rows.find(row=>row.dimension_type==='MEDIA'&&row.ad==='네이버');
  const keyword = rows.find(row=>row.dimension_type==='KEYWORD'&&row.keyword==='작두콩차');
  assert.deepEqual(
    {visits:media.visit_count,orders:media.order_count,revenue:media.revenue,joins:media.join_count},
    {visits:50,orders:5,revenue:70000,joins:2}
  );
  assert.deepEqual(
    {visits:keyword.visit_count,orders:keyword.order_count,revenue:keyword.revenue,rate:keyword.purchase_rate},
    {visits:20,orders:3,revenue:45000,rate:15}
  );
  assert.ok(rows.every(row=>row.period_start==='2026-08-25'&&row.period_end==='2026-08-31'));
});

test('Cafe24 광고비가 API 응답에 없으면 0원으로 생성하지 않는다', () => {
  const rows = finance.mapAdAttribution({
    adSales:{ adsales:[{ ad:'네이버', order_count:'2', order_amount:'30,000' }] }
  }, { shopNo:1, period:{start_date:'2026-08-25',end_date:'2026-08-31'} });
  assert.equal(rows[0].ad_spend, null);
});

test('Cafe24 광고 성과값이 모두 비어 있으면 정상 자료로 오인하지 않는다', () => {
  const rows = finance.mapAdAttribution({
    adVisits:{ ads:[{ ad:'네이버 쇼핑검색' }] }
  }, { shopNo:1, period:{start_date:'2026-08-25',end_date:'2026-08-31'} });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_status, 'PARTIAL');
});

test('Cafe24 OAuth가 매출통계 읽기 권한을 요청하고 광고는 기존 분석 권한을 사용한다', () => {
  const previous={};
  for(const [key,value] of Object.entries({
    CAFE24_MALL_ID:'mall',CAFE24_CLIENT_ID:'client',CAFE24_CLIENT_SECRET:'secret',CAFE24_REDIRECT_URI:'https://example.com/callback'
  })) { previous[key]=process.env[key]; process.env[key]=value; }
  try {
    const config=configModule.getConfig();
    assert.ok(config.restrictedScopes.includes('mall.read_salesreport'));
    assert.ok(config.scopes.includes('mall.read_salesreport'));
    assert.ok(config.requiredScopes.includes('mall.read_analytics'));
    assert.equal(config.analyticsPaths.adDetails,'/adeffect/addetails');
    assert.equal(config.analyticsPaths.adSales,'/visitpaths/adsales');
    assert.equal(config.analyticsPaths.adVisits,'/visitpaths/ads');
  } finally {
    for(const [key,value] of Object.entries(previous)) value===undefined?delete process.env[key]:process.env[key]=value;
  }
});

test('일일 자동수집이 Cafe24 매출통계와 광고 귀속 저장소를 함께 갱신한다', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','lib/cafe24/sync.js'),'utf8');
  assert.match(source,/\/financials\/dailysales/);
  assert.match(source,/cafe24_sales_daily/);
  assert.match(source,/cafe24_ad_attribution/);
  assert.match(source,/mapAdAttribution/);
});
