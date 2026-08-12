'use strict';

function seriesKey(report = {}) {
  return [report.platform, report.report_type, report.period_start, report.period_end].map(value => String(value || '')).join('|');
}

function groupVersions(reports = []) {
  const groups = new Map();
  for (const report of reports) {
    const key = seriesKey(report);
    const current = groups.get(key) || [];
    current.push(report);
    groups.set(key, current);
  }
  return [...groups.entries()].map(([key, versions]) => {
    const sorted = [...versions].sort((a,b) => Number(b.version || 1) - Number(a.version || 1) || new Date(b.created_at) - new Date(a.created_at));
    return { key, latest: sorted.find(item => item.is_latest) || sorted[0], versions: sorted, count: sorted.length };
  }).sort((a,b) => new Date(b.latest?.created_at || 0) - new Date(a.latest?.created_at || 0));
}

function metricSnapshot(report = {}) {
  const summary = report.summary_json || {};
  return {
    score: summary.score ?? null,
    cafe24Revenue: summary.cafe24?.revenue ?? null,
    naverSpend: summary.naver?.ad_spend ?? null,
    naverRoas: summary.naver?.roas ?? null,
    coupangSales: summary.coupang?.gross_sales ?? null,
    coupangAdSpend: summary.coupang?.ad_spend ?? null,
    coupangAdRoas: summary.coupang?.ad_roas ?? null
  };
}

function compareVersions(current, previous) {
  const now = metricSnapshot(current), before = metricSnapshot(previous), changes = {};
  for (const key of Object.keys(now)) {
    const currentValue = now[key], previousValue = before[key];
    changes[key] = { current:currentValue, previous:previousValue, delta:currentValue == null || previousValue == null ? null : Number(currentValue) - Number(previousValue) };
  }
  return changes;
}

module.exports = { seriesKey, groupVersions, metricSnapshot, compareVersions };
