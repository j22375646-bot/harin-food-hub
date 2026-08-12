'use strict';

const supabaseModule = require('../cafe24/supabase.js');
const calculator = require('./calculator.js');

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const today = () => new Date().toISOString().slice(0, 10);
const sevenDaysAgo = () => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

function check(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data || [];
}

function normalizedVariant(row) {
  return {
    ...row,
    impressions: number(row.impressions), clicks: number(row.clicks), conversions: number(row.conversions),
    orders: number(row.orders), revenue: number(row.revenue), cost: number(row.cost)
  };
}

async function sourceMetrics(test, variant) {
  const db = supabaseModule.getSupabase();
  if (test.source_type === 'MANUAL' || !variant.entity_id) return normalizedVariant(variant);
  if (test.source_type === 'NAVER_ENTITY') {
    const rows = check(await db.from('naver_stats_daily').select('impressions,clicks,cost,conversions,conversion_revenue').eq('entity_id', variant.entity_id).gte('date', test.start_date).lte('date', test.end_date), '네이버 실험 데이터');
    return rows.reduce((sum, row) => ({ ...sum, impressions: sum.impressions + number(row.impressions), clicks: sum.clicks + number(row.clicks), cost: sum.cost + number(row.cost), conversions: sum.conversions + number(row.conversions), orders: sum.orders + number(row.conversions), revenue: sum.revenue + number(row.conversion_revenue) }), normalizedVariant({ ...variant, impressions: 0, clicks: 0, cost: 0, conversions: 0, orders: 0, revenue: 0 }));
  }
  const cafe24 = test.source_type === 'CAFE24_PRODUCT';
  const ordersTable = cafe24 ? 'cafe24_orders' : 'coupang_orders';
  const itemsTable = cafe24 ? 'cafe24_order_items' : 'coupang_order_items';
  const dateColumn = cafe24 ? 'order_date' : 'ordered_at';
  const idColumn = cafe24 ? 'order_id' : 'order_id';
  const productColumn = cafe24 ? 'external_product_no' : 'vendor_item_id';
  const orderRows = check(await db.from(ordersTable).select(idColumn).gte(dateColumn, `${test.start_date}T00:00:00+09:00`).lte(dateColumn, `${test.end_date}T23:59:59+09:00`), `${test.platform} 주문 데이터`);
  const orderIds = [...new Set(orderRows.map(row => String(row[idColumn] || '')).filter(Boolean))];
  let items = [];
  for (let index = 0; index < orderIds.length; index += 200) {
    items.push(...check(await db.from(itemsTable).select('order_id,quantity,paid_amount,unit_price').eq(productColumn, variant.entity_id).in('order_id', orderIds.slice(index, index + 200)), `${test.platform} 주문상품 데이터`));
  }
  const uniqueOrders = new Set(items.map(item => item.order_id)).size;
  return normalizedVariant({ ...variant, conversions: uniqueOrders, orders: uniqueOrders, revenue: items.reduce((sum, item) => sum + number(item.paid_amount || number(item.unit_price) * number(item.quantity)), 0) });
}

async function evaluateTest(id, { automatic = false } = {}) {
  const db = supabaseModule.getSupabase();
  const test = check(await db.from('ab_tests').select('*').eq('id', id).single(), '실험 조회');
  const variants = check(await db.from('ab_test_variants').select('*').eq('ab_test_id', id).order('is_control', { ascending: false }), '실험군 조회');
  const refreshed = [];
  for (const variant of variants) refreshed.push(await sourceMetrics(test, variant));
  const result = calculator.evaluate(test, refreshed);
  for (const variant of result.variants) {
    check(await db.from('ab_test_variants').update({
      impressions: variant.impressions, clicks: variant.clicks, conversions: variant.conversions,
      orders: variant.orders, revenue: variant.revenue, cost: variant.cost,
      calculated_metrics: variant.calculated_metrics,
      source_snapshot: { source_type: test.source_type, entity_id: variant.entity_id, collected_at: new Date().toISOString() }
    }).eq('id', variant.id), '실험군 계산 저장');
  }
  const shouldComplete = automatic && test.status === 'RUNNING' && test.end_date <= today() && result.status !== 'INSUFFICIENT_SAMPLE';
  check(await db.from('ab_tests').update({
    evaluation_status: result.status,
    winner_variant_id: result.winner?.id || null,
    result_summary: result.summary,
    last_evaluated_at: new Date().toISOString(),
    ...(shouldComplete ? { status: 'COMPLETED' } : {})
  }).eq('id', id), '실험 평가 저장');
  return { test_id: id, status: result.status, winner_variant_id: result.winner?.id || null, summary: result.summary, confidence: result.confidence, confidence_method: result.confidenceMethod, lift_percent: result.liftPercent, completed: shouldComplete };
}

async function evaluateRunningTests({ automatic = true } = {}) {
  const db = supabaseModule.getSupabase();
  const tests = check(await db.from('ab_tests').select('id').eq('status', 'RUNNING').lte('start_date', today()), '진행 실험 조회');
  const results = [];
  for (const test of tests) {
    try { results.push({ ok: true, ...(await evaluateTest(test.id, { automatic })) }); }
    catch (error) { results.push({ ok: false, test_id: test.id, error: error.message }); }
  }
  return { evaluated: results.length, success: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length, results, status: results.some(item => !item.ok) ? 'PARTIAL' : 'SUCCESS' };
}

async function createTest(input) {
  const db = supabaseModule.getSupabase();
  const variants = Array.isArray(input.variants) ? input.variants : [];
  if (!String(input.name || '').trim()) throw new Error('실험 이름을 입력하세요.');
  if (variants.length < 2) throw new Error('대조군과 실험군을 각각 입력하세요.');
  const test = check(await db.from('ab_tests').insert({
    name: String(input.name).trim(), platform: input.platform || 'ALL', hypothesis: String(input.hypothesis || '').trim(),
    target_type: input.target_type || 'OTHER', source_type: input.source_type || 'MANUAL', metric: input.metric || 'CVR',
    start_date: input.start_date, end_date: input.end_date, status: input.status || 'RUNNING',
    minimum_sample_size: Math.max(1, number(input.minimum_sample_size) || 30), confidence_level: number(input.confidence_level) || 90,
    minimum_detectable_lift: Math.max(0, number(input.minimum_detectable_lift) || 10)
  }).select('*').single(), '실험 생성');
  const rows = variants.map((variant, index) => ({
    ab_test_id: test.id, name: String(variant.name || `변형 ${index + 1}`).trim(), is_control: index === 0,
    entity_id: String(variant.entity_id || '').trim() || null, impressions: number(variant.impressions), clicks: number(variant.clicks),
    conversions: number(variant.conversions), orders: number(variant.orders), revenue: number(variant.revenue), cost: number(variant.cost)
  }));
  try { check(await db.from('ab_test_variants').insert(rows), '실험군 생성'); }
  catch (error) { await db.from('ab_tests').delete().eq('id', test.id); throw error; }
  return test;
}

async function updateVariantMetrics(testId, variants) {
  const db = supabaseModule.getSupabase();
  for (const variant of variants || []) {
    check(await db.from('ab_test_variants').update({
      impressions: Math.max(0, number(variant.impressions)), clicks: Math.max(0, number(variant.clicks)),
      conversions: Math.max(0, number(variant.conversions)), orders: Math.max(0, number(variant.orders)),
      revenue: Math.max(0, number(variant.revenue)), cost: Math.max(0, number(variant.cost))
    }).eq('id', variant.id).eq('ab_test_id', testId), '실험 실적 저장');
  }
  return evaluateTest(testId);
}

async function updateTestStatus(id, status) {
  const allowed = ['DRAFT', 'RUNNING', 'COMPLETED', 'CANCELLED'];
  if (!allowed.includes(status)) throw new Error('지원하지 않는 실험 상태입니다.');
  const db = supabaseModule.getSupabase();
  return check(await db.from('ab_tests').update({ status }).eq('id', id).select('*').single(), '실험 상태 변경');
}

async function currentMetric(platform, metric) {
  const db = supabaseModule.getSupabase();
  const start = sevenDaysAgo();
  const end = today();
  if (platform === 'NAVER' || ['CTR', 'CPC', 'CVR', 'CPA', 'ROAS'].includes(metric)) {
    const rows = check(await db.from('naver_stats_daily').select('impressions,clicks,cost,conversions,conversion_revenue').gte('date', start).lte('date', end), '벤치마크 네이버 데이터');
    const total = rows.reduce((sum, row) => ({ impressions: sum.impressions + number(row.impressions), clicks: sum.clicks + number(row.clicks), cost: sum.cost + number(row.cost), conversions: sum.conversions + number(row.conversions), orders: sum.orders + number(row.conversions), revenue: sum.revenue + number(row.conversion_revenue) }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, orders: 0, revenue: 0 });
    return { value: calculator.metrics(total)[metric], sample: calculator.sampleSize(metric, total), period_start: start, period_end: end, basis: platform === 'NAVER' ? 'NAVER_API' : 'NAVER_AD_PROXY' };
  }
  async function commerce(table, dateColumn, amountColumn) {
    const rows = check(await db.from(table).select(`${amountColumn},${dateColumn}`).gte(dateColumn, `${start}T00:00:00+09:00`).lte(dateColumn, `${end}T23:59:59+09:00`), `${platform} 벤치마크 데이터`);
    const total = { orders: rows.length, conversions: rows.length, revenue: rows.reduce((sum, row) => sum + number(row[amountColumn]), 0) };
    return { value: calculator.metrics(total)[metric], sample: rows.length, revenue: total.revenue, period_start: start, period_end: end, basis: `${platform}_ORDERS` };
  }
  if (platform === 'CAFE24') return commerce('cafe24_orders', 'order_date', 'paid_amount');
  if (platform === 'COUPANG') return commerce('coupang_orders', 'ordered_at', 'gross_amount');
  const [cafe, coupang] = await Promise.all([commerce('cafe24_orders', 'order_date', 'paid_amount'), commerce('coupang_orders', 'ordered_at', 'gross_amount')]);
  const total = { orders: cafe.sample + coupang.sample, conversions: cafe.sample + coupang.sample, revenue: cafe.revenue + coupang.revenue };
  return { value: calculator.metrics(total)[metric], sample: total.orders, period_start: start, period_end: end, basis: 'COMMERCE_ORDERS' };
}

async function listLab() {
  const db = supabaseModule.getSupabase();
  const tests = check(await db.from('ab_tests').select('*,ab_test_variants(*)').order('created_at', { ascending: false }).limit(100), '실험 목록');
  const benchmarks = check(await db.from('performance_benchmarks').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(100), '벤치마크 목록');
  const comparisons = [];
  for (const benchmark of benchmarks) {
    try {
      const current = await currentMetric(benchmark.platform, benchmark.metric);
      const target = number(benchmark.target_value);
      const warning = benchmark.warning_value == null ? null : number(benchmark.warning_value);
      const higher = benchmark.direction === 'HIGHER_IS_BETTER';
      const targetMet = higher ? current.value >= target : current.value <= target;
      const warningHit = warning == null ? false : higher ? current.value < warning : current.value > warning;
      comparisons.push({ benchmark_id: benchmark.id, ...current, status: targetMet ? 'TARGET' : warningHit ? 'RISK' : 'WATCH', gap_percent: target ? (current.value - target) / Math.abs(target) * 100 : 0 });
    } catch (error) { comparisons.push({ benchmark_id: benchmark.id, status: 'NO_DATA', error: error.message }); }
  }
  return { tests, benchmarks, comparisons };
}

async function createBenchmark(input) {
  const db = supabaseModule.getSupabase();
  if (!String(input.name || '').trim()) throw new Error('벤치마크 이름을 입력하세요.');
  return check(await db.from('performance_benchmarks').insert({
    name: String(input.name).trim(), platform: input.platform || 'ALL', metric: input.metric || 'ROAS', segment: String(input.segment || 'ALL'),
    warning_value: input.warning_value === '' || input.warning_value == null ? null : number(input.warning_value), target_value: number(input.target_value),
    direction: ['CPC', 'CPA'].includes(input.metric) ? 'LOWER_IS_BETTER' : (input.direction || 'HIGHER_IS_BETTER'),
    source_type: input.source_type || 'MANUAL', source_name: String(input.source_name || '').trim() || null,
    effective_from: input.effective_from || today(), notes: String(input.notes || '').trim() || null
  }).select('*').single(), '벤치마크 생성');
}

module.exports = { listLab, createTest, evaluateTest, evaluateRunningTests, updateVariantMetrics, updateTestStatus, createBenchmark, currentMetric };
