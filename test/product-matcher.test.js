'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const matcher = require('../lib/products/matcher.js');

test('브랜드·HTML·티백 표기를 제거하고 동일 상품을 찾는다', () => {
  const result = matcher.scoreProductMatch(
    { name:'하린식품 돼지감자차 36g(1.2gX30TB)', selling_price:11000 },
    { name:'돼지감자차 (1.2gx30티백)', selling_price:11000 }
  );
  assert.ok(result.score >= 0.9, `expected high confidence, got ${result.score}`);
  assert.ok(result.reasons.some(item => item.includes('상품명') || item.includes('규격')));
});

test('묶음 수량이 다른 상품은 자동 확정 점수를 받지 않는다', () => {
  const result = matcher.scoreProductMatch(
    { name:'하린식품 HACCP 도라지청 600g 10개', selling_price:300000 },
    { name:'도라지청 600g', selling_price:35000 }
  );
  assert.ok(result.score < 0.9, `bundle mismatch should not auto match: ${result.score}`);
});

test('채널 상품 끝의 묶음 수량은 걷어내고 기준상품 규격을 추천한다', () => {
  const result=matcher.scoreProductMatch(
    {name:'하린식품 해썹인증 작수차 36g(1.2gX30TB)',selling_price:12000},
    {name:'2026년 국내산 하린식품 작두콩차 작수차 볶은 생분해 삼각티백 30개입 36g, 3개',selling_price:36000}
  );
  assert.ok(result.score>=0.38,`expected a visible recommendation, got ${result.score}`);
});

test('티백 TB EA 표기 차이는 같은 제품의 추천을 막지 않는다', () => {
  const result=matcher.scoreProductMatch(
    {name:'둥굴레차36g(1.2gX30TB)',selling_price:12000},
    {name:'하린식품 둥굴레차(티백) 36g(1.2gx30EA)',selling_price:12000}
  );
  assert.ok(result.score>=0.38,`expected TB/EA equivalent recommendation, got ${result.score}`);
});

test('후보는 플랫폼 원천별로 가장 가까운 기준상품 순서로 정렬된다', () => {
  const masters = [
    { id:'M1', name:'국화차 18g(0.6gX30TB)', selling_price:12000 },
    { id:'M2', name:'돼지감자차 36g(1.2gX30TB)', selling_price:11000 }
  ];
  const ranked = matcher.rankCandidates(masters, { name:'국화차 (0.6gx30티백)', selling_price:12000 });
  assert.equal(ranked[0].master.id, 'M1');
  assert.ok(ranked[0].score > ranked[1]?.score || ranked.length === 1);
});

test('고신뢰이면서 차점자와 점수 차이가 있을 때만 자동 연결한다', () => {
  const masters = [
    { id:'M1', name:'돼지감자차 36g(1.2gX30TB)', selling_price:11000 },
    { id:'M2', name:'돼지감자차 60g(2gX30TB)', selling_price:15000 }
  ];
  const candidates = matcher.buildMappingCandidates({
    masterProducts:masters,
    sources:[{ platform:'COUPANG', external_product_id:'C1', name:'돼지감자차 (1.2gx30티백)', selling_price:11000 }]
  });
  assert.equal(candidates[0].candidates[0].master_product_id, 'M1');
  assert.equal(candidates[0].auto_eligible, true);
});

test('이미 연결되었거나 거절한 후보쌍은 다시 제안하지 않는다', () => {
  const masterProducts = [{ id:'M1', name:'우엉차 45g(1.5gX30TB)', selling_price:10000 }];
  const source = { platform:'COUPANG', external_product_id:'C1', name:'우엉차 (1.5gx30티백)', selling_price:10000 };
  assert.equal(matcher.buildMappingCandidates({ masterProducts, sources:[source], existingLinks:[{platform:'COUPANG',external_product_id:'C1',master_product_id:'M1'}] }).length, 0);
  assert.equal(matcher.buildMappingCandidates({ masterProducts, sources:[source], rejectedPairs:['COUPANG:C1:M1'] }).length, 0);
});

test('유사 후보가 없어도 직접 연결할 원천 상품은 작업대에 남긴다', () => {
  const candidates = matcher.buildMappingCandidates({
    masterProducts:[{ id:'M1', name:'우엉차 45g', selling_price:10000 }],
    sources:[{ platform:'NAVER', external_product_id:'N1', name:'브랜드 캠페인', selling_price:null }]
  });
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].candidates, []);
  assert.equal(candidates[0].auto_eligible, false);
});
