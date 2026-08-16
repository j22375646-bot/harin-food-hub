"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const customerService = require("../lib/naver-commerce/customer-service.js");
const client = require("../lib/naver-commerce/client.js");

test("네이버 상품 문의 응답을 공통 문의 형식으로 변환한다", () => {
  const row = customerService.mapQna({
    questionId: 101,
    title: "상품 문의",
    question: "유통기한이 궁금해요",
    status: "WAITING",
    createDate: "2026-08-14T09:00:00+09:00",
    productNo: 7,
  });
  assert.equal(row.platform, "NAVER");
  assert.equal(row.kind, "INQUIRY");
  assert.equal(row.completed, false);
  assert.equal(row.productId, 7);
});

test("네이버 최근 변경 주문에서 취소·반품·교환만 공통 클레임으로 변환한다", () => {
  assert.equal(
    customerService.claimKind({ lastChangedType: "RETURN_REQUEST" }),
    "RETURN",
  );
  assert.equal(
    customerService.claimKind({ lastChangedType: "EXCHANGE_DONE" }),
    "EXCHANGE",
  );
  assert.equal(customerService.claimKind({ lastChangedType: "PAYED" }), null);
  const row = customerService.mapClaim({
    productOrderId: "P1",
    orderId: "O1",
    lastChangedType: "CANCEL_DONE",
    lastChangedDate: "2026-08-14T09:00:00+09:00",
  });
  assert.equal(row.kind, "CANCEL");
  assert.equal(row.completed, true);
});

test("네이버 클레임 조회를 API 허용 범위인 24시간 이하로 나눈다", async () => {
  const original = client.request;
  const ranges = [];
  try {
    client.request = async (_method, _path, { query }) => {
      ranges.push(query);
      return { data:{ data:{ lastChangeStatuses:[] } } };
    };
    await customerService.fetchClaims({}, new Date("2026-08-17T00:00:00.000Z"));
  } finally {
    client.request = original;
  }
  assert.equal(ranges.length, 7);
  for (const range of ranges) {
    const duration = Date.parse(range.lastChangedTo) - Date.parse(range.lastChangedFrom);
    assert.ok(duration > 0);
    assert.ok(duration < 24 * 60 * 60 * 1000);
  }
});
