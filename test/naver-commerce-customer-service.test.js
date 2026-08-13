"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const customerService = require("../lib/naver-commerce/customer-service.js");

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
