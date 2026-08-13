"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../lib/customer-service/store.js");

const secret = "test-service-secret-at-least-32-characters";

test("공통 CS 원문은 평문 대신 AES-GCM 봉투로 저장하고 서버에서만 복호화한다", () => {
  const row = store.normalize(
    {
      platform: "CAFE24",
      kind: "INQUIRY",
      sourceId: "6:101",
      title: "배송 문의",
      content: "전화번호와 주소가 포함된 고객 문의",
      occurredAt: "2026-08-14T01:00:00Z",
    },
    secret,
  );
  assert.equal(row.platform, "CAFE24");
  assert.equal(row.title_envelope.alg, "A256GCM");
  assert.doesNotMatch(
    JSON.stringify(row),
    /전화번호와 주소가 포함된 고객 문의/,
  );
  const hydrated = store.hydrateRows([row], { secret })[0];
  assert.equal(hydrated.title, "배송 문의");
  assert.equal(hydrated.content, "전화번호와 주소가 포함된 고객 문의");
});

test("공통 CS 저장소는 허용되지 않은 채널과 유형을 거부한다", () => {
  assert.throws(
    () =>
      store.normalize(
        { platform: "COUPANG", kind: "INQUIRY", sourceId: "1" },
        secret,
      ),
    /지원하지 않는 CS 플랫폼/,
  );
  assert.throws(
    () =>
      store.normalize(
        { platform: "CAFE24", kind: "REFUND", sourceId: "1" },
        secret,
      ),
    /지원하지 않는 CS 유형/,
  );
});
