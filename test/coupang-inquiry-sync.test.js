'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const operations = require('../lib/coupang/operations.js');
const { hydrateInquiry } = require('../lib/coupang/inquiry-thread.js');

const SECRET = 'inquiry-sync-test-key';
const stale = { inquiry_key: 'CALL_CENTER:17', inquiry_id: '17', inquiry_type: 'CALL_CENTER', status: 'progress',
  answered: false, inquired_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-31T00:00:00Z', raw_data: { inquiryId: 17,
    inquiryStatus: 'progress', csPartnerCounselingStatus: 'requestAnswer', replies: [] } };

function database(initial = []) {
  const tables = { coupang_inquiries: structuredClone(initial), raw_api_responses: [] };
  return { tables, from(table) {
    tables[table] ||= [];
    const filters = []; let limit = Infinity; const sorts = []; let update = null;
    const query = {
      select() { return query; }, eq(key, value) { filters.push(row => row[key] === value); return query; },
      lt(key, value) { filters.push(row => row[key] < value); return query; },
      order(key, options) { sorts.push([key, options?.ascending !== false, options?.nullsFirst === true]); return query; },
      limit(value) { limit = value; return query; },
      update(value) { update = value; return query; },
      async insert(value) { tables[table].push(value); return { error: null }; },
      async upsert(values) { for (const value of Array.isArray(values) ? values : [values]) {
        const existing = tables[table].find(row => row.inquiry_key === value.inquiry_key);
        if (existing) Object.assign(existing, value); else tables[table].push(value);
      } return { error: null }; },
      then(resolve, reject) { let rows = tables[table].filter(row => filters.every(filter => filter(row)));
        if (sorts.length) rows.sort((a, b) => {
          for (const [key, ascending, nullsFirst] of sorts) {
            const value = row => key.split(/->>?/).reduce((item, part) => item?.[part], row);
            const left = value(a); const right = value(b);
            const compared = left == null || right == null
              ? left == null && right == null ? 0 : (left == null ? -1 : 1) * (nullsFirst ? 1 : -1)
              : String(left).localeCompare(String(right)) * (ascending ? 1 : -1);
            if (compared) return compared;
          }
          return 0;
        });
        rows = rows.slice(0, limit); if (update) rows.forEach(row => Object.assign(row, update));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    }; return query;
  } };
}

test('최근 7일 목록 밖 미처리 고객센터 문의를 단건으로 재확인해 최신 완료 상태를 반영한다', async t => {
  const db = database([stale]); const reads = [];
  const request = async (method, path, params, options) => {
      reads.push({ method, path, options });
      return { status: 200, data: path.endsWith('/17') ? { code: 200, data: { inquiryId: 17, inquiryStatus: 'complete',
        csPartnerCounselingStatus: 'answered', inquiryAt: stale.inquired_at, content: '상담이력', replies: [] } } : { data: { content: [] } } };
  };
  t.mock.method(require('../lib/cafe24/supabase.js'), 'getSupabase', () => db);
  t.mock.method(require('../lib/coupang/client.js'), 'request', request);
  const result = await operations.syncInquiries({ vendorId: 'test-vendor' }, { start: '2026-09-01', end: '2026-09-07' }, db, {
    now: '2026-09-07T00:00:00Z', secret: SECRET, request,
  });
  assert.equal(result.staleInquiriesRefreshed, 1);
  assert.equal(db.tables.coupang_inquiries[0].answered, true);
  assert.equal(reads.at(-1).path, '/v2/providers/openapi/apis/api/v5/vendors/callCenterInquiries/17');
  assert.equal(reads.at(-1).method, 'GET');
  assert.equal(reads.at(-1).options.maxAttempts, 1);
});

test('단건 404는 문의를 완료하거나 삭제하지 않고 기존 상태와 본문을 보존한 미확인으로 남긴다', async () => {
  const db = database([stale]);
  const result = await operations.syncInquiries({ vendorId: 'test-vendor' }, { start: '2026-09-01', end: '2026-09-07' }, db, {
    now: '2026-09-07T00:00:00Z', secret: SECRET,
    request: async (_method, path) => {
      if (path.endsWith('/17')) throw Object.assign(new Error('not found'), { status: 404 });
      return { status: 200, data: { data: { content: [] } } };
    },
  });
  assert.deepEqual(result.inquiryVerificationWarnings, [{ inquiryId: '17', code: 'COUPANG_INQUIRY_NOT_FOUND' }]);
  const retained = db.tables.coupang_inquiries[0];
  assert.equal(retained.answered, false);
  assert.equal(retained.status, 'progress');
  assert.equal(retained.updated_at, stale.updated_at);
  assert.equal(hydrateInquiry(retained, { secret: SECRET }).status_verified, false);
  assert.equal(hydrateInquiry(retained, { secret: SECRET }).can_reply, false);
});

test('최근 목록에 상담 이력이 빠졌으면 단건 조회로 보강하며 전체 단건 호출은 10건을 넘지 않는다', async () => {
  const db = database(Array.from({ length: 12 }, (_, i) => ({ ...stale, inquiry_key: `CALL_CENTER:${i + 30}`, inquiry_id: String(i + 30) })));
  let details = 0;
  const result = await operations.syncInquiries({ vendorId: 'test-vendor' }, { start: '2026-09-01', end: '2026-09-07' }, db, {
    now: '2026-09-07T00:00:00Z', secret: SECRET,
    request: async (_method, path) => {
      if (path.endsWith('/onlineInquiries')) return { status: 200, data: [] };
      if (path.endsWith('/callCenterInquiries')) return { status: 200, data: [{ inquiryId: 17, inquiryStatus: 'progress', csPartnerCounselingStatus: 'requestAnswer', content: '상담이력' }] };
      details += 1; const id = path.split('/').at(-1);
      return { status: 200, data: { code: 200, data: { inquiryId: id, inquiryStatus: 'progress', csPartnerCounselingStatus: 'requestAnswer',
        content: '상담이력', replies: [{ answerId: 101, answerType: 'csAgent', partnerTransferStatus: 'requestAnswer', needAnswer: true, content: '추가 조회한 상담 본문' }] } } };
    },
  });
  const saved = db.tables.coupang_inquiries.find(row => row.inquiry_id === '17');
  assert.equal(hydrateInquiry(saved, { secret: SECRET }).question_text, '추가 조회한 상담 본문');
  assert.equal(details, 10);
  assert.deepEqual(result.inquiryVerificationWarnings, []);
});

test('상담 이력이 빠진 목록의 단건 보강 실패는 이전 암호문과 답변 상태를 덮어쓰지 않는다', async () => {
  const map = require('../lib/coupang/mappers.js');
  const previous = map.mapInquiry({ inquiryId: 17, inquiryStatus: 'progress', csPartnerCounselingStatus: 'requestAnswer',
    content: '상담이력', replies: [{ answerId: 101, answerType: 'csAgent', partnerTransferStatus: 'requestAnswer', needAnswer: true, content: '이전 확인된 상담 본문' }] },
  'CALL_CENTER', { secret: SECRET, now: '2026-09-06T00:00:00Z' });
  const db = database([previous]);
  const result = await operations.syncInquiries({ vendorId: 'test-vendor' }, { start: '2026-09-01', end: '2026-09-07' }, db, {
    now: '2026-09-07T00:00:00Z', secret: SECRET,
    request: async (_method, path) => {
      if (path.endsWith('/onlineInquiries')) return { status: 200, data: [] };
      if (path.endsWith('/callCenterInquiries')) return { status: 200, data: [{ inquiryId: 17, inquiryStatus: 'complete', csPartnerCounselingStatus: 'answered', content: '상담이력' }] };
      throw Object.assign(new Error('temporary timeout'), { name: 'TimeoutError' });
    },
  });
  const retained = db.tables.coupang_inquiries[0];
  assert.deepEqual(retained.raw_data.cs_thread_encrypted, previous.raw_data.cs_thread_encrypted);
  assert.equal(retained.status, 'progress');
  assert.equal(retained.answered, false);
  assert.equal(hydrateInquiry(retained, { secret: SECRET }).question_text, '이전 확인된 상담 본문');
  assert.equal(hydrateInquiry(retained, { secret: SECRET }).can_reply, false);
  assert.equal(result.inquiryVerificationWarnings.length, 1);
});

test('오래된 10건이 계속 404여도 다음 수집에서는 11번째 미처리 문의를 확인한다', async () => {
  const db = database(Array.from({ length: 11 }, (_, index) => ({ ...stale,
    inquiry_key: `CALL_CENTER:${100 + index}`, inquiry_id: String(100 + index),
    updated_at: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  })));
  const batches = [[], []]; let pass = 0;
  const request = async (_method, path) => {
    if (path.endsWith('Inquiries')) return { status: 200, data: [] };
    const id = path.split('/').at(-1); batches[pass].push(id);
    if (id !== '110') throw Object.assign(new Error('not found'), { status: 404 });
    return { status: 200, data: { code: 200, data: { inquiryId: 110, inquiryStatus: 'complete', csPartnerCounselingStatus: 'answered', replies: [] } } };
  };
  for (; pass < 2; pass += 1) {
    await operations.syncInquiries({ vendorId: 'test-vendor' }, { start: '2026-09-01', end: '2026-09-07' }, db,
      { now: `2026-09-07T0${pass}:00:00Z`, secret: SECRET, request });
  }
  assert.equal(batches[0].length, 10);
  assert.equal(batches[1].includes('110'), true);
  assert.ok(batches.every(batch => batch.length <= 10));
  assert.equal(db.tables.coupang_inquiries.find(row => row.inquiry_id === '110').answered, true);
  assert.equal(db.tables.coupang_inquiries.find(row => row.inquiry_id === '100').status, 'progress');
  assert.equal(db.tables.coupang_inquiries.find(row => row.inquiry_id === '100').updated_at, '2026-08-01T00:00:00Z');
});
