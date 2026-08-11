'use strict';

const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { getSupabase } = require('../cafe24/supabase.js');

const BATCH_SIZE = 300;
const MAX_ROWS = 100000;
const SOURCE_LABELS = {
  SALES_COMMISSION: '판매수수료',
  RETURN_PICKUP: '반품회수비',
  RETURN_RESTOCKING: '반품재입고비',
  INVENTORY_COMPENSATION: '재고손실보상',
  STORAGE: '보관비',
  VALUE_ADDED_SERVICE: '부가서비스비',
  RETURN_HANDLING: '반출비',
  RETURN_SHIPPING: '반출배송비',
  WAREHOUSING: '입출고비',
  SHIPPING: '배송비'
};

const text = value => value == null || value === '' ? null : String(value).trim();
const number = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw) return 0;
  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);
  const parsed = Number(raw.replace(/[^0-9.]/g, '')) || 0;
  return negative ? -parsed : parsed;
};
const dateOnly = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const matched = String(value ?? '').match(/(20\d{2})[^0-9]?(\d{1,2})[^0-9]?(\d{1,2})/);
  return matched ? `${matched[1]}-${String(matched[2]).padStart(2, '0')}-${String(matched[3]).padStart(2, '0')}` : null;
};
const hash = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
const cellValue = cell => cell?.value?.result ?? cell?.value?.text ?? cell?.value ?? null;
const rowValues = row => Array.from({ length: row.cellCount }, (_, index) => cellValue(row.getCell(index + 1)));

function sourceType(fileName, sheetName) {
  const file = String(fileName).toUpperCase();
  const sheet = String(sheetName);
  if (file.includes('CATEGORY_TR')) return 'SALES_COMMISSION';
  if (file.includes('INVENTORY_COMPENSATION')) return 'INVENTORY_COMPENSATION';
  if (file.includes('STORAGE_FEE')) return 'STORAGE';
  if (file.includes('VALUE_ADDED_SERVICE_FEE')) return 'VALUE_ADDED_SERVICE';
  if (file.includes('VRETURN_HANDLING')) return sheet.includes('반출비') ? 'RETURN_HANDLING' : null;
  if (file.includes('VRETURN_SHIPPING')) return 'RETURN_SHIPPING';
  if (file.includes('CRETURN_PICKUP_RESTOCKING')) return sheet.includes('재입고') ? 'RETURN_RESTOCKING' : sheet.includes('회수') ? 'RETURN_PICKUP' : null;
  if (file.includes('WAREHOUSING_SHIPPING')) return sheet.includes('입출고') ? 'WAREHOUSING' : sheet.includes('배송비') ? 'SHIPPING' : null;
  return null;
}

function findHeader(sheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
    const row = rowValues(sheet.getRow(rowNumber)).map(value => String(value ?? '').trim());
    if (row.includes('정산유형') || row.includes('발생일')) return rowNumber;
  }
  return -1;
}

function mappedRow(type, row, sourceFile, sheetName) {
  const common = {
    source_type: type,
    transaction_type: text(row[5]) || SOURCE_LABELS[type],
    event_date: dateOnly(row[3] ?? row[0]),
    recognition_date: dateOnly(row[4]),
    settlement_end_date: dateOnly(row[1]),
    order_id: null,
    reference_id: null,
    seller_product_id: null,
    vendor_item_id: null,
    sku_id: null,
    product_name: null,
    option_name: null,
    quantity: 0,
    gross_sales: 0,
    seller_discount: 0,
    settlement_target: 0,
    cost_amount: 0,
    cost_vat: 0,
    credit_amount: 0,
    raw_data: { source_file: sourceFile, sheet: sheetName }
  };

  if (type === 'SALES_COMMISSION') Object.assign(common, {
    transaction_type: text(row[6]) || '주문 정산', event_date: dateOnly(row[3]), recognition_date: dateOnly(row[4]),
    order_id: text(row[5]), seller_product_id: text(row[10]), vendor_item_id: text(row[11]), sku_id: text(row[12]),
    product_name: text(row[13]), option_name: text(row[14]), quantity: number(row[16]), gross_sales: number(row[19]),
    seller_discount: number(row[22]), settlement_target: number(row[23]), cost_amount: number(row[26]), cost_vat: number(row[27]),
    raw_data: { source_file: sourceFile, sheet: sheetName, category_id: text(row[7]), category: text(row[8]), commission_rate: number(row[24]), sale_price: number(row[15]) }
  });
  if (type === 'RETURN_PICKUP') Object.assign(common, {
    order_id: text(row[6]), seller_product_id: text(row[8]), vendor_item_id: text(row[9]), sku_id: text(row[10]), product_name: text(row[11]), option_name: text(row[12]), quantity: number(row[15]), cost_amount: number(row[29]),
    raw_data: { source_file: sourceFile, sheet: sheetName, size: text(row[24]), charged_quantity: number(row[19]), original_cost: number(row[25]), discount: number(row[26]), promotion: number(row[28]) }
  });
  if (type === 'RETURN_RESTOCKING') Object.assign(common, {
    order_id: text(row[6]), reference_id: text(row[8]), seller_product_id: text(row[9]), vendor_item_id: text(row[10]), sku_id: text(row[11]), product_name: text(row[12]), option_name: text(row[13]), quantity: number(row[18]), cost_amount: number(row[27]),
    raw_data: { source_file: sourceFile, sheet: sheetName, charged_quantity: number(row[22]), original_cost: number(row[23]), discount: number(row[24]), promotion: number(row[26]) }
  });
  if (type === 'STORAGE') Object.assign(common, {
    transaction_type: '보관비 정산', seller_product_id: text(row[7]), vendor_item_id: text(row[8]), sku_id: text(row[9]), product_name: text(row[10]), option_name: text(row[11]), quantity: number(row[12]), cost_amount: number(row[19]),
    raw_data: { source_file: sourceFile, sheet: sheetName, display_date: dateOnly(row[5]), storage_days: number(row[6]), cbm: number(row[13]), original_cost: number(row[15]), discount: number(row[16]), saver_benefit: number(row[18]) }
  });
  if (type === 'VALUE_ADDED_SERVICE') Object.assign(common, {
    reference_id: text(row[8]) || text(row[7]), seller_product_id: text(row[9]), vendor_item_id: text(row[10]), sku_id: text(row[11]), product_name: text(row[12]), option_name: text(row[13]), quantity: number(row[16]), cost_amount: number(row[19]),
    raw_data: { source_file: sourceFile, sheet: sheetName, service_type: text(row[6]), inbound_id: text(row[7]), size: text(row[14]), fulfillment_center: text(row[15]), original_cost: number(row[17]), discount: number(row[18]) }
  });
  if (type === 'RETURN_HANDLING') Object.assign(common, {
    reference_id: text(row[7]), seller_product_id: text(row[9]), vendor_item_id: text(row[10]), sku_id: text(row[11]), product_name: text(row[12]), option_name: text(row[13]), quantity: number(row[14]), cost_amount: number(row[21]),
    raw_data: { source_file: sourceFile, sheet: sheetName, return_type: text(row[6]), charged_quantity: number(row[16]), original_cost: number(row[17]), discount: number(row[18]), promotion: number(row[20]) }
  });
  if (type === 'RETURN_SHIPPING') Object.assign(common, {
    reference_id: text(row[7]), seller_product_id: text(row[9]), product_name: text(row[10]), quantity: number(row[13]), cost_amount: number(row[20]),
    raw_data: { source_file: sourceFile, sheet: sheetName, return_type: text(row[6]), fulfillment_center: text(row[11]), box_type: text(row[14]), charged_quantity: number(row[15]), original_cost: number(row[16]), discount: number(row[17]), promotion: number(row[19]) }
  });
  if (type === 'WAREHOUSING') Object.assign(common, {
    order_id: text(row[6]), reference_id: text(row[7]), seller_product_id: text(row[9]), vendor_item_id: text(row[10]), sku_id: text(row[11]), product_name: text(row[12]), option_name: text(row[13]), quantity: number(row[19]), gross_sales: number(row[14]) * number(row[19]), cost_amount: number(row[24]),
    raw_data: { source_file: sourceFile, sheet: sheetName, order_date: dateOnly(row[8]), size: text(row[17]), fulfillment_center: text(row[18]), units_per_option: number(row[20]), original_cost: number(row[22]), discount: number(row[23]) }
  });
  if (type === 'SHIPPING') Object.assign(common, {
    order_id: text(row[6]), reference_id: text(row[7]), seller_product_id: text(row[9]), vendor_item_id: text(row[10]), sku_id: text(row[11]), product_name: text(row[12]), option_name: text(row[13]), quantity: number(row[20]), gross_sales: number(row[14]), cost_amount: number(row[25]),
    raw_data: { source_file: sourceFile, sheet: sheetName, order_date: dateOnly(row[8]), size: text(row[17]), total_size: text(row[18]), fulfillment_center: text(row[19]), original_cost: number(row[21]), discount: number(row[22]), additional_cost: number(row[24]) }
  });
  if (type === 'INVENTORY_COMPENSATION') Object.assign(common, {
    transaction_type: text(row[3]) || '재고 손실 보상', event_date: dateOnly(row[0]), settlement_end_date: dateOnly(row[1]), order_id: text(row[2]), vendor_item_id: text(row[6]), product_name: text(row[7]), option_name: text(row[8]), quantity: number(row[10]), gross_sales: number(row[11]), credit_amount: number(row[28]),
    raw_data: { source_file: sourceFile, sheet: sheetName, loss_type: text(row[4]), category: text(row[5]), inspection_id: text(row[23]), compensation_rate: number(row[27]), note: text(row[31]) }
  });

  if (!common.event_date && !common.recognition_date && !common.settlement_end_date) return null;
  const identity = [type, common.transaction_type, common.event_date, common.recognition_date, common.order_id, common.reference_id, common.vendor_item_id, common.sku_id, common.quantity, common.cost_amount, common.credit_amount, common.gross_sales].join('|');
  return { ...common, transaction_key: hash(identity) };
}

async function parseCostWorkbook(buffer, fileName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer));
  const transactions = []; const sheets = []; let invalidRows = 0;
  for (const sheet of workbook.worksheets) {
    const type = sourceType(fileName, sheet.name);
    if (!type) continue;
    const header = findHeader(sheet);
    if (header < 0) continue;
    let rows = 0;
    for (let rowNumber = header + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const values = rowValues(sheet.getRow(rowNumber));
      if (!values.some(value => text(value))) continue;
      if (!text(values[0])) continue;
      const mapped = mappedRow(type, values, fileName, sheet.name);
      if (!mapped) { invalidRows += 1; continue; }
      transactions.push(mapped); rows += 1;
    }
    sheets.push({ name: sheet.name, sourceType: type, rows });
  }
  if (!sheets.length) throw new Error('지원하는 쿠팡 정산·로켓그로스 비용 보고서가 아닙니다.');
  if (transactions.length > MAX_ROWS) throw new Error(`파일 한 개당 최대 ${MAX_ROWS.toLocaleString()}행까지 처리할 수 있습니다.`);
  return { transactions, sheets, invalidRows };
}

async function upsertTransactions(db, rows) {
  let duplicateRows = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const existing = await db.from('coupang_cost_transactions').select('transaction_key').in('transaction_key', batch.map(row => row.transaction_key));
    if (existing.error) throw existing.error;
    duplicateRows += existing.data?.length || 0;
    const result = await db.from('coupang_cost_transactions').upsert(batch, { onConflict: 'transaction_key' });
    if (result.error) throw result.error;
  }
  return duplicateRows;
}

async function importCostFile({ buffer, fileName }) {
  const db = getSupabase();
  const fileHash = hash(buffer);
  const prior = await db.from('coupang_cost_imports').select('*').eq('file_hash', fileHash).maybeSingle();
  if (prior.error) throw prior.error;
  if (prior.data) return { skipped: true, import: prior.data, counts: { inputRows: prior.data.input_rows, storedRows: 0, duplicateRows: prior.data.input_rows, invalidRows: prior.data.invalid_rows } };
  const parsed = await parseCostWorkbook(buffer, fileName);
  const unique = [...new Map(parsed.transactions.map(row => [row.transaction_key, row])).values()];
  const periods = unique.flatMap(row => [row.event_date, row.recognition_date].filter(Boolean)).sort();
  const totals = unique.reduce((sum, row) => ({ grossSales: sum.grossSales + number(row.gross_sales), costAmount: sum.costAmount + number(row.cost_amount), costVat: sum.costVat + number(row.cost_vat), creditAmount: sum.creditAmount + number(row.credit_amount) }), { grossSales: 0, costAmount: 0, costVat: 0, creditAmount: 0 });
  const inserted = await db.from('coupang_cost_imports').insert({
    file_hash: fileHash, file_name: fileName, source_types: [...new Set(parsed.sheets.map(item => item.sourceType))], status: parsed.invalidRows ? 'PARTIAL' : 'SUCCESS',
    input_rows: parsed.transactions.length + parsed.invalidRows, stored_rows: unique.length, duplicate_rows: parsed.transactions.length - unique.length, invalid_rows: parsed.invalidRows,
    gross_sales: totals.grossSales, cost_amount: totals.costAmount, cost_vat: totals.costVat, credit_amount: totals.creditAmount,
    period_start: periods[0] || null, period_end: periods.at(-1) || null, metadata: { sheets: parsed.sheets }
  }).select('*').single();
  if (inserted.error) throw inserted.error;
  const rows = unique.map(row => ({ ...row, import_id: inserted.data.id }));
  const existingDuplicates = await upsertTransactions(db, rows);
  const duplicateRows = parsed.transactions.length - unique.length + existingDuplicates;
  await db.from('coupang_cost_imports').update({ stored_rows: unique.length - existingDuplicates, duplicate_rows: duplicateRows }).eq('id', inserted.data.id);
  return { skipped: false, import: { ...inserted.data, stored_rows: unique.length - existingDuplicates, duplicate_rows: duplicateRows }, counts: { inputRows: parsed.transactions.length + parsed.invalidRows, storedRows: unique.length - existingDuplicates, duplicateRows, invalidRows: parsed.invalidRows }, sheets: parsed.sheets, totals };
}

module.exports = { SOURCE_LABELS, sourceType, parseCostWorkbook, importCostFile };
