'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fileImport = require('../lib/coupang/file-import.js');

test('쿠팡 CSV의 따옴표와 쉼표를 안전하게 분리한다', () => {
  assert.deepEqual(fileImport.parseCsvLine('주문번호,"상품, 대용량",2'), ['주문번호', '상품, 대용량', '2']);
  assert.deepEqual(fileImport.parseCsvLine('1,"따옴표 ""표시"""'), ['1', '따옴표 "표시"']);
});

test('쿠팡 주문 헤더를 자동 판별하고 주문/상품행으로 변환한다', () => {
  const tables = fileImport.extractTables([{ name: '주문', rows: [
    ['쿠팡 주문 내역'],
    ['주문번호', '배송번호', '주문상품번호', '등록상품ID', '옵션ID', '상품명', '옵션명', '주문수량', '결제금액', '주문일', '주문상태'],
    ['20260812-1', '90001', 'ITEM-1', 'SELLER-1', 'VENDOR-1', '작두콩차', '30포', 2, '19,800원', '2026-08-12', '결제완료']
  ] }]);
  assert.equal(tables.length, 1);
  assert.equal(fileImport.detectedDataset(tables[0].lookup), 'ORDERS');
  const mapped = fileImport.mapOrderRow(tables[0].rows[0], tables[0].lookup, 0);
  assert.equal(mapped.order.order_id, '20260812-1');
  assert.equal(mapped.order.ordered_at.slice(0, 10), '2026-08-12');
  assert.equal(mapped.order.gross_amount, 19800);
  assert.equal(mapped.item.product_name, '작두콩차 / 30포');
  assert.equal(mapped.item.quantity, 2);
});

test('쿠팡 정산 헤더를 자동 판별하고 음수 수수료를 변환한다', () => {
  const tables = fileImport.extractTables([{ name: '정산', rows: [
    ['주문번호', '매출인식일', '판매금액', '서비스수수료', '수수료VAT', '정산금액'],
    ['ORDER-1', '2026.08.11', '10,000', '(1,000)', '100', '8,900']
  ] }]);
  assert.equal(fileImport.detectedDataset(tables[0].lookup), 'SETTLEMENTS');
  const mapped = fileImport.mapSettlementRow(tables[0].rows[0], tables[0].lookup, 0);
  assert.equal(mapped.recognition_date, '2026-08-11');
  assert.equal(mapped.sale_amount, 10000);
  assert.equal(mapped.service_fee, -1000);
  assert.equal(mapped.settlement_amount, 8900);
});

test('고객 개인정보 열은 헤더 별칭으로 수집하지 않는다', () => {
  const tables = fileImport.extractTables([{ name: '주문', rows: [
    ['주문번호', '배송번호', '상품명', '수량', '수취인이름', '전화번호', '주소'],
    ['ORDER-2', 'SHIP-2', '조청', 1, '홍길동', '010-0000-0000', '광주광역시']
  ] }]);
  const mapped = fileImport.mapOrderRow(tables[0].rows[0], tables[0].lookup, 0);
  const raw = JSON.stringify(mapped.item.raw_data);
  assert.equal(raw.includes('홍길동'), false);
  assert.equal(raw.includes('010-0000-0000'), false);
  assert.equal(raw.includes('광주광역시'), false);
});
