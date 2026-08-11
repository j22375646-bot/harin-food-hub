'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActionUpdate } = require('../lib/actions/update.js');

const now = new Date('2026-08-12T03:00:00.000Z');

test('담당자·기한·우선순위만 독립적으로 수정한다', () => {
  const values = buildActionUpdate({ assignee: ' 정해린 ', due_at: '2026-08-20', priority: 'HIGH' }, now);
  assert.equal(values.assignee, '정해린');
  assert.equal(values.due_at, '2026-08-20');
  assert.equal(values.priority, 'HIGH');
  assert.equal(values.status, undefined);
});

test('보류 상태에는 보류 사유를 함께 저장한다', () => {
  const values = buildActionUpdate({ status: 'ON_HOLD', hold_reason: '재고 입고 후 재검토' }, now);
  assert.equal(values.status, 'ON_HOLD');
  assert.equal(values.hold_reason, '재고 입고 후 재검토');
});

test('완료 상태에는 서버 실행시각을 기록한다', () => {
  const values = buildActionUpdate({ status: 'EXECUTED' }, now);
  assert.equal(values.executed_at, now.toISOString());
  assert.equal(values.hold_reason, null);
});

test('존재하지 않는 날짜는 거부한다', () => {
  assert.throws(() => buildActionUpdate({ due_at: '2026-02-31' }, now), /실제 날짜/);
});

test('변경 필드가 없으면 거부한다', () => {
  assert.throws(() => buildActionUpdate({}, now), /변경할 액션 정보/);
});
