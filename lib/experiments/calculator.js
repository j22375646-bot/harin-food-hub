'use strict';

const { calculatePerformance } = require('../metrics/calculator.js');
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

function proportionConfidence(successA, totalA, successB, totalB) {
  if (!totalA || !totalB) return 0;
  const pA = successA / totalA;
  const pB = successB / totalB;
  const pooled = (successA + successB) / (totalA + totalB);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
  if (!standardError) return pA === pB ? 0 : 99.99;
  const z = Math.abs(pA - pB) / standardError;
  return clamp(erf(z / Math.sqrt(2)) * 100, 0, 99.99);
}

function metrics(row = {}) {
  const performance = calculatePerformance({
    impressions: row.impressions,
    clicks: row.clicks,
    cost: row.cost,
    conversions: number(row.conversions) || number(row.orders),
    revenue: row.revenue
  });
  return {
    CTR: performance.ctrPercent,
    CPC: performance.cpc,
    CVR: performance.cvrPercent,
    CPA: performance.cpa,
    ROAS: performance.roasPercent,
    REVENUE: number(row.revenue),
    ORDERS: number(row.orders) || number(row.conversions),
    AOV: (number(row.orders) || number(row.conversions)) ? number(row.revenue) / (number(row.orders) || number(row.conversions)) : 0
  };
}

function sampleSize(metric, row = {}) {
  if (metric === 'CTR') return number(row.impressions);
  if (['CVR', 'CPC'].includes(metric)) return number(row.clicks);
  return Math.max(number(row.orders), number(row.conversions), number(row.clicks));
}

function evaluate(test, variants) {
  const enriched = variants.map(item => ({ ...item, calculated_metrics: metrics(item) }));
  const control = enriched.find(item => item.is_control) || enriched[0];
  const challengers = enriched.filter(item => item.id !== control?.id);
  if (!control || !challengers.length) return { status: 'INCONCLUSIVE', confidence: 0, winner: null, variants: enriched, summary: '대조군과 실험군이 모두 필요합니다.' };
  const direction = ['CPC', 'CPA'].includes(test.metric) ? -1 : 1;
  const score = item => number(item.calculated_metrics[test.metric]) * direction;
  const best = [...challengers].sort((a, b) => score(b) - score(a))[0];
  const controlValue = number(control.calculated_metrics[test.metric]);
  const bestValue = number(best.calculated_metrics[test.metric]);
  const controlScore = score(control);
  const bestScore = score(best);
  const liftPercent = controlScore === 0 ? (bestScore > 0 ? 100 : 0) : (bestScore - controlScore) / Math.abs(controlScore) * 100;
  const controlSample = sampleSize(test.metric, control);
  const bestSample = sampleSize(test.metric, best);
  const minimum = number(test.minimum_sample_size) || 30;
  const sufficient = controlSample >= minimum && bestSample >= minimum;
  let confidence;
  let confidenceMethod;
  if (test.metric === 'CTR') {
    confidence = proportionConfidence(number(control.clicks), number(control.impressions), number(best.clicks), number(best.impressions));
    confidenceMethod = 'TWO_PROPORTION_Z';
  } else if (test.metric === 'CVR') {
    confidence = proportionConfidence(number(control.conversions) || number(control.orders), number(control.clicks), number(best.conversions) || number(best.orders), number(best.clicks));
    confidenceMethod = 'TWO_PROPORTION_Z';
  } else {
    confidence = clamp(Math.min(controlSample, bestSample) / minimum * 90, 0, 90);
    confidenceMethod = 'SAMPLE_READINESS';
  }
  const requiredConfidence = Math.min(number(test.confidence_level) || 90, confidenceMethod === 'SAMPLE_READINESS' ? 90 : 99.99);
  const detectable = liftPercent >= number(test.minimum_detectable_lift);
  const winner = sufficient && detectable && bestScore > controlScore && confidence >= requiredConfidence ? best : null;
  const status = !sufficient ? 'INSUFFICIENT_SAMPLE' : winner ? 'WINNER' : 'INCONCLUSIVE';
  const summary = !sufficient
    ? `표본 부족 · 대조군 ${Math.round(controlSample)} / 실험군 ${Math.round(bestSample)} · 각 ${minimum} 이상 필요`
    : winner
      ? `${winner.name} 승자 · ${test.metric} ${bestValue.toFixed(2)} · 대조군 대비 ${liftPercent.toFixed(1)}% 개선 · 신뢰도 ${confidence.toFixed(1)}%`
      : `판정 보류 · 개선폭 ${liftPercent.toFixed(1)}% · 신뢰도 ${confidence.toFixed(1)}%`;
  return { status, confidence, confidenceMethod, liftPercent, winner, control, best, variants: enriched, summary, controlValue, bestValue, samples: { control: controlSample, challenger: bestSample, minimum } };
}

module.exports = { metrics, sampleSize, proportionConfidence, evaluate };
