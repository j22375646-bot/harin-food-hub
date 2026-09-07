'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const actions = require('../lib/coupang/actions.js');
const client = require('../lib/coupang/client.js');
const config = require('../lib/coupang/config.js');
const SECRET = 'cs-actions-test-key';
const source = (extra = {}) => ({ inquiryId: 17, inquiryStatus: 'progress', csPartnerCounselingStatus: 'requestAnswer', content: '상담이력',
  inquiryAt: '2026-09-05T00:00:00Z', replies: [{ answerId: 101, answerType: 'csAgent', partnerTransferStatus: 'requestAnswer',
    needAnswer: true, replyAt: '2026-09-05T00:00:00Z', content: '회수 일정 확인 요청' }], ...extra });
function actionDb() {
  const rows = [];
  return { rows, from() { return {
    async upsert(value) { rows.push(...(Array.isArray(value) ? value : [value])); return { error: null }; },
    update() { const query = { eq() { return query; }, then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); } }; return query; },
  }; } };
}
function prepare(t, request) {
  const db = actionDb();
  t.mock.method(config, 'getConfig', () => ({ vendorId: 'TEST' }));
  t.mock.method(client, 'request', request);
  return { db, options: { audit: { db, id: 'audit-1' }, request, secret: SECRET } };
}

test('고객센터 답변 직전 완료된 문의를 조회하면 POST 없이 전송을 차단한다', async t => {
  let posts = 0;
  const { options } = prepare(t, async method => {
    if (method === 'POST') posts += 1;
    return { status: 200, data: { code: 200, data: source({ inquiryStatus: 'complete', csPartnerCounselingStatus: 'answered' }) } };
  });
  await assert.rejects(actions.executeCsAction('REPLY_CALL_CENTER', { inquiryId: '17', parentAnswerId: '101', replyBy: 'test', content: '답변입니다.' }, options),
    error => error.code === 'COUPANG_INQUIRY_NOT_REPLYABLE');
  assert.equal(posts, 0);
});

test('조회 뒤 새로 이관된 문의는 과거 부모답변번호로 전송하지 않는다', async t => {
  let posts = 0;
  const { options } = prepare(t, async method => {
    if (method === 'POST') posts += 1;
    return { status: 200, data: { code: 200, data: source({ replies: [{ ...source().replies[0], answerId: 102 }] }) } };
  });
  await assert.rejects(actions.executeCsAction('REPLY_CALL_CENTER', { inquiryId: '17', parentAnswerId: '101', replyBy: 'test', content: '답변입니다.' }, options),
    error => error.code === 'COUPANG_INQUIRY_CHANGED');
  assert.equal(posts, 0);
});

test('POST 성공 후 재조회 실패는 전송 성공과 확인 필요로 반환하고 POST를 반복하지 않는다', async t => {
  let reads = 0; let posts = 0; let attempts;
  const { options } = prepare(t, async (method, _path, _params, requestOptions) => {
    if (method === 'POST') { posts += 1; attempts = requestOptions.maxAttempts; return { status: 200, data: { code: 'SUCCESS' } }; }
    reads += 1;
    if (reads > 1) throw Object.assign(new Error('read timeout'), { name: 'TimeoutError' });
    return { status: 200, data: { code: 200, data: source() } };
  });
  const result = await actions.executeCsAction('REPLY_CALL_CENTER', { inquiryId: '17', parentAnswerId: '101', replyBy: 'test', content: '답변입니다.' }, options);
  assert.equal(result.verificationRequired, true);
  assert.equal(result.sent, true);
  assert.equal(posts, 1);
  assert.equal(reads, 2);
  assert.equal(attempts, 1);
});

test('쿠팡이 HTTP 200 안에 실패 코드를 반환하면 답변 전송 성공으로 표시하지 않는다', async t => {
  const { options } = prepare(t, async method => method === 'POST'
    ? { status: 200, data: { code: 400, message: 'invalid reply' } }
    : { status: 200, data: { code: 200, data: source() } });
  await assert.rejects(actions.executeCsAction('REPLY_CALL_CENTER', { inquiryId: '17', parentAnswerId: '101', replyBy: 'test', content: '답변입니다.' }, options),
    error => error.code === 'COUPANG_CS_WRITE_REJECTED');
});

test('답변 성공 뒤 확인된 최신 완료 상태를 저장하고 재확인 경고 없이 반환한다', async t => {
  let reads = 0;
  const { db, options } = prepare(t, async method => {
    if (method === 'POST') return { status: 200, data: { code: '200', message: 'OK' } };
    reads += 1;
    return { status: 200, data: { code: 200, data: reads === 1 ? source() : source({ csPartnerCounselingStatus: 'answered' }) } };
  });
  const result = await actions.executeCsAction('REPLY_CALL_CENTER', { inquiryId: '17', parentAnswerId: '101', replyBy: 'test', content: '답변입니다.' }, options);
  assert.equal(result.sent, true);
  assert.equal(result.verificationRequired, false);
  assert.equal(db.rows.at(-1).answered, true);
});

test('답변 뒤 진행중 문의의 상담 이력이 비어 있으면 전송 성공을 유지하고 상태 확인 필요로 남긴다', async t => {
  let reads = 0; let posts = 0;
  const { db, options } = prepare(t, async method => {
    if (method === 'POST') { posts += 1; return { status: 200, data: { code: '200' } }; }
    reads += 1;
    return { status: 200, data: { code: 200, data: reads === 1 ? source() : source({ replies: [] }) } };
  });
  const result = await actions.executeCsAction('REPLY_CALL_CENTER', { inquiryId: '17', parentAnswerId: '101', replyBy: 'test', content: '답변입니다.' }, options);
  assert.equal(result.sent, true);
  assert.equal(result.verificationRequired, true);
  assert.equal(posts, 1);
  assert.equal(db.rows.at(-1).parent_answer_id, '101');
});

test('문의확인 작업은 최신 종료 문의와 답변이 필요한 문의를 POST 없이 거절한다', async t => {
  let posts = 0; let current = source();
  const { options } = prepare(t, async method => {
    if (method === 'POST') posts += 1;
    return { status: 200, data: { code: 200, data: current } };
  });
  for (const item of [source(), source({ inquiryStatus: 'complete', replies: [{ ...source().replies[0], needAnswer: false }] })]) {
    current = item;
    await assert.rejects(actions.executeCsAction('CONFIRM_CALL_CENTER', { inquiryId: '17', replyBy: 'test' }, options),
      error => error.code === 'COUPANG_INQUIRY_NOT_CONFIRMABLE');
  }
  assert.equal(posts, 0);
});

test('확인 전용 이관은 최신 조회 후 한 번 확인하고 완료 증거를 저장한다', async t => {
  let reads = 0; let posts = 0;
  const transfer = source({ replies: [{ ...source().replies[0], needAnswer: false }] });
  const { db, options } = prepare(t, async (method, path, _params, requestOptions) => {
    if (method === 'POST') {
      posts += 1;
      assert.match(path, /\/confirms$/);
      assert.deepEqual(requestOptions.body, { confirmBy: 'test' });
      assert.equal(requestOptions.maxAttempts, 1);
      return { status: 200, data: { code: 'SUCCESS' } };
    }
    reads += 1;
    return { status: 200, data: { code: 200, data: reads === 1 ? transfer : source({ inquiryStatus: 'complete', replies: [] }) } };
  });
  const result = await actions.executeCsAction('CONFIRM_CALL_CENTER', { inquiryId: '17', replyBy: 'test' }, options);
  assert.equal(result.sent, true);
  assert.equal(result.verificationRequired, false);
  assert.equal(posts, 1);
  assert.equal(reads, 2);
  assert.equal(db.rows.at(-1).answered, true);
});

test('확인 요청 전송 후 불완전한 재조회는 전송 성공을 유지하며 확인 필요로 남긴다', async t => {
  let reads = 0; let posts = 0;
  const transfer = source({ replies: [{ ...source().replies[0], needAnswer: false }] });
  const { db, options } = prepare(t, async method => {
    if (method === 'POST') { posts += 1; return { status: 200, data: { code: 'SUCCESS' } }; }
    reads += 1;
    return { status: 200, data: { code: 200, data: reads === 1 ? transfer : source({ replies: [] }) } };
  });
  const result = await actions.executeCsAction('CONFIRM_CALL_CENTER', { inquiryId: '17', replyBy: 'test' }, options);
  assert.equal(result.sent, true);
  assert.equal(result.verificationRequired, true);
  assert.match(result.warning, /문의 확인 요청/);
  assert.equal(posts, 1);
  assert.equal(db.rows.length, 1);
});
