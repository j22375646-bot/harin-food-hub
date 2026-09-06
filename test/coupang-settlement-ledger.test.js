'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../lib/coupang/file-import.js');
const map = require('../lib/coupang/mappers.js');
const ExcelJS = require('exceljs');
const costs = require('../lib/coupang/cost-file-import.js');

function settlement(values) {
  const table = importer.extractTables([{ name: '정산', rows: [
    ['주문번호', '옵션ID', '매출인식일', '정산금액', '서비스수수료', 'delivery_family', 'source_record_id'], values
  ] }])[0];
  return importer.mapSettlementRow(table.rows[0], table.lookup, 0);
}

test('settlement file retains explicit family and unknown amount separately from zero', () => {
  const row = settlement(['order-1', 'item-1', '2026-09-01', '', '0', 'ROCKET_GROWTH', 'line-1']);
  assert.equal(row.delivery_family, 'ROCKET_GROWTH');
  assert.equal(row.settlement_amount, null);
  assert.equal(row.service_fee, 0);
  assert.equal(row.reconciliation_status, 'MISSING_AMOUNT');
  assert.equal(row.source_record_id, 'line-1');
});

test('settlement identity survives amount corrections and row order but separates families', () => {
  const initial = settlement(['order-1', 'item-1', '2026-09-01', 100, 0, 'ROCKET_GROWTH', 'line-1']);
  const corrected = settlement(['order-1', 'item-1', '2026-09-01', 150, 0, 'ROCKET_GROWTH', 'line-1']);
  const seller = settlement(['order-1', 'item-1', '2026-09-01', 150, 0, 'COUPANG', 'line-1']);
  assert.equal(initial.settlement_key, corrected.settlement_key);
  assert.notEqual(initial.settlement_key, seller.settlement_key);
  assert.equal(settlement(['', '', '2026-09-01', 150, 0, '', '']), null);
});

test('documented API revenue rows remain unknown projections with the legacy key contract', () => {
  const entry = { orderId: 123, recognitionDate: '2026-09-01', saleType: 'SALE', items: [{ vendorItemId: 456, saleAmount: 100, settlementAmount: null, serviceFee: 0 }] };
  const first = map.mapSettlementRows(entry)[0];
  const corrected = map.mapSettlementRows({ ...entry, items: [{ ...entry.items[0], settlementAmount: 90 }] })[0];
  assert.equal(first.delivery_family, 'UNKNOWN');
  assert.equal(first.settlement_amount, null);
  assert.notEqual(first.settlement_key, corrected.settlement_key);
  assert.equal(first.provenance.identity_evidence, 'UNVERIFIED_API_PROJECTION');
  assert.equal(first.provenance.identity_version, 1);
  assert.equal(first.ingestion_source, 'COUPANG_REVENUE_API');
});

test('payout summaries preserve partial periods, nulls and explicit RG file provenance', () => {
  const item = { sourceRecordId: 'payment-1', settlementType: 'MONTHLY', settlementDate: '2026-09-10', revenueRecognitionDateFrom: '2026-09-01', revenueRecognitionDateTo: '2026-09-03', settlementTargetAmount: 1000, finalAmount: 400, status: 'DONE' };
  const context = { deliveryFamily: 'ROCKET_GROWTH', source: 'WING_PAYOUT_FILE' };
  const payout = map.mapSettlementSummary(item, '2026-09', context);
  const corrected = map.mapSettlementSummary({ ...item, finalAmount: 450 }, '2026-09', context);
  assert.equal(payout.delivery_family, 'ROCKET_GROWTH');
  assert.equal(payout.period_end, '2026-09-03');
  assert.equal(payout.settlement_amount, null);
  assert.equal(payout.final_amount, 400);
  assert.equal(payout.summary_key, corrected.summary_key);
  assert.equal(map.mapSettlementSummary(item, '2026-09').delivery_family, 'UNKNOWN');
});

function database(seed = []) {
  const rows = new Map(seed.map(([table, row]) => [`${table}:${row.settlement_key || row.summary_key || row.transaction_key}`, row]));
  return { rows, from(table) { return {
    select() {
      let filtered = [...rows].filter(([key]) => key.startsWith(`${table}:`)).map(([, row]) => row);
      const query = {
        eq(field, value) { filtered = filtered.filter(row => row[field] === value); return query; },
        gte(field, value) { filtered = filtered.filter(row => row[field] >= value); return query; },
        lte(field, value) { filtered = filtered.filter(row => row[field] <= value); return query; },
        limit: async count => ({ data: filtered.slice(0, count) })
      };
      return query;
    },
    insert() { return { select() { return { single: async () => ({ data: { id: 'test-import' } }) }; } }; },
    update() { return { eq: async () => ({}) }; },
    async upsert(batch, { onConflict }) { for (const row of batch) rows.set(`${table}:${row[onConflict]}`, row); return {}; }
  }; } };
}
const csv = rows => Buffer.from(rows.map(row => row.join(',')).join('\n'));
test('public file importer repeats and corrects RG payouts without merging duplicate unidentified lines', async () => {
  const db = database();
  const headers = ['source_record_id', 'delivery_family', 'recognition_month', 'period_start', 'period_end', 'settlement_type', '정산일', 'status', 'final_amount', 'settlement_target_amount'];
  const rows = [['pay-1', 'ROCKET_GROWTH', '2026-09', '2026-09-01', '2026-09-03', 'MONTHLY', '2026-09-10', 'DONE', 400, 1000]];
  const run = values => importer.importFile({ db, buffer: csv([headers, ...values]), fileName: 'payout.csv', dataset: 'PAYOUTS' });
  assert.equal((await run(rows)).counts.payouts, 1);
  await run(rows);
  await run([[...rows[0].slice(0, 8), 450, 1000]]);
  assert.equal(db.rows.size, 1);
  assert.equal([...db.rows.values()][0].final_amount, 450);
  await assert.rejects(run([rows[0], rows[0]]), /AMBIGUOUS_IDENTITY/);
});

async function costWorkbook(amount, family = 'ROCKET_GROWTH', duplicate = false, recordId = 'cost-1') {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('보관비');
  const headers = Array(22).fill(''); headers[0] = '발생일'; headers[20] = 'delivery_family'; headers[21] = 'source_record_id';
  sheet.addRow(headers);
  const row = Array(22).fill(null); row[0] = '2026-09-01'; row[1] = '2026-09-30'; row[3] = '2026-09-01'; row[8] = 'item-1'; row[19] = amount; row[20] = family; row[21] = recordId;
  sheet.addRow(row); if (duplicate) sheet.addRow(row);
  return book.xlsx.writeBuffer();
}

test('RG cost files retain blanks and stable source identity and reject ambiguous duplicates', async () => {
  const first = (await costs.parseCostWorkbook(await costWorkbook(null), 'STORAGE_FEE.xlsx')).transactions[0];
  const corrected = (await costs.parseCostWorkbook(await costWorkbook(50), 'STORAGE_FEE-corrected.xlsx')).transactions[0];
  assert.equal(first.delivery_family, 'ROCKET_GROWTH');
  assert.equal(first.source_type, 'STORAGE');
  assert.equal(first.cost_amount, null);
  assert.equal(first.transaction_key, corrected.transaction_key);
  const unknown = (await costs.parseCostWorkbook(await costWorkbook(0, ''), 'STORAGE_FEE.xlsx')).transactions[0];
  assert.equal(unknown.delivery_family, 'UNKNOWN');
  assert.equal(unknown.cost_amount, 0);
  await assert.rejects(async () => costs.parseCostWorkbook(await costWorkbook(20, 'ROCKET_GROWTH', true), 'STORAGE_FEE.xlsx'), /AMBIGUOUS_IDENTITY/);
});

test('cost import failure remains retryable and identical successful files are idempotent', async () => {
  let saved = null; let fail = true; const stored = new Map();
  const db = { from(table) {
    if (table === 'coupang_cost_imports') return {
      select() { return { eq() { return { maybeSingle: async () => ({ data: saved }) }; } }; },
      insert(row) { saved = { ...row, id: 'cost-import-1' }; return { select() { return { single: async () => ({ data: saved }) }; } }; },
      update(row) { return { eq: async () => { saved = { ...saved, ...row }; return {}; } }; }
    };
    if (table === 'coupang_cost_transactions') return {
      select() { return { eq() { return { limit: async () => ({ data: [] }) }; }, in: async () => ({ data: [...stored.values()] }) }; },
      upsert: async rows => { if (fail) return { error: new Error('temporary DB failure') }; for (const row of rows) stored.set(row.transaction_key, row); return {}; }
    };
    throw new Error('No calibration is allowed for unresolved family');
  } };
  const options = { db, buffer: await costWorkbook(20, ''), fileName: 'STORAGE_FEE.xlsx' };
  await assert.rejects(costs.importCostFile(options), /temporary DB failure/);
  assert.equal(saved.status, 'FAILED');
  fail = false;
  const imported = await costs.importCostFile(options);
  assert.equal(imported.skipped, false);
  assert.equal(imported.calibration.status, 'PENDING_TYPED_EVIDENCE');
  assert.equal(imported.calibration.autoApplied, false);
  assert.equal(saved.status, 'SUCCESS');
  assert.equal((await costs.importCostFile(options)).skipped, true);
  assert.equal(stored.size, 1);
});

test('separate cost exports without a source record ID are rejected even with matching product and date', async () => {
  const db = { from() { return { select() { return { eq() { return { maybeSingle: async () => ({ data: null }) }; } }; } }; } };
  for (const amount of [100, 200]) await assert.rejects(costs.importCostFile({ db, buffer: await costWorkbook(amount, 'ROCKET_GROWTH', false, ''), fileName: `STORAGE_FEE-${amount}.xlsx` }), /AMBIGUOUS_IDENTITY/);
});

test('legacy cost records block replay without inserting or changing financial records', async () => {
  const legacy = { id: 'old-cost', transaction_key: 'original-key', ingestion_source: 'LEGACY', delivery_family: 'UNKNOWN', cost_amount: 100 };
  const db = { from(table) {
    if (table === 'coupang_cost_imports') return { select() { return { eq() { return { maybeSingle: async () => ({ data: null }) }; } }; } };
    if (table === 'coupang_cost_transactions') return { select() { return { eq: (field, value) => { assert.equal(field, 'ingestion_source'); assert.equal(value, 'LEGACY'); return { limit: async () => ({ data: [legacy] }) }; } }; } };
    throw new Error('Unexpected write');
  } };
  await assert.rejects(costs.importCostFile({ db, buffer: await costWorkbook(100), fileName: 'STORAGE_FEE.xlsx' }), /LEGACY_RECONCILIATION_REQUIRED/);
  assert.equal(legacy.transaction_key, 'original-key');
  assert.equal(legacy.cost_amount, 100);
});

test('file line storage ignores CSV order, updates amounts and keeps same-order seller and RG apart', async () => {
  const db = database();
  const headers = ['주문번호', '옵션ID', '매출인식일', '정산금액', 'delivery_family', 'source_record_id'];
  const rg = ['order-1', 'item-1', '2026-09-01', 100, 'ROCKET_GROWTH', 'line-1'];
  const seller = ['order-1', 'item-1', '2026-09-01', 80, 'COUPANG', 'line-1'];
  const run = rows => importer.importFile({ db, buffer: csv([headers, ...rows]), fileName: 'lines.csv', dataset: 'SETTLEMENTS' });
  await run([rg, seller]);
  await run([seller, [...rg.slice(0, 3), 110, 'ROCKET_GROWTH', 'line-1']]);
  assert.equal(db.rows.size, 2);
  assert.equal([...db.rows.values()].find(row => row.delivery_family === 'ROCKET_GROWTH').settlement_amount, 110);
  await assert.rejects(run([rg, rg]), /AMBIGUOUS_IDENTITY/);
});

test('separate partial financial files without genuine source IDs cannot overwrite each other', async () => {
  const db = database();
  const header = ['주문번호', '옵션ID', '매출인식일', '정산금액', 'delivery_family'];
  for (const amount of [100, 200]) {
    await assert.rejects(importer.importFile({ db, buffer: csv([header, ['order-1', 'item-1', '2026-09-01', amount, 'ROCKET_GROWTH']]), fileName: `partial-${amount}.csv`, dataset: 'SETTLEMENTS' }), /AMBIGUOUS_IDENTITY/);
  }
  assert.equal(db.rows.size, 0);
});

test('legacy financial line and payout overlaps block v2 replay before any ledger write', async () => {
  for (const [table, legacy, headers, row, dataset] of [
    ['coupang_settlements', { settlement_key: 'old-line-key', ingestion_source: 'LEGACY', delivery_family: 'UNKNOWN', recognition_date: '2026-09-01', settlement_amount: 100 }, ['source_record_id', '주문번호', '매출인식일', '정산금액'], ['source-line-1', 'order-1', '2026-09-01', 100], 'SETTLEMENTS'],
    ['coupang_settlement_summaries', { summary_key: 'old-payout-key', ingestion_source: 'LEGACY', delivery_family: 'UNKNOWN', recognition_month: '2026-09', final_amount: 100 }, ['source_record_id', 'recognition_month', 'period_start', 'period_end', 'final_amount'], ['pay-1', '2026-09', '2026-09-01', '2026-09-03', 100], 'PAYOUTS']
  ]) {
    const db = database([[table, legacy]]);
    await assert.rejects(importer.importFile({ db, buffer: csv([headers, row]), fileName: 'replay.csv', dataset }), /LEGACY_RECONCILIATION_REQUIRED/);
    assert.deepEqual([...db.rows.values()], [legacy]);
  }
});

test('API projection permits complete identity but blocks missing identity and actual duplicate keys', () => {
  const ledger = require('../lib/coupang/settlement-ledger.js');
  const revenue = map.mapSettlementRows({ orderId: 123, recognitionDate: '2026-09-01', saleType: 'SALE', items: [{ vendorItemId: 456, settlementAmount: 90 }] });
  const payout = map.mapSettlementSummary({ settlementType: 'MONTHLY', settlementDate: '2026-09-10', revenueRecognitionDateFrom: '2026-09-01', revenueRecognitionDateTo: '2026-09-03', finalAmount: 100 }, '2026-09');
  assert.doesNotThrow(() => ledger.assertUniqueLedgerRows(revenue, 'settlement_key'));
  assert.doesNotThrow(() => ledger.assertUniqueLedgerRows([payout], 'summary_key'));
  assert.throws(() => ledger.assertUniqueLedgerRows([...revenue, ...revenue], 'settlement_key'), /AMBIGUOUS_IDENTITY/);
  assert.throws(() => ledger.assertUniqueLedgerRows([payout, payout], 'summary_key'), /AMBIGUOUS_IDENTITY/);
  assert.throws(() => ledger.assertUniqueLedgerRows(map.mapSettlementRows({ orderId: 123, recognitionDate: '2026-09-01', saleType: 'SALE', items: [{ settlementAmount: 90 }] }), 'settlement_key'), /AMBIGUOUS_IDENTITY/);
});

test('legacy API revenue and payout projections replay into exact original keys without adding rows', async () => {
  const ledger = require('../lib/coupang/settlement-ledger.js');
  const revenueKey = '98fe4ed399e6f61e31a0e4529ff2274414c61ef4cdb96b53818b62611f127c9b';
  const payoutKey = '0462b54417d71aa83bcfc394bcfb134fa06d85e800c42049a8831ca6d51b773c';
  const db = database([
    ['coupang_settlements', { settlement_key: revenueKey, ingestion_source: 'LEGACY', delivery_family: 'UNKNOWN', settlement_amount: 100 }],
    ['coupang_settlement_summaries', { summary_key: payoutKey, ingestion_source: 'LEGACY', delivery_family: 'UNKNOWN', final_amount: 100 }]
  ]);
  const revenue = map.mapSettlementRows({ orderId: 123, recognitionDate: '2026-09-01', saleType: 'SALE', items: [{ vendorItemId: 456, settlementAmount: 100, saleAmount: 110, serviceFee: 10, serviceFeeVat: 0 }] });
  const payout = map.mapSettlementSummary({ settlementType: 'MONTHLY', settlementDate: '2026-09-10', revenueRecognitionDateFrom: '2026-09-01', revenueRecognitionDateTo: '2026-09-03', finalAmount: 100, settlementTargetAmount: 110 }, '2026-09');
  assert.equal(revenue[0].settlement_key, revenueKey);
  assert.equal(payout.summary_key, payoutKey);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await ledger.saveApiProjection(db, 'coupang_settlements', revenue);
    await ledger.saveApiProjection(db, 'coupang_settlement_summaries', [payout]);
  }
  assert.equal(db.rows.size, 2);
  for (const row of db.rows.values()) {
    assert.equal(row.delivery_family, 'UNKNOWN');
    assert.equal(row.reconciliation_status, 'UNVERIFIED');
    assert.equal(row.provenance.identity_evidence, 'UNVERIFIED_API_PROJECTION');
  }
});

test('API projection validates the complete input before writing its first batch', async () => {
  const ledger = require('../lib/coupang/settlement-ledger.js');
  const db = database();
  const rows = Array.from({ length: 301 }, (_, index) => map.mapSettlementRows({ orderId: index + 1, recognitionDate: '2026-09-01', saleType: 'SALE', items: [{ vendorItemId: 456, settlementAmount: 100 }] })[0]);
  await assert.rejects(ledger.saveApiProjection(db, 'coupang_settlements', [...rows, rows[0]]), /AMBIGUOUS_IDENTITY/);
  assert.equal(db.rows.size, 0);
});

test('empty API detail items are preserved as unresolved evidence, not silently discarded', () => {
  const rows = map.mapSettlementRows({ orderId: 'order-1', recognitionDate: '2026-09-01', saleType: 'REFUND', items: [] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].settlement_amount, null);
  assert.equal(rows[0].reconciliation_status, 'AMBIGUOUS_IDENTITY');
});
