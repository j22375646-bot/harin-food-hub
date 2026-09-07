'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../lib/coupang/mappers.js');
const center = require('../lib/customer-service/unified-center.js');

const SECRET = 'inquiry-test-encryption-key';
const pending = (extra = {}) => ({
  inquiryId: 777000111, inquiryStatus: 'progress', csPartnerCounselingStatus: 'requestAnswer',
  content: '상담이력', inquiryAt: '2026-09-05T13:02:00+09:00', orderId: '22300000000001',
  replies: [{ answerId: 61800000000001, answerType: 'csAgent', partnerTransferStatus: 'requestAnswer', needAnswer: true,
    replyAt: '2026-09-05T12:54:00+09:00', content: '회수 일정과 주소를 확인해주세요.' }], ...extra,
});

test('고객센터 상담본문을 암호화 보관하고 서버에서 요청본문과 최신 부모답변번호를 복원한다', () => {
  const saved = map.mapInquiry(pending(), 'CALL_CENTER', { secret: SECRET });
  assert.equal(saved.parent_answer_id, '61800000000001');
  assert.equal(saved.answered, false);
  assert.equal(JSON.stringify(saved).includes('회수 일정과 주소를 확인해주세요.'), false);
  assert.ok(saved.raw_data.cs_thread_encrypted);
  const thread = require('../lib/coupang/inquiry-thread.js');
  const hydrated = thread.hydrateInquiry(saved, { secret: SECRET });
  const model = center.buildUnifiedCustomerService({ coupangInquiries: [hydrated], now: new Date('2026-09-07T00:00:00Z') });
  assert.equal(model.active[0].content, '회수 일정과 주소를 확인해주세요.');
  assert.equal(hydrated.conversation[0].content, '회수 일정과 주소를 확인해주세요.');
  assert.equal(hydrated.raw_data, undefined);
  assert.equal(hydrated.can_reply, true);
});

test('판매자가 최신 요청에 답한 이력이 있으면 오래된 needAnswer 값만으로 재전송을 허용하지 않는다', () => {
  const saved = map.mapInquiry(pending({ replies: [...pending().replies, {
    answerId: 61800000000002, parentAnswerId: 61800000000001, answerType: 'vendor',
    partnerTransferStatus: 'none', needAnswer: false, replyAt: '2026-09-05T14:00:00+09:00', content: '확인했습니다.',
  }] }), 'CALL_CENTER', { secret: SECRET });
  const hydrated = require('../lib/coupang/inquiry-thread.js').hydrateInquiry(saved, { secret: SECRET });
  assert.equal(hydrated.can_reply, false);
  assert.equal(hydrated.reply_required, false);
});

test('과거 저장본의 상태 근거가 없으면 기존 완료값을 뒤집지 않고 전송은 잠근다', () => {
  const row = { inquiry_id: '18', inquiry_type: 'CALL_CENTER', answered: true, status: 'ANSWERED', question_text: '과거 문의', raw_data: {} };
  const hydrated = require('../lib/coupang/inquiry-thread.js').hydrateInquiry(row, { secret: SECRET });
  assert.equal(hydrated.answered, true);
  assert.equal(hydrated.can_reply, false);
  assert.equal(hydrated.status_verified, false);
});

test('다시 이관된 문의는 새로운 요청본문과 부모번호를 사용하고 대화 이력을 CS 모델까지 전달한다', () => {
  const item = pending({ replies: [...pending().replies,
    { answerId: 101, parentAnswerId: 61800000000001, answerType: 'vendor', needAnswer: false, replyAt: '2026-09-05T14:00:00+09:00', content: '첫 회신입니다.' },
    { answerId: 102, answerType: 'csAgent', partnerTransferStatus: 'requestAnswer', needAnswer: true, replyAt: '2026-09-06T10:00:00+09:00', content: '추가 확인 요청입니다.' },
  ] });
  const saved = map.mapInquiry(item, 'CALL_CENTER', { secret: SECRET });
  const hydrated = require('../lib/coupang/inquiry-thread.js').hydrateInquiry(saved, { secret: SECRET });
  const model = center.buildUnifiedCustomerService({ coupangInquiries: [hydrated] });
  assert.equal(model.active[0].content, '추가 확인 요청입니다.');
  assert.equal(model.active[0].conversation.length, 3);
  assert.equal(hydrated.parent_answer_id, '102');
  assert.equal(hydrated.can_reply, true);
});

test('지원하지 않는 문의 상태와 확인 전용 이관에는 답변 전송을 허용하지 않는다', () => {
  const hydrate = require('../lib/coupang/inquiry-thread.js').hydrateInquiry;
  const unknown = hydrate(map.mapInquiry(pending({ inquiryStatus: 'new-provider-state' }), 'CALL_CENTER', { secret: SECRET }), { secret: SECRET });
  assert.equal(unknown.can_reply, false);
  const transferred = hydrate(map.mapInquiry(pending({ inquiryStatus: 'progress', replies: [{ ...pending().replies[0], needAnswer: false }] }), 'CALL_CENTER', { secret: SECRET }), { secret: SECRET });
  assert.equal(transferred.answered, false);
  assert.equal(transferred.confirmation_required, true);
  assert.equal(transferred.can_reply, false);
});

test('확인요청 이력이 남았어도 상담이 종료되면 새 확인 작업으로 활성화하지 않는다', () => {
  const saved = map.mapInquiry(pending({ inquiryStatus: 'complete', replies: [{ ...pending().replies[0], needAnswer: false }] }), 'CALL_CENTER', { secret: SECRET });
  const hydrated = require('../lib/coupang/inquiry-thread.js').hydrateInquiry(saved, { secret: SECRET });
  assert.equal(hydrated.answered, true);
  assert.equal(hydrated.confirmation_required, false);
});

test('상품문의는 실제 댓글 답변을 완료로 보되 명시적 미답변 값과 부정 상태를 우선한다', () => {
  assert.equal(map.mapInquiry({ inquiryId: 1, commentDtoList: [{ inquiryCommentId: 2 }] }, 'ONLINE').answered, true);
  assert.equal(map.mapInquiry({ inquiryId: 2, answered: 'false', commentDtoList: [{ inquiryCommentId: 2 }] }, 'ONLINE').answered, false);
  assert.equal(map.mapInquiry({ inquiryId: 3, answeredType: 'UNANSWERED' }, 'ONLINE').answered, false);
  assert.equal(map.mapInquiry({ inquiryId: 4, answeredType: 'NOANSWER' }, 'ONLINE').answered, false);
});

test('판매자 자신의 답변번호를 고객센터 이관 부모번호로 사용하지 않는다', () => {
  const saved = map.mapInquiry(pending({ replies: [{ ...pending().replies[0], answerType: 'vendor' }] }), 'CALL_CENTER', { secret: SECRET });
  const hydrated = require('../lib/coupang/inquiry-thread.js').hydrateInquiry(saved, { secret: SECRET });
  assert.equal(hydrated.can_reply, false);
  assert.equal(hydrated.parent_answer_id, null);
});

test('암호화 키가 맞지 않으면 원문을 노출하거나 예외로 페이지를 깨지 않고 전송을 잠근다', () => {
  const saved = map.mapInquiry(pending(), 'CALL_CENTER', { secret: SECRET });
  const hydrated = require('../lib/coupang/inquiry-thread.js').hydrateInquiry(saved, { secret: 'different-test-key' });
  assert.equal(hydrated.raw_data, undefined);
  assert.deepEqual(hydrated.conversation, []);
  assert.equal(hydrated.can_reply, false);
  assert.equal(hydrated.status_verified, false);
  assert.match(hydrated.verification_error, /복원하지 못했습니다/);
});
