'use strict';

const crypto = require('node:crypto');

const number = value => Number(value || 0);
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * factor) / factor;
};
const dateOnly = value => String(value || '').slice(0, 10) || null;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const signedSettlementSales = row => row.sale_type === 'REFUND' ? -Math.abs(number(row.sale_amount)) : Math.abs(number(row.sale_amount));

function dateSpan(start, end) {
  if (!validDate(start) || !validDate(end)) return 0;
  return Math.max(1, Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1);
}

function ageDays(end, now) {
  if (!validDate(end)) return Infinity;
  return Math.max(0, Math.floor((new Date(now) - new Date(`${end}T23:59:59Z`)) / 86400000));
}

function confidence({ orders, amount = 0, periodStart, periodEnd, now, requireAmount = false }) {
  const sufficient = orders >= 20 && dateSpan(periodStart, periodEnd) >= 7 && ageDays(periodEnd, now) <= 120 && (!requireAmount || amount >= 100000);
  if (!sufficient) return 'LOW';
  if (orders >= 50 && dateSpan(periodStart, periodEnd) >= 14 && ageDays(periodEnd, now) <= 45) return 'HIGH';
  return 'MEDIUM';
}

function period(rows, fields) {
  const dates = rows.flatMap(row => fields.map(field => dateOnly(row[field])).filter(validDate)).sort();
  return { start: dates[0] || null, end: dates.at(-1) || null };
}

function commissionFromSettlements(rows, now) {
  const usable = rows.filter(row => row.order_id && row.recognition_date);
  const dates = period(usable, ['recognition_date']);
  const orders = new Set(usable.map(row => String(row.order_id))).size;
  const netSales = usable.reduce((sum, row) => sum + signedSettlementSales(row), 0);
  const totalFee = usable.reduce((sum, row) => sum + number(row.service_fee) + number(row.service_fee_vat), 0);
  const actualRate = netSales > 0 ? Math.abs(totalFee) / netSales : null;
  const level = actualRate != null && actualRate <= 0.4
    ? confidence({ orders, amount: netSales, periodStart: dates.start, periodEnd: dates.end, now, requireAmount: true })
    : 'LOW';
  return { source: 'COUPANG_SETTLEMENT_API', orders, rows: usable.length, netSales: round(netSales), totalFee: round(totalFee), actualRate: actualRate == null ? null : round(actualRate, 6), confidence: level, ...dates };
}

function commissionFromCostTransactions(rows, now) {
  const usable = rows.filter(row => row.source_type === 'SALES_COMMISSION' && row.order_id);
  const dates = period(usable, ['recognition_date', 'event_date']);
  const orders = new Set(usable.map(row => String(row.order_id))).size;
  const netSales = usable.reduce((sum, row) => sum + number(row.gross_sales), 0);
  const totalFee = usable.reduce((sum, row) => sum + number(row.cost_amount) + number(row.cost_vat) - number(row.credit_amount), 0);
  const actualRate = netSales > 0 ? Math.abs(totalFee) / netSales : null;
  const level = actualRate != null && actualRate <= 0.4
    ? confidence({ orders, amount: netSales, periodStart: dates.start, periodEnd: dates.end, now, requireAmount: true })
    : 'LOW';
  return { source: 'COUPANG_WING_COMMISSION', orders, rows: usable.length, netSales: round(netSales), totalFee: round(totalFee), actualRate: actualRate == null ? null : round(actualRate, 6), confidence: level, ...dates };
}

function logisticsFromCostTransactions(rows, now) {
  const usable = rows.filter(row => ['SHIPPING', 'WAREHOUSING'].includes(row.source_type) && row.order_id);
  const dates = period(usable, ['recognition_date', 'event_date']);
  const orders = new Set(usable.map(row => String(row.order_id))).size;
  const totalCost = usable.reduce((sum, row) => sum + number(row.cost_amount) + number(row.cost_vat) - number(row.credit_amount), 0);
  const actualPerOrder = orders > 0 ? Math.max(0, totalCost) / orders : null;
  const level = actualPerOrder != null && actualPerOrder <= 20000
    ? confidence({ orders, periodStart: dates.start, periodEnd: dates.end, now })
    : 'LOW';
  return { source: 'COUPANG_WING_LOGISTICS', orders, rows: usable.length, totalCost: round(totalCost), actualPerOrder: actualPerOrder == null ? null : round(actualPerOrder), confidence: level, ...dates };
}

function chooseCommission(settlements, transactions, now) {
  const api = commissionFromSettlements(settlements, now);
  const wing = commissionFromCostTransactions(transactions, now);
  if (api.confidence !== 'LOW') return { selected: api, alternatives: [wing] };
  if (wing.confidence !== 'LOW') return { selected: wing, alternatives: [api] };
  return { selected: api.rows >= wing.rows ? api : wing, alternatives: [api.rows >= wing.rows ? wing : api] };
}

function calculateCoupangCostCalibration({ settlements = [], costTransactions = [], currentSetting = {}, now = new Date() } = {}) {
  const commissionChoice = chooseCommission(settlements, costTransactions, now);
  const commission = commissionChoice.selected;
  const logistics = logisticsFromCostTransactions(costTransactions, now);
  const commissionReady = commission.confidence !== 'LOW' && commission.actualRate != null;
  const logisticsReady = logistics.confidence !== 'LOW' && logistics.actualPerOrder != null;
  const assumed = {
    platform: 'COUPANG',
    commission_rate: number(currentSetting.commission_rate),
    payment_fee_rate: number(currentSetting.payment_fee_rate),
    default_shipping_cost: number(currentSetting.default_shipping_cost)
  };
  const effective = {
    ...assumed,
    commission_rate: commissionReady ? commission.actualRate : assumed.commission_rate,
    payment_fee_rate: commissionReady ? 0 : assumed.payment_fee_rate,
    default_shipping_cost: logisticsReady ? logistics.actualPerOrder : assumed.default_shipping_cost,
    source: commissionReady || logisticsReady ? 'ACTUAL_CALIBRATION' : 'MANUAL_SETTING'
  };
  const levels = [commissionReady ? commission.confidence : 'LOW', logisticsReady ? logistics.confidence : 'LOW'];
  const combinedConfidence = levels.includes('LOW') ? (commissionReady || logisticsReady ? 'MEDIUM' : 'LOW') : levels.includes('MEDIUM') ? 'MEDIUM' : 'HIGH';
  const allDates = [commission.start, commission.end, logistics.start, logistics.end].filter(validDate).sort();
  const snapshotPayload = {
    commission_source: commission.source,
    commission_period: [commission.start, commission.end],
    commission_orders: commission.orders,
    actual_commission_rate: commission.actualRate,
    logistics_period: [logistics.start, logistics.end],
    logistics_orders: logistics.orders,
    actual_shipping_cost: logistics.actualPerOrder
  };
  return {
    platform: 'COUPANG',
    status: commissionReady || logisticsReady ? 'ACTIVE' : 'INSUFFICIENT',
    confidence: combinedConfidence,
    period_start: allDates[0] || null,
    period_end: allDates.at(-1) || null,
    auto_applied: commissionReady || logisticsReady,
    auto_applied_fields: [commissionReady ? 'COMMISSION_RATE' : null, logisticsReady ? 'SHIPPING_COST' : null].filter(Boolean),
    assumed_setting: assumed,
    effective_setting: effective,
    commission: { ...commission, alternatives: commissionChoice.alternatives },
    logistics,
    snapshot_key: crypto.createHash('sha256').update(JSON.stringify(snapshotPayload)).digest('hex'),
    warnings: [
      !commissionReady ? '확정 수수료 표본이 20개 주문·7일·10만원 기준에 미달해 수동 수수료를 유지합니다.' : null,
      !logisticsReady ? '배송·입출고 표본이 20개 주문·7일 기준에 미달해 수동 배송비를 유지합니다.' : null
    ].filter(Boolean)
  };
}

function withEffectiveChannelSettings(settings = [], calibration = {}) {
  const output = settings.map(item => ({ ...item }));
  const index = output.findIndex(item => item.platform === 'COUPANG');
  const effective = calibration.effective_setting || { platform: 'COUPANG' };
  if (index >= 0) output[index] = { ...output[index], ...effective };
  else output.push(effective);
  return output;
}

async function loadCoupangCalibrationInputs(db) {
  const [settlements, costs, setting] = await Promise.all([
    db.from('coupang_settlements').select('order_id,recognition_date,sale_type,sale_amount,service_fee,service_fee_vat').order('recognition_date', { ascending: false }).limit(5000),
    db.from('coupang_cost_transactions').select('source_type,event_date,recognition_date,order_id,gross_sales,cost_amount,cost_vat,credit_amount').order('event_date', { ascending: false }).limit(10000),
    db.from('channel_cost_settings').select('platform,commission_rate,payment_fee_rate,default_shipping_cost').eq('platform', 'COUPANG').maybeSingle()
  ]);
  const failed = [settlements, costs, setting].find(result => result.error)?.error;
  if (failed) throw failed;
  return { settlements: settlements.data || [], costTransactions: costs.data || [], currentSetting: setting.data || {} };
}

async function refreshCoupangCostCalibration({ db, triggerType = 'DASHBOARD', now = new Date() }) {
  const inputs = await loadCoupangCalibrationInputs(db);
  const calibration = calculateCoupangCostCalibration({ ...inputs, now });
  const row = {
    snapshot_key: calibration.snapshot_key,
    platform: 'COUPANG',
    trigger_type: triggerType,
    status: calibration.status,
    confidence: calibration.confidence,
    period_start: calibration.period_start,
    period_end: calibration.period_end,
    commission_source: calibration.commission.source,
    commission_order_count: calibration.commission.orders,
    net_sales: calibration.commission.netSales,
    actual_commission_rate: calibration.commission.actualRate,
    logistics_source: calibration.logistics.source,
    logistics_order_count: calibration.logistics.orders,
    actual_shipping_cost: calibration.logistics.actualPerOrder,
    assumed_commission_rate: calibration.assumed_setting.commission_rate,
    assumed_payment_fee_rate: calibration.assumed_setting.payment_fee_rate,
    assumed_shipping_cost: calibration.assumed_setting.default_shipping_cost,
    calculation: calibration
  };
  const saved = await db.from('channel_cost_calibrations').upsert(row, { onConflict: 'snapshot_key' }).select('id,created_at,applied_at').single();
  if (saved.error) throw saved.error;
  if (calibration.status === 'ACTIVE') {
    const superseded = await db.from('channel_cost_calibrations').update({ status: 'SUPERSEDED' }).eq('platform', 'COUPANG').eq('status', 'ACTIVE').neq('id', saved.data.id);
    if (superseded.error) throw superseded.error;
  }
  return { ...calibration, id: saved.data.id, created_at: saved.data.created_at, applied_at: saved.data.applied_at };
}

async function applyCoupangCostCalibration({ db, now = new Date() }) {
  const calibration = await refreshCoupangCostCalibration({ db, triggerType: 'MANUAL_APPLY', now });
  if (!calibration.auto_applied) throw new Error('실제 비용 표본이 부족해 기본 설정에 반영할 수 없습니다.');
  const effective = calibration.effective_setting;
  const setting = await db.from('channel_cost_settings').upsert({
    platform: 'COUPANG',
    commission_rate: effective.commission_rate,
    payment_fee_rate: effective.payment_fee_rate,
    default_shipping_cost: effective.default_shipping_cost,
    notes: `실정산 자동 보정 · ${calibration.period_start || '-'}~${calibration.period_end || '-'} · ${calibration.confidence}`
  }, { onConflict: 'platform' }).select().single();
  if (setting.error) throw setting.error;
  const appliedAt = new Date(now).toISOString();
  const marked = await db.from('channel_cost_calibrations').update({ applied_at: appliedAt }).eq('id', calibration.id);
  if (marked.error) throw marked.error;
  return { calibration: { ...calibration, applied_at: appliedAt }, setting: setting.data };
}

module.exports = {
  calculateCoupangCostCalibration,
  withEffectiveChannelSettings,
  loadCoupangCalibrationInputs,
  refreshCoupangCostCalibration,
  applyCoupangCostCalibration
};
