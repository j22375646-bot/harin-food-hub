'use strict';

const STATUSES = new Set(['READY', 'PARTIAL', 'BLOCKED', 'NO_DATA', 'PARSE_ERROR', 'STALE']);
const FORMULA_VERSION = 'metric-snapshot-v1';

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function createMetricSnapshot({
  id,
  label,
  value,
  unit,
  status = 'READY',
  sources = [],
  asOf = null,
  periodStart = null,
  periodEnd = null,
  formula,
  formulaVersion = FORMULA_VERSION,
  sampleSize = null,
  reasons = []
} = {}) {
  if (!id || !label || !unit || !formula) throw new Error('MetricSnapshot requires id, label, unit, and formula.');
  if (!STATUSES.has(status)) throw new Error(`Unsupported MetricSnapshot status: ${status}`);
  const numericValue = finiteOrNull(value);
  const normalizedStatus = status === 'READY' && numericValue === null ? 'NO_DATA' : status;
  return {
    id,
    label,
    value: normalizedStatus === 'BLOCKED' || normalizedStatus === 'PARSE_ERROR' ? null : numericValue,
    unit,
    status: normalizedStatus,
    source: sources.map(source => ({
      platform: source.platform,
      dataset: source.dataset,
      mode: source.mode || 'API'
    })),
    as_of: isoOrNull(asOf),
    period: { start: periodStart || null, end: periodEnd || null },
    formula: { expression: formula, version: formulaVersion },
    quality: {
      sample_size: finiteOrNull(sampleSize),
      reasons: reasons.filter(Boolean)
    }
  };
}

module.exports = { STATUSES, FORMULA_VERSION, createMetricSnapshot };
