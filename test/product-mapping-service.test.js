'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../lib/products/mapping-service.js');

test('쿠팡과 네이버 커머스 실상품만 매핑 원천으로 만들고 네이버 광고그룹은 제외한다', () => {
  const sources = service.createProductSources({
    channelProducts:[
      {platform:'NAVER',external_product_id:'NP1',external_product_name:'작두콩차 30티백',selling_price:11000,is_active:true,raw_data:{source_type:'NAVER_COMMERCE_PRODUCT'}},
      {platform:'NAVER',external_product_id:'AD1',external_product_name:'작두콩차 광고그룹',is_active:true,raw_data:{source_type:'NAVER_ADGROUP'}}
    ],
    coupangProducts:[{seller_product_id:'C1',product_name:'국화차',status:'APPROVED'}],
    coupangProductItems:[{seller_product_id:'C1',sale_price:12000}]
  });
  assert.deepEqual(sources.map(item=>item.platform).sort(), ['COUPANG','NAVER']);
  assert.equal(sources.find(item=>item.platform==='COUPANG').selling_price, 12000);
  assert.equal(sources.find(item=>item.platform==='NAVER').source_type, 'NAVER_COMMERCE_PRODUCT');
  assert.equal(sources.some(item=>item.source_type==='NAVER_ADGROUP'), false);
});

test('가장 최근 거절 또는 연결해제 결정만 후보 억제에 사용한다', () => {
  const rows = [
    {platform:'COUPANG',external_product_id:'C1',new_master_product_id:'M1',action:'LINKED'},
    {platform:'COUPANG',external_product_id:'C1',new_master_product_id:'M1',action:'REJECTED'},
    {platform:'NAVER',external_product_id:'N1',previous_master_product_id:'M2',action:'UNLINKED'}
  ];
  assert.deepEqual(service.rejectedPairKeys(rows), ['NAVER:N1:M2']);
});

test('매핑 대시보드는 연결 현황과 고신뢰 후보를 함께 계산한다', () => {
  const dashboard = service.buildMappingDashboard({
    masterProducts:[{id:'M1',name:'돼지감자차 36g(1.2gX30TB)',selling_price:11000,is_active:true}],
    channelProducts:[],
    coupangProducts:[{seller_product_id:'C1',product_name:'돼지감자차 (1.2gx30티백)',status:'APPROVED'}],
    coupangProductItems:[{seller_product_id:'C1',sale_price:11000}]
  });
  assert.equal(dashboard.summary.candidate_total, 1);
  assert.equal(dashboard.summary.auto_eligible, 1);
  assert.equal(dashboard.candidates[0].candidates[0].master_product_id, 'M1');
});

test('기존 네이버 광고그룹 연결은 상품 연결 집계와 후보에서 제외한다', () => {
  const dashboard = service.buildMappingDashboard({
    masterProducts:[{id:'M1',name:'작두콩차 30티백',selling_price:11000,is_active:true}],
    channelProducts:[{id:'N1',master_product_id:'M1',platform:'NAVER',external_product_id:'AD1',external_product_name:'광고 / 작두콩차',is_active:true,raw_data:{source_type:'NAVER_ADGROUP'}}],
    naverCampaigns:[{ncc_campaign_id:'C1',name:'작두콩차',campaign_type:'SHOPPING'}],
    naverAdgroups:[{ncc_adgroup_id:'AD1',ncc_campaign_id:'C1',name:'모바일',status:'ELIGIBLE'}]
  });
  assert.equal(dashboard.summary.source_naver, 0);
  assert.equal(dashboard.summary.linked_naver, 0);
  assert.equal(dashboard.links.length, 0);
  assert.equal(dashboard.candidates.length, 0);
});

test('네이버 스마트스토어 실상품 후보와 쿠팡 후보를 플랫폼별로 분리 집계한다', () => {
  const dashboard = service.buildMappingDashboard({
    masterProducts:[{id:'M1',name:'작두콩차 30티백',selling_price:11000,is_active:true}],
    channelProducts:[{platform:'NAVER',external_product_id:'NP1',external_product_name:'작두콩차 30티백',selling_price:11000,is_active:true,raw_data:{source_type:'NAVER_COMMERCE_PRODUCT'}}],
    coupangProducts:[{seller_product_id:'CP1',product_name:'작두콩차 30티백',status:'APPROVED'}],
    coupangProductItems:[{seller_product_id:'CP1',sale_price:11000}]
  });
  assert.equal(dashboard.summary.source_naver, 1);
  assert.equal(dashboard.summary.source_coupang, 1);
  assert.equal(dashboard.summary.candidate_naver, 1);
  assert.equal(dashboard.summary.candidate_coupang, 1);
  assert.deepEqual([...new Set(dashboard.candidates.map(item=>item.platform))].sort(), ['COUPANG','NAVER']);
});

test('판매 중단 외부 상품은 매칭 후보와 연결 집계에서 제외한다', () => {
  const dashboard = service.buildMappingDashboard({
    masterProducts:[{id:'M1',name:'레드비트차 30티백',selling_price:11000,is_active:true}],
    channelProducts:[
      {id:'L1',master_product_id:'M1',platform:'COUPANG',external_product_id:'ACTIVE',is_active:true},
      {id:'L2',master_product_id:'M1',platform:'COUPANG',external_product_id:'STOPPED',is_active:true}
    ],
    coupangProducts:[
      {seller_product_id:'ACTIVE',product_name:'레드비트차 30티백',status:'APPROVED'},
      {seller_product_id:'STOPPED',product_name:'레드비트차 사은품',status:'STOPPED'}
    ]
  });
  assert.equal(dashboard.summary.source_coupang, 1);
  assert.equal(dashboard.summary.linked_coupang, 1);
  assert.equal(dashboard.summary.inactive_sources, 1);
  assert.deepEqual(dashboard.links.map(item=>item.external_product_id), ['ACTIVE']);
});
