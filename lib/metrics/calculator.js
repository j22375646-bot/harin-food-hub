'use strict';

const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nonNegative = value => Math.max(0, number(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function calculateBidGuide({
  averageOrderValue,
  conversionRatePercent,
  targetRoasPercent = 250,
  currentCpc,
  minAdjustmentRate = -30,
  maxAdjustmentRate = 20
} = {}) {
  const aov = nonNegative(averageOrderValue);
  const cvrPercent = nonNegative(conversionRatePercent);
  const targetRoas = nonNegative(targetRoasPercent);
  const cpc = nonNegative(currentCpc);
  const targetCpc = targetRoas > 0 ? aov * (cvrPercent / 100) / (targetRoas / 100) : 0;
  const rawAdjustmentRate = cpc > 0 && targetCpc > 0 ? (targetCpc / cpc - 1) * 100 : null;
  const recommendedAdjustmentRate = rawAdjustmentRate == null
    ? null
    : clamp(rawAdjustmentRate, number(minAdjustmentRate), number(maxAdjustmentRate));
  const action = recommendedAdjustmentRate == null
    ? 'CALCULATE_REQUIRED'
    : recommendedAdjustmentRate < -5
      ? 'LOWER_BID'
      : recommendedAdjustmentRate > 5
        ? 'RAISE_BID'
        : 'KEEP_BID';

  return {
    averageOrderValue: aov,
    conversionRatePercent: cvrPercent,
    targetRoasPercent: targetRoas,
    currentCpc: cpc,
    targetCpc,
    rawAdjustmentRate,
    recommendedAdjustmentRate,
    action,
    limits: { min: number(minAdjustmentRate), max: number(maxAdjustmentRate) }
  };
}

function calculatePerformance({
  impressions,
  clicks,
  cost,
  conversions,
  revenue,
  targetRoasPercent = 250
} = {}) {
  const safeImpressions = nonNegative(impressions);
  const safeClicks = nonNegative(clicks);
  const safeCost = nonNegative(cost);
  const safeConversions = nonNegative(conversions);
  const safeRevenue = nonNegative(revenue);
  const cpc = safeClicks ? safeCost / safeClicks : 0;
  const cvrPercent = safeClicks ? safeConversions / safeClicks * 100 : 0;
  const cpa = safeConversions ? safeCost / safeConversions : 0;
  const aov = safeConversions ? safeRevenue / safeConversions : 0;
  const ctrPercent = safeImpressions ? safeClicks / safeImpressions * 100 : 0;
  const roasPercent = safeCost ? safeRevenue / safeCost * 100 : 0;
  const calculatedGuide = calculateBidGuide({
    averageOrderValue: aov,
    conversionRatePercent: cvrPercent,
    targetRoasPercent,
    currentCpc: cpc
  });
  const sufficientSample = safeClicks >= 30 && safeConversions >= 3;
  const hasPerformanceData = safeClicks > 0 && safeCost > 0;
  const status = !hasPerformanceData ? 'NO_DATA' : sufficientSample ? 'READY' : 'INSUFFICIENT_SAMPLE';
  const guide = status === 'READY'
    ? calculatedGuide
    : {
        ...calculatedGuide,
        recommendedAdjustmentRate: 0,
        action: 'HOLD_FOR_DATA'
      };

  return {
    impressions: safeImpressions,
    clicks: safeClicks,
    cost: safeCost,
    conversions: safeConversions,
    revenue: safeRevenue,
    ctrPercent,
    cpc,
    cvrPercent,
    cpa,
    averageOrderValue: aov,
    roasPercent,
    targetRoasPercent: nonNegative(targetRoasPercent),
    targetCpc: guide.targetCpc,
    rawAdjustmentRate: guide.rawAdjustmentRate,
    recommendedAdjustmentRate: guide.recommendedAdjustmentRate,
    bidAction: guide.action,
    status,
    sample: { sufficient: sufficientSample, minimumClicks: 30, minimumConversions: 3 }
  };
}

module.exports = { calculateBidGuide, calculatePerformance };
