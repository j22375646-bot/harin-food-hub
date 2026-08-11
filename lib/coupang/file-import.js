'use strict';

const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { getSupabase } = require('../cafe24/supabase.js');
const { sanitize } = require('./mappers.js');

const MAX_ROWS = 50000;
const BATCH_SIZE = 400;
const DATASETS = new Set(['AUTO', 'ORDERS', 'PRODUCTS', 'SETTLEMENTS']);
const aliases = {
  shipmentBoxId: ['shipmentboxid', '배송번호', '묶음배송번호', '배송묶음번호'],
  orderId: ['orderid', '주문번호'],
  orderItemId: ['orderitemid', '주문상품번호', '주문아이템id'],
  orderedAt: ['orderedat', 'orderdate', '주문일', '주문일시', '결제완료일', '결제일'],
  paidAt: ['paidat', '결제일시'],
  status: ['status', 'statusname', '주문상태', '배송상태', '판매상태', '상품상태'],
  vendorItemId: ['vendoritemid', '옵션id', '옵션아이디', 'vendoritem'],
  sellerProductId: ['sellerproductid', '등록상품id', '판매자상품id', '업체상품id'],
  productId: ['productid', '노출상품id', '쿠팡상품id'],
  productName: ['productname', 'sellerproductname', 'vendoritemname', '상품명', '등록상품명', '노출상품명'],
  optionName: ['optionname', '옵션명'],
  brand: ['brand', '브랜드'],
  quantity: ['quantity', 'shippingcount', 'orderquantity', '주문수량', '구매수량', '수량'],
  unitPrice: ['unitprice', 'orderprice', 'salesprice', '판매가', '개당판매가', '단가'],
  paidAmount: ['paidamount', 'orderamount', '결제금액', '판매금액', '매출액', '총결제금액'],
  recognitionDate: ['recognitiondate', '매출인식일', '구매확정일', '정산인식일'],
  settlementDate: ['settlementdate', '정산일', '지급일', '지급예정일'],
  saleType: ['saletype', '매출유형', '정산유형'],
  saleAmount: ['saleamount', '판매금액', '매출금액', '총판매액'],
  serviceFee: ['servicefee', '서비스수수료', '판매수수료', '수수료'],
  serviceFeeVat: ['servicefeevat', '서비스수수료vat', '수수료vat', '수수료부가세'],
  settlementAmount: ['settlementamount', '정산금액', '지급금액', '정산예정금액']
};

const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s_\-./()[\]{}:]/g, '');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const text = value => value == null || value === '' ? null : String(value).trim();
function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
  const parsed = Number(raw.replace(/[^0-9.]/g, '')) || 0;
  return negative ? -parsed : parsed;
}
function date(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString();
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const matched = raw.match(/(20\d{2})[^0-9]?(\d{1,2})[^0-9]?(\d{1,2})(?:[^0-9]+(\d{1,2})[^0-9]?(\d{1,2})?[^0-9]?(\d{1,2})?)?/);
  if (!matched) return null;
  const hasTime = matched[4] != null;
  return new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), hasTime ? Number(matched[4]) - 9 : 0, Number(matched[5] || 0), Number(matched[6] || 0))).toISOString();
}
const dateOnly = value => date(value)?.slice(0, 10) || null;

function parseCsvLine(line) {
  const cells = []; let current = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(current); current = ''; }
    else current += char;
  }
  cells.push(current); return cells;
}

function decodeCsv(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  return utf8.includes('\uFFFD') ? new TextDecoder('euc-kr').decode(buffer) : utf8;
}

function tabularCsv(buffer) {
  const lines = decodeCsv(buffer).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  return [{ name: 'CSV', rows: lines.map(parseCsvLine) }];
}

async function tabularXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer));
  return workbook.worksheets.map(sheet => ({
    name: sheet.name,
    rows: sheet.getSheetValues().slice(1).map(row => (row || []).slice(1).map(value => value?.result ?? value?.text ?? value))
  }));
}

function aliasLookup(headers) {
  const normalized = headers.map(normalize);
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, normalized.findIndex(value => names.includes(value))]));
}

function headerScore(row) {
  const lookup = aliasLookup(row);
  return Object.values(lookup).filter(index => index >= 0).length;
}

function extractTables(sheets) {
  return sheets.map(sheet => {
    let headerIndex = -1; let score = 0;
    sheet.rows.slice(0, 20).forEach((row, index) => { const candidate = headerScore(row); if (candidate > score) { score = candidate; headerIndex = index; } });
    if (headerIndex < 0 || score < 2) return null;
    const headers = sheet.rows[headerIndex].map(value => String(value ?? '').trim());
    return { sheet: sheet.name, lookup: aliasLookup(headers), rows: sheet.rows.slice(headerIndex + 1).filter(row => row.some(value => String(value ?? '').trim())) };
  }).filter(Boolean);
}

function detectedDataset(lookup) {
  if (lookup.settlementAmount >= 0 || lookup.serviceFee >= 0 || lookup.recognitionDate >= 0) return 'SETTLEMENTS';
  if (lookup.orderId >= 0 || lookup.shipmentBoxId >= 0) return 'ORDERS';
  if (lookup.sellerProductId >= 0 && lookup.productName >= 0) return 'PRODUCTS';
  return null;
}

const value = (row, lookup, field) => lookup[field] >= 0 ? row[lookup[field]] : null;
const withOption = (name, option) => [text(name), text(option)].filter(Boolean).join(' / ') || '상품명 없음';

function mapOrderRow(row, lookup, rowIndex) {
  const orderId = text(value(row, lookup, 'orderId'));
  const shipmentBoxId = text(value(row, lookup, 'shipmentBoxId')) || orderId;
  if (!orderId || !shipmentBoxId) return null;
  const quantity = Math.max(0, Math.round(number(value(row, lookup, 'quantity')) || 1));
  const paidAmount = number(value(row, lookup, 'paidAmount'));
  const unitPrice = number(value(row, lookup, 'unitPrice')) || (quantity ? paidAmount / quantity : 0);
  const vendorItemId = text(value(row, lookup, 'vendorItemId'));
  const orderItemId = text(value(row, lookup, 'orderItemId'));
  const sellerProductId = text(value(row, lookup, 'sellerProductId'));
  const productName = withOption(value(row, lookup, 'productName'), value(row, lookup, 'optionName'));
  const status = text(value(row, lookup, 'status'));
  const raw = sanitize(Object.fromEntries(Object.entries(lookup).filter(([, index]) => index >= 0).map(([field, index]) => [field, row[index]])));
  return {
    order: { shipment_box_id: shipmentBoxId, order_id: orderId, ordered_at: date(value(row, lookup, 'orderedAt')), paid_at: date(value(row, lookup, 'paidAt')), status, gross_amount: paidAmount || unitPrice * quantity, raw_data: raw, updated_at: new Date().toISOString() },
    item: { external_item_key: hash(`${shipmentBoxId}:${orderItemId || vendorItemId || sellerProductId || productName}:${orderItemId ? '' : rowIndex}`), shipment_box_id: shipmentBoxId, order_id: orderId, vendor_item_id: vendorItemId, seller_product_id: sellerProductId, product_name: productName, quantity, unit_price: unitPrice, paid_amount: paidAmount || unitPrice * quantity, status, raw_data: raw, updated_at: new Date().toISOString() }
  };
}

function mapProductRow(row, lookup) {
  const sellerProductId = text(value(row, lookup, 'sellerProductId'));
  if (!sellerProductId) return null;
  const raw = sanitize(Object.fromEntries(Object.entries(lookup).filter(([, index]) => index >= 0).map(([field, index]) => [field, row[index]])));
  return { seller_product_id: sellerProductId, product_id: text(value(row, lookup, 'productId')), product_name: withOption(value(row, lookup, 'productName'), value(row, lookup, 'optionName')), status: text(value(row, lookup, 'status')), brand: text(value(row, lookup, 'brand')), raw_data: raw, updated_at: new Date().toISOString() };
}

function mapSettlementRow(row, lookup, rowIndex) {
  const orderId = text(value(row, lookup, 'orderId'));
  const vendorItemId = text(value(row, lookup, 'vendorItemId'));
  const recognitionDate = dateOnly(value(row, lookup, 'recognitionDate')) || dateOnly(value(row, lookup, 'settlementDate'));
  if (!recognitionDate) return null;
  const saleType = text(value(row, lookup, 'saleType')) || 'FILE_IMPORT';
  const settlementAmount = number(value(row, lookup, 'settlementAmount'));
  const raw = sanitize(Object.fromEntries(Object.entries(lookup).filter(([, index]) => index >= 0).map(([field, index]) => [field, row[index]])));
  return { settlement_key: hash(`${orderId || 'NO_ORDER'}:${vendorItemId || rowIndex}:${recognitionDate}:${saleType}:${settlementAmount}`), order_id: orderId, vendor_item_id: vendorItemId, sale_type: saleType, recognition_date: recognitionDate, settlement_date: dateOnly(value(row, lookup, 'settlementDate')), sale_amount: number(value(row, lookup, 'saleAmount')), service_fee: number(value(row, lookup, 'serviceFee')), service_fee_vat: number(value(row, lookup, 'serviceFeeVat')), settlement_amount: settlementAmount, quantity: number(value(row, lookup, 'quantity')), raw_data: raw, updated_at: new Date().toISOString() };
}

async function upsertMany(db, table, rows, onConflict) {
  const unique = [...new Map(rows.map(row => [String(row[onConflict.split(',')[0]]), row])).values()];
  for (let index = 0; index < unique.length; index += BATCH_SIZE) {
    const result = await db.from(table).upsert(unique.slice(index, index + BATCH_SIZE), { onConflict });
    if (result.error) throw result.error;
  }
  return unique.length;
}

async function importFile({ buffer, fileName, fileType, dataset = 'AUTO' }) {
  dataset = String(dataset || 'AUTO').toUpperCase();
  if (!DATASETS.has(dataset)) throw new Error('지원하지 않는 쿠팡 자료 종류입니다.');
  const extension = fileName.split('.').pop()?.toLowerCase();
  const sheets = extension === 'csv' ? tabularCsv(buffer) : await tabularXlsx(buffer);
  const tables = extractTables(sheets);
  if (!tables.length) throw new Error('열 이름을 찾지 못했습니다. 쿠팡 WING에서 내려받은 원본 CSV/XLSX인지 확인해주세요.');
  const totalRows = tables.reduce((sum, table) => sum + table.rows.length, 0);
  if (totalRows > MAX_ROWS) throw new Error(`한 번에 최대 ${MAX_ROWS.toLocaleString()}행까지 가져올 수 있습니다.`);

  const db = getSupabase();
  const started = await db.from('sync_logs').insert({ platform: 'COUPANG', job_type: 'FILE_IMPORT', status: 'RUNNING', metadata: { file_name: fileName, file_type: fileType, requested_dataset: dataset } }).select('id').single();
  if (started.error) throw started.error;
  const logId = started.data.id;
  const counts = { products: 0, orders: 0, orderItems: 0, settlements: 0, invalidRows: 0, inputRows: totalRows };
  const periods = [];
  try {
    const products = [], orders = [], orderItems = [], settlements = [], detected = [];
    for (const table of tables) {
      const kind = dataset === 'AUTO' ? detectedDataset(table.lookup) : dataset;
      if (!kind) { counts.invalidRows += table.rows.length; continue; }
      detected.push({ sheet: table.sheet, dataset: kind, rows: table.rows.length });
      table.rows.forEach((row, index) => {
        if (kind === 'ORDERS') {
          const mapped = mapOrderRow(row, table.lookup, index);
          if (!mapped) counts.invalidRows += 1; else { orders.push(mapped.order); orderItems.push(mapped.item); const day = mapped.order.ordered_at?.slice(0, 10); if (day) periods.push(day); }
        } else if (kind === 'PRODUCTS') {
          const mapped = mapProductRow(row, table.lookup); if (!mapped) counts.invalidRows += 1; else products.push(mapped);
        } else if (kind === 'SETTLEMENTS') {
          const mapped = mapSettlementRow(row, table.lookup, index); if (!mapped) counts.invalidRows += 1; else { settlements.push(mapped); periods.push(mapped.recognition_date); }
        }
      });
    }
    const orderMap = new Map();
    for (const order of orders) { const current = orderMap.get(order.shipment_box_id); orderMap.set(order.shipment_box_id, current ? { ...current, gross_amount: Number(current.gross_amount) + Number(order.gross_amount) } : order); }
    counts.products = await upsertMany(db, 'coupang_products', products, 'seller_product_id');
    counts.orders = await upsertMany(db, 'coupang_orders', [...orderMap.values()], 'shipment_box_id');
    counts.orderItems = await upsertMany(db, 'coupang_order_items', orderItems, 'external_item_key');
    counts.settlements = await upsertMany(db, 'coupang_settlements', settlements, 'settlement_key');
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const rawSaved = await db.from('raw_api_responses').insert({ platform: 'COUPANG', endpoint: `FILE_IMPORT:${detected.map(item => item.dataset).join(',') || dataset}`, http_status: 200, period_start: periods.sort()[0] || null, period_end: periods.sort().at(-1) || null, response_json: { file_name: fileName, file_hash: fileHash, sheets: detected, counts } });
    if (rawSaved.error) throw rawSaved.error;
    const finishedAt = new Date().toISOString();
    const rowsReceived = counts.products + counts.orders + counts.orderItems + counts.settlements;
    const status = counts.invalidRows && !rowsReceived ? 'FAILED' : counts.invalidRows ? 'PARTIAL' : 'SUCCESS';
    const updated = await db.from('sync_logs').update({ status, finished_at: finishedAt, rows_received: rowsReceived, metadata: { file_name: fileName, detected, counts, period: { start: periods.sort()[0] || null, end: periods.sort().at(-1) || null } } }).eq('id', logId);
    if (updated.error) throw updated.error;
    return { syncLogId: logId, status, counts, detected, period: { start: periods.sort()[0] || null, end: periods.sort().at(-1) || null } };
  } catch (error) {
    await db.from('sync_logs').update({ status: 'FAILED', finished_at: new Date().toISOString(), rows_received: 0, error_message: error.message, metadata: { file_name: fileName, counts } }).eq('id', logId);
    throw error;
  }
}

module.exports = { importFile, extractTables, detectedDataset, mapOrderRow, mapProductRow, mapSettlementRow, normalize, parseCsvLine };
