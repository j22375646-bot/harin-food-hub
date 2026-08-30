'use strict';

const supabaseModule = require('../cafe24/supabase.js');
const { monthBounds, calculatePacing, snapshotRow } = require('./pacing.js');
const monthlyRevenueModule = require('./monthly-revenue.js');

const PLATFORMS = ['ALL', 'NAVER', 'CAFE24', 'COUPANG'];
const number = value => Number(value || 0);
const sum = (rows, key) => rows.reduce((total, row) => total + number(row[key]), 0);
function cafe24PaidAmount(row = {}) {
  return number(row.paid_amount ?? row.order_price ?? row.raw_data?.payment_amount ?? row.raw_data?.actual_order_amount?.payment_amount);
}

function kstToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

async function monthlyActuals(db, month, asOf) {
  const bounds = monthBounds(month);
  const [revenue, naverAds, coupangAds] = await Promise.all([
    monthlyRevenueModule.fetchMonthlyRevenue(db, month),
    db.from('naver_stats_daily').select('cost').eq('entity_type', 'CAMPAIGN').gte('date', bounds.start).lte('date', asOf),
    db.from('coupang_ad_daily_summary').select('ad_spend').gte('date', bounds.start).lte('date', asOf)
  ]);
  const error = [naverAds, coupangAds].find(result => result.error)?.error;
  if (error) throw error;
  if (revenue.status !== 'READY' || revenue.totals.ALL == null) {
    const message=(revenue.issues || []).map(issue=>issue.message).filter(Boolean).join(' · ');
    throw new Error(message || '월 매출 자료가 일부 누락되어 목표 진행률을 계산하지 않았습니다.');
  }
  const naverSpend = sum(naverAds.data || [], 'cost');
  const coupangSpend = sum(coupangAds.data || [], 'ad_spend');
  return {
    ALL: { revenueActual: revenue.totals.ALL, adSpendActual: naverSpend + coupangSpend },
    NAVER: { revenueActual: revenue.totals.NAVER, adSpendActual: naverSpend },
    CAFE24: { revenueActual: revenue.totals.CAFE24, adSpendActual: 0 },
    COUPANG: { revenueActual: revenue.totals.COUPANG, adSpendActual: coupangSpend }
  };
}

async function buildPacingDashboard({ db = supabaseModule.getSupabase(), month, asOf = kstToday(), persistSnapshots = false } = {}) {
  const targetMonth = month || asOf.slice(0, 7);
  const bounds = monthBounds(targetMonth);
  const [targetsResult, actuals] = await Promise.all([
    db.from('business_targets').select('id,target_month,platform,revenue_target,ad_budget,target_roas,notes,updated_at').eq('target_month', bounds.start),
    monthlyActuals(db, targetMonth, asOf)
  ]);
  if (targetsResult.error) throw targetsResult.error;
  const targets = new Map((targetsResult.data || []).map(target => [target.platform, target]));
  const items = PLATFORMS.map(platform => {
    const target = targets.get(platform);
    return calculatePacing({
      month: targetMonth, asOf, platform, ...actuals[platform],
      revenueTarget: target?.revenue_target,
      adBudget: target?.ad_budget,
      targetRoas: target?.target_roas
    });
  });
  let snapshots = 0;
  if (persistSnapshots) {
    const rows = items.filter(item => targets.has(item.platform)).map(item => snapshotRow(targets.get(item.platform), item));
    if (rows.length) {
      const result = await db.from('budget_snapshots').upsert(rows, { onConflict:'target_id,snapshot_date' });
      if (result.error) throw result.error;
      snapshots = rows.length;
    }
  }
  return { month: targetMonth, asOf, items, targets: targetsResult.data || [], snapshots };
}

async function saveTarget(input, db = supabaseModule.getSupabase()) {
  const platform = String(input.platform || '').toUpperCase();
  const month = String(input.month || '');
  if (!PLATFORMS.includes(platform)) throw new Error('지원하지 않는 플랫폼입니다.');
  const bounds = monthBounds(month);
  const value = key => {
    const parsed = Number(input[key]);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error('목표와 예산은 0 이상의 숫자로 입력해주세요.');
    return parsed;
  };
  const values = {
    target_month: bounds.start, platform,
    revenue_target: value('revenueTarget'),
    ad_budget: value('adBudget'),
    target_roas: value('targetRoas'),
    notes: String(input.notes || '').trim().slice(0, 500) || null,
    updated_at: new Date().toISOString()
  };
  const result = await db.from('business_targets').upsert(values, { onConflict:'target_month,platform' }).select().single();
  if (result.error) throw result.error;
  const dashboard = await buildPacingDashboard({ db, month, asOf:kstToday(), persistSnapshots:true });
  return { target: result.data, pacing: dashboard.items.find(item => item.platform === platform), snapshots:dashboard.snapshots };
}

module.exports = { PLATFORMS, kstToday, cafe24PaidAmount, monthlyActuals, buildPacingDashboard, saveTarget };
