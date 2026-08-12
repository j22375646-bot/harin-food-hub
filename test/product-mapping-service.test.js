'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../lib/products/mapping-service.js');

test('쿠팡 상품과 네이버 광고그룹을 플랫폼 매핑 원천으로 만든다', () => {
  const sources = service.createProductSources({
    coupangProducts:[{seller_product_id:'C1',product_name:'국화차',status:'APPROVED'}],
    coupangProductItems:[{seller_product_id:'C1',sale_price:12000}],
    naverCampaigns:[{ncc_campaign_id:'N1',name:'작두콩차',campaign_type:'SHOPPING'}],
    naverAdgroups:[{ncc_adgroup_id:'G1',ncc_campaign_id:'N1',name:'모바일',status:'ELIGIBLE'}]
  });
  assert.deepEqual(sources.map(item=>item.platform).sort(), ['COUPANG','NAVER']);
  assert.equal(sources.find(item=>item.platform==='COUPANG').selling_price, 12000);
  assert.match(sources.find(item=>item.platform==='NAVER').external_product_name, /작두콩차/);
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
