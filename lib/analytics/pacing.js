'use strict';

const nonNegative = value => Math.max(0, Number(value || 0));
const round = value => Math.round(Number(value || 0));
const percent = (value, base) => base > 0 ? value / base * 100 : null;

function monthBounds(month) {
  if (!/^20\d{2}-\d{2}$/.test(String(month || ''))) throw new Error('month must be YYYY-MM');
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month,
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth).padStart(2, '0')}`,
    next: `${year + (monthNumber === 12 ? 1 : 0)}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, '0')}-01`,
    daysInMonth
  };
}

function calculatePacing(input = {}) {
  const bounds = monthBounds(input.month);
  const asOf = String(input.asOf || bounds.end).slice(0, 10);
  const asOfMonth = asOf.slice(0, 7);
  const elapsedDays = asOfMonth === bounds.month
    ? Math.min(bounds.daysInMonth, Math.max(1, Number(asOf.slice(8, 10)) || 1))
    : asOfMonth < bounds.month ? 1 : bounds.daysInMonth;
  const remainingDays = Math.max(0, bounds.daysInMonth - elapsedDays);
  const expectedProgressRate = elapsedDays / bounds.daysInMonth * 100;
  const revenueActual = nonNegative(input.revenueActual);
  const adSpendActual = nonNegative(input.adSpendActual);
  const revenueTarget = nonNegative(input.revenueTarget);
  const adBudget = nonNegative(input.adBudget);
  const targetRoas = nonNegative(input.targetRoas || 250);
  const revenueForecast = revenueActual / elapsedDays * bounds.daysInMonth;
  const adSpendForecast = adSpendActual / elapsedDays * bounds.daysInMonth;
  const revenueProgressRate = percent(revenueActual, revenueTarget);
  const budgetUsageRate = percent(adSpendActual, adBudget);
  const revenuePacingRate = revenueProgressRate == null ? null : revenueProgressRate / expectedProgressRate * 100;
  const budgetPacingRate = budgetUsageRate == null ? null : budgetUsageRate / expectedProgressRate * 100;
  const actualRoas = adSpendActual > 0 ? revenueActual / adSpendActual * 100 : null;
  const requiredDailyRevenue = revenueTarget > 0 && remainingDays > 0 ? Math.max(0, revenueTarget - revenueActual) / remainingDays : 0;
  const recommendedDailySpend = adBudget > 0 && remainingDays > 0 ? Math.max(0, adBudget - adSpendActual) / remainingDays : 0;
  let status = 'TARGET_REQUIRED';
  if (revenueTarget > 0 || adBudget > 0) {
    const revenueRisk = revenueTarget > 0 ? revenueForecast / revenueTarget : 1;
    const budgetRisk = adBudget > 0 ? adSpendForecast / adBudget : 1;
    status = revenueRisk < 0.85 || budgetRisk > 1.15 ? 'AT_RISK'
      : revenueRisk < 0.95 || budgetRisk > 1.05 ? 'WATCH' : 'ON_TRACK';
  }
  return {
    platform: input.platform || 'ALL', ...bounds, asOf, elapsedDays, remainingDays,
    expectedProgressRate, revenueActual, revenueTarget, revenueForecast,
    revenueProgressRate, revenuePacingRate, requiredDailyRevenue,
    adSpendActual, adBudget, adSpendForecast, budgetUsageRate, budgetPacingRate,
    budgetRemaining: adBudget > 0 ? Math.max(0, adBudget - adSpendActual) : null,
    recommendedDailySpend, targetRoas, actualRoas, status,
    forecastRevenueGap: revenueTarget > 0 ? revenueForecast - revenueTarget : null,
    forecastBudgetGap: adBudget > 0 ? adBudget - adSpendForecast : null
  };
}

function snapshotRow(target, pacing) {
  return {
    target_id: target.id,
    snapshot_date: pacing.asOf,
    elapsed_days: pacing.elapsedDays,
    days_in_month: pacing.daysInMonth,
    revenue_actual: round(pacing.revenueActual),
    revenue_forecast: round(pacing.revenueForecast),
    ad_spend_actual: round(pacing.adSpendActual),
    ad_spend_forecast: round(pacing.adSpendForecast),
    revenue_progress_rate: pacing.revenueProgressRate,
    revenue_pacing_rate: pacing.revenuePacingRate,
    budget_usage_rate: pacing.budgetUsageRate,
    budget_pacing_rate: pacing.budgetPacingRate,
    budget_remaining: pacing.budgetRemaining,
    recommended_daily_spend: pacing.recommendedDailySpend,
    required_daily_revenue: pacing.requiredDailyRevenue,
    status: pacing.status,
    calculation_json: pacing
  };
}

module.exports = { monthBounds, calculatePacing, snapshotRow };
