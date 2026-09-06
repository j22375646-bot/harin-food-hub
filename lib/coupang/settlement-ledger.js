'use strict';
const crypto = require('node:crypto');
const FAMILIES = new Set(['COUPANG', 'ROCKET_GROWTH', 'UNKNOWN']);
function ledgerDeliveryFamily(row) {
  const candidate = row && typeof row === 'object' ? row.delivery_family ?? row.raw_data?.delivery_family : row;
  const normalized = String(candidate ?? '').trim().toUpperCase();
  return FAMILIES.has(normalized) ? normalized : 'UNKNOWN';
}
function nullableAmount(value) {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let raw = String(value).trim().replace(/,/g, '').replace(/원$/, '').trim();
  if (/^\(\d+(?:\.\d+)?\)$/.test(raw)) raw = `-${raw.slice(1, -1)}`;
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
function ledgerProvenance({ family, source, sourceRecordId = null, periodStart = null, periodEnd = null, amounts = [], evidence = null }) {
  const delivery_family = ledgerDeliveryFamily(family);
  return {
    delivery_family, ingestion_source: source, source_record_id: sourceRecordId,
    period_start: periodStart, period_end: periodEnd,
    reconciliation_status: amounts.some(amount => amount == null) ? 'MISSING_AMOUNT' : 'UNVERIFIED',
    provenance: { identity_version: 2, family_evidence: delivery_family === 'UNKNOWN' ? 'UNRESOLVED' : evidence || 'EXPLICIT_FILE_FIELD', coverage: 'UNVERIFIED' }
  };
}
function stableLedgerKey(kind, family, source, identity) {
  return crypto.createHash('sha256').update(JSON.stringify([2, kind, ledgerDeliveryFamily(family), source, ...identity])).digest('hex');
}
function assertUniqueLedgerRows(rows, key) {
  const seen = new Set();
  for (const row of rows) {
    if (!row[key] || row.reconciliation_status === 'AMBIGUOUS_IDENTITY' || seen.has(row[key])) {
      const error = new Error('AMBIGUOUS_IDENTITY: 정산 원본 식별자가 없거나 중복됩니다. source_record_id를 확인해주세요.');
      error.code = 'AMBIGUOUS_IDENTITY';
      throw error;
    }
    seen.add(row[key]);
  }
  return rows;
}
async function assertNoLegacyOverlap(db, table, rows) {
  if (!rows.length) return;
  // Legacy UNKNOWN provenance cannot prove equivalence or safe supersession.
  // Block overlapping periods; cost reports have several non-equivalent date
  // bases, so any unreconciled legacy cost row blocks cost ingestion.
  let query = db.from(table).select('id').eq('ingestion_source', 'LEGACY');
  const field = table === 'coupang_settlements' ? 'recognition_date' : table === 'coupang_settlement_summaries' ? 'recognition_month' : null;
  if (field) {
    const dates = rows.map(row => row[field]).filter(Boolean).sort();
    if (dates.length === rows.length) query = query.gte(field, dates[0]).lte(field, dates.at(-1));
  }
  const result = await query.limit(1);
  if (result.error) throw result.error;
  if (result.data?.length) {
    const error = new Error(`LEGACY_RECONCILIATION_REQUIRED: ${table}에 기존 미분류 원장이 있습니다. 원본 대조 및 명시적 이관 전에는 해당 자료를 다시 저장할 수 없습니다.`);
    error.code = 'LEGACY_RECONCILIATION_REQUIRED';
    throw error;
  }
}
async function saveApiProjection(db, table, rows) {
  const contracts = {
    coupang_settlements: ['settlement_key', 'COUPANG_REVENUE_API'],
    coupang_settlement_summaries: ['summary_key', 'COUPANG_PAYOUT_API']
  };
  const contract = contracts[table];
  if (!contract || rows.some(row => row.delivery_family !== 'UNKNOWN' || row.ingestion_source !== contract[1] || row.provenance?.identity_version !== 1 || row.provenance?.identity_evidence !== 'UNVERIFIED_API_PROJECTION')) throw new Error('INVALID_API_PROJECTION: 조회용 API 자료만 기존 키로 갱신할 수 있습니다.');
  assertUniqueLedgerRows(rows, contract[0]);
  for (let index = 0; index < rows.length; index += 300) {
    const result = await db.from(table).upsert(rows.slice(index, index + 300), { onConflict: contract[0] });
    if (result.error) throw result.error;
  }
  return rows.length;
}
module.exports = { ledgerDeliveryFamily, nullableAmount, ledgerProvenance, stableLedgerKey, assertUniqueLedgerRows, assertNoLegacyOverlap, saveApiProjection };
