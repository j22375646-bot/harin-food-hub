"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const customerService = require("../lib/cafe24/customer-service.js");

test("Cafe24 문의 게시판만 수집 대상으로 고른다", () => {
  const selected = customerService.selectedBoards([
    { board_no: 1, board_name: "공지사항", use_board: "T" },
    { board_no: 6, board_name: "질문과답변", use_board: "T" },
    { board_no: 9, board_name: "1:1 맞춤상담", use_board: "T" },
    { board_no: 15, board_name: "제휴문의 / OEM", use_board: "T" },
  ]);
  assert.deepEqual(
    selected.map((item) => item.boardNo),
    [6, 9, 15],
  );
});

test("Cafe24 게시글 답변 여부와 주문 연결 정보를 공통 문의로 변환한다", () => {
  const rows = customerService.mapArticles(
    [
      {
        article_no: 10,
        parent_article_no: 0,
        title: "<b>배송</b> 문의",
        content: "언제 오나요?",
        order_id: "O1",
        created_date: "2026-08-14T09:00:00+09:00",
      },
      {
        article_no: 11,
        parent_article_no: 10,
        title: "답변",
        content: "오늘 출고됩니다",
        created_date: "2026-08-14T10:00:00+09:00",
      },
    ],
    { boardNo: 6, name: "질문과답변" },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].answered, true);
  assert.equal(rows[0].completed, true);
  assert.equal(rows[0].orderId, "O1");
  assert.equal(rows[0].title, "배송 문의");
});

test("Cafe24 주문의 취소·반품·교환을 완료 여부와 함께 변환한다", () => {
  const rows = customerService.mapClaims([
    {
      order_id: "O2",
      order_date: "2026-08-14T08:00:00+09:00",
      items: [{ product_no: 7, order_status: "R10" }],
      cancellation: {
        claim_code: "C1",
        claim_reason: "주문 취소",
        items: [{ order_status: "C40" }],
      },
      return: {
        claim_code: "R1",
        claim_reason: "반품 요청",
        items: [{ order_status: "R10" }],
      },
      exchange: {
        claim_code: "E1",
        claim_reason: "교환 요청",
        items: [{ order_status: "E40" }],
      },
    },
  ]);
  assert.deepEqual(
    rows.map((item) => item.kind),
    ["CANCEL", "RETURN", "EXCHANGE"],
  );
  assert.deepEqual(
    rows.map((item) => item.completed),
    [true, false, true],
  );
});
