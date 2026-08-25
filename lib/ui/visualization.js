'use strict';

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildChartModel({ labels = [], series = [] } = {}) {
  const normalizedSeries = (Array.isArray(series) ? series : []).map((item, index) => ({
    id: item.id || `series-${index + 1}`,
    label: item.label || `항목 ${index + 1}`,
    tone: item.tone || ['blue', 'amber', 'mint', 'pink'][index % 4],
    values: (Array.isArray(item.values) ? item.values : []).map(numericOrNull),
  }));
  const values = normalizedSeries.flatMap((item) => item.values).filter((value) => value !== null);
  return {
    labels: Array.isArray(labels) ? labels.map((label) => String(label ?? '')) : [],
    series: normalizedSeries,
    status: values.length ? 'READY' : 'UNCOLLECTED',
    max: values.length ? Math.max(1, ...values.map((value) => Math.abs(value))) : null,
    hasMissingEvidence: normalizedSeries.some((item) => item.values.some((value) => value === null)),
  };
}

function buildWaterfallModel(items = []) {
  const normalized = (Array.isArray(items) ? items : []).map((item, index) => {
    const value = numericOrNull(item.value);
    return {
      ...item,
      id: item.id || `waterfall-${index + 1}`,
      value,
      displayStatus: value === null ? 'CHECK_REQUIRED' : 'READY',
    };
  });
  const values = normalized.map((item) => item.value).filter((value) => value !== null);
  return {
    items: normalized,
    status: values.length ? 'READY' : 'UNCOLLECTED',
    max: values.length ? Math.max(1, ...values.map((value) => Math.abs(value))) : null,
    hasMissingEvidence: normalized.some((item) => item.value === null),
  };
}

function buildRecentDailyCounts(rows = [], { days = 7, now = new Date() } = {}) {
  const end = new Date(now);
  if (Number.isNaN(end.getTime())) return [];
  end.setHours(23, 59, 59, 999);
  const result = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = new Date(end);
    start.setDate(end.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    const finish = new Date(start);
    finish.setDate(start.getDate() + 1);
    const value = (Array.isArray(rows) ? rows : []).filter((row) => {
      const date = new Date(row?.occurredAt || row?.occurred_at || row?.created_at || '');
      return !Number.isNaN(date.getTime()) && date >= start && date < finish;
    }).length;
    result.push({
      label: new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(start),
      value,
    });
  }
  return result;
}

module.exports = { buildChartModel, buildRecentDailyCounts, buildWaterfallModel, numericOrNull };

