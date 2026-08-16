'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildUnifiedCollectionCenter, friendlyCollectionError } = require('../lib/collection/unified-center.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('16-7 저장량과 이번 수집 변화량을 분리해 0행 오해를 막는다', () => {
  const center = buildUnifiedCollectionCenter({
    now:'2026-08-16T10:00:00Z',
    channelConnections:{ channels:[{ platform:'CAFE24', status:'WRITE_READY', summary:'읽기·쓰기 연결' }] },
    dataHealth:{ channels:[{ platform:'CAFE24', status:'READY', storedSummary:'27건 주문', lastSuccessAt:'2026-08-16T09:30:00Z' }] },
    syncs:[{ platform:'CAFE24', status:'SUCCESS', rows_received:0, finished_at:'2026-08-16T09:30:00Z' }]
  });
  const cafe24 = center.channels.find(channel => channel.platform === 'CAFE24');
  assert.equal(cafe24.stored_summary, '27건 주문');
  assert.equal(cafe24.latest_collection_summary, '이번 수집 새 변경 없음');
  assert.equal(cafe24.freshness_label, '최근 90분 안에 수집');
});

test('16-7 기술 오류 JSON은 사장님이 이해할 수 있는 안내로 바꾼다', () => {
  const raw='[{"dataset":"claims","message":"조회 날짜가 유효하지 않습니다.","status":400}]';
  assert.equal(friendlyCollectionError(raw, 'NAVER'), '네이버의 일부 조회 기간이 맞지 않아 새 자료를 모두 받지 못했습니다. 이 채널만 다시 수집하세요.');
  assert.doesNotMatch(friendlyCollectionError(raw, 'NAVER'), /dataset|status|\[|\{/);
});

test('16-7 채널 카드는 플랫폼별 파스텔톤과 상태 팩토그램을 공유한다', () => {
  const source=read('app/unified-collection-operations-center.js');
  const styles=read('app/_operations/harin-operations-v8.css');
  assert.match(source, /latest_collection_summary/);
  assert.match(source, /collectionOpsFreshness/);
  assert.match(source, /collectionOpsAdvice/);
  assert.match(styles, /Phase 16-7: truthful collection freshness and platform card system/);
  assert.match(styles, /\.collectionOpsChannel\.naver/);
  assert.match(styles, /\.collectionOpsChannel\.cafe24/);
  assert.match(styles, /\.collectionOpsChannel\.coupang/);
});
