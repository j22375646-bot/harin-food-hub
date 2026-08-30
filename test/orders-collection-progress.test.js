'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  activeCollectionPlatforms,
  collectionProgressLabel
}=require('../lib/orders/collection-progress.js');

test('수집 중인 플랫폼만 고정 순서로 표시한다',()=>{
  const active=activeCollectionPlatforms({
    cafe24:'SUCCESS',
    coupang:{status:'RUNNING'},
    naver:{status:'PENDING'}
  });

  assert.deepEqual(active,['NAVER','COUPANG']);
  assert.equal(collectionProgressLabel(active),'네이버 · 쿠팡 수집 중');
});

test('시작 응답 전에는 세 플랫폼 수집 시작 상태를 표시한다',()=>{
  const active=activeCollectionPlatforms({
    cafe24:'RUNNING',
    coupang:{status:'PENDING'},
    naver:{status:'PENDING'}
  });

  assert.deepEqual(active,['NAVER','CAFE24','COUPANG']);
  assert.equal(collectionProgressLabel(active),'네이버 · Cafe24 · 쿠팡 수집 중');
  assert.equal(collectionProgressLabel([]),'1시간 자동');
});
