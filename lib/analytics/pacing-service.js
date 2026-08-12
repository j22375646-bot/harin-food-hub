'use strict';

const supabaseModule = require('../cafe24/supabase.js');
const { monthBounds, calculatePacing, snapshotRow } = require('./pacing.js');

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
  const timestampStart = `${bounds.start}T00:00:00+09:00`;
  const timestampNext = `${bounds.next}T00:00:00+09:00`;
  const [cafe, naver, rg, seller, coupangAds] = await Promise.all([
    db.from('cafe24_orders').select('order_id,paid_amount,order_price,raw_data').gte('order_date', timestampStart).lt('order_date', timestampNext),
    db.from('naver_stats_daily').select('cost,conversion_revenue').eq('entity_type', 'CAMPAIGN').gte('date', bounds.start).lte('date', asOf),
    db.from('coupang_rg_orders').select('order_id,total_amount').gte('paid_at', timestampStart).lt('paid_at', timestampNext),
    db.from('coupang_orders').select('order_id,gross_amount').gte('ordered_at', timestampStart).lt('ordered_at', timestampNext),
    db.from('coupang_ad_daily_summary').select('ad_spend').gte('date', bounds.start).lte('date', asOf)
  ]);
  const error = [cafe, naver, rg, seller, coupangAds].find(result => result.error)?.error;
  if (error) throw error;
  const rgIds = new Set((rg.data || []).map(row => String(row.order_id)));
  const cafeRevenue = (cafe.data || []).reduce((total, row) => total + cafe24PaidAmount(row), 0);
  const naverRevenue = sum(naver.data || [], 'conversion_revenue');
  const naverSpend = sum(naver.data || [], 'cost');
  const coupangRevenue = sum(rg.data || [], 'total_amount') + sum((seller.data || []).filter(row => !rgIds.has(String(row.order_id))), 'gross_amount');
  const coupangSpend = sum(coupangAds.data || [], 'ad_spend');
  return {
    ALL: { revenueActual: cafeRevenue + coupangRevenue, adSpendActual: naverSpend + coupangSpend },
    NAVER: { revenueActual: naverRevenue, adSpendActual: naverSpend },
    CAFE24: { revenueActual: cafeRevenue, adSpendActual: 0 },
    COUPANG: { revenueActual: coupangRevenue, adSpendActual: coupangSpend }
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
