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

test('일괄 자동연결은 선택한 플랫폼의 고신뢰 실상품만 계획한다', () => {
  const dashboard = {
    candidates:[
      {platform:'NAVER',external_product_id:'N1',auto_eligible:true,candidates:[{master_product_id:'M1',score:0.98}]},
      {platform:'NAVER',external_product_id:'N2',auto_eligible:false,candidates:[{master_product_id:'M2',score:0.72}]},
      {platform:'COUPANG',external_product_id:'C1',auto_eligible:true,candidates:[{master_product_id:'M3',score:0.99}]}
    ],
    links:[]
  };
  const plan = service.planBulkMappingOperations({ dashboard, action:'BULK_AUTO_LINK', platform:'NAVER', externalProductIds:['N1','N2','C1'] });
  assert.equal(plan.requested, 3);
  assert.equal(plan.skipped, 2);
  assert.deepEqual(plan.operations.map(item=>[item.source.platform,item.source.external_product_id,item.masterProductId]), [['NAVER','N1','M1']]);
});

test('일괄 연결해제도 플랫폼을 섞지 않고 선택한 연결만 계획한다', () => {
  const dashboard = {
    candidates:[],
    links:[
      {platform:'NAVER',external_product_id:'SAME',external_product_name:'네이버 상품'},
      {platform:'COUPANG',external_product_id:'SAME',external_product_name:'쿠팡 상품'}
    ]
  };
  const plan = service.planBulkMappingOperations({ dashboard, action:'BULK_UNLINK', platform:'COUPANG', externalProductIds:['SAME'] });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].source.platform, 'COUPANG');
  assert.equal(plan.operations[0].rpcAction, 'UNLINK');
});

test('다중 직접 연결은 각 채널 상품을 선택한 기준상품에 한 번에 연결한다', () => {
  const dashboard = {
    masterProducts:[
      {id:'M1',name:'작두콩차 30티백',selling_price:11000,is_active:true},
      {id:'M2',name:'우엉차 40티백',selling_price:14200,is_active:true}
    ],
    candidates:[
      {platform:'NAVER',external_product_id:'N1',external_product_name:'네이버 작두콩차',selling_price:11000,candidates:[{master_product_id:'M1',score:0.98}]},
      {platform:'NAVER',external_product_id:'N2',external_product_name:'네이버 우엉차',selling_price:14200,candidates:[{master_product_id:'M2',score:0.97}]},
      {platform:'COUPANG',external_product_id:'C1',external_product_name:'쿠팡 작두콩차',selling_price:11000,candidates:[{master_product_id:'M1',score:0.96}]}
    ],
    links:[]
  };
  const plan = service.planBulkManualMappingOperations({
    dashboard,
    platform:'NAVER',
    assignments:[
      {external_product_id:'N1',master_product_id:'M1'},
      {external_product_id:'N2',master_product_id:'M2'}
    ]
  });
  assert.equal(plan.requested,2);
  assert.deepEqual(plan.operations.map(item=>[item.source.platform,item.source.external_product_id,item.masterProductId,item.rpcAction]),[
    ['NAVER','N1','M1','LINK'],
    ['NAVER','N2','M2','LINK']
  ]);
});

test('다중 직접 연결은 선택 플랫폼의 실상품과 판매 중인 기준상품만 받는다', () => {
  const dashboard = {
    masterProducts:[{id:'M1',name:'작두콩차',selling_price:11000,is_active:true}],
    candidates:[
      {platform:'NAVER',external_product_id:'N1',external_product_name:'네이버 작두콩차',selling_price:11000,candidates:[]},
      {platform:'COUPANG',external_product_id:'C1',external_product_name:'쿠팡 작두콩차',selling_price:11000,candidates:[]}
    ],
    links:[]
  };
  assert.throws(()=>service.planBulkManualMappingOperations({
    dashboard,
    platform:'NAVER',
    assignments:[{external_product_id:'C1',master_product_id:'M1'}]
  }),/선택한 플랫폼/);
  assert.throws(()=>service.planBulkManualMappingOperations({
    dashboard,
    platform:'NAVER',
    assignments:[{external_product_id:'N1',master_product_id:'MISSING'}]
  }),/기준상품/);
});
