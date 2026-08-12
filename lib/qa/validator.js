'use strict';

const notificationService = require('../notifications/service.js');

const supabaseModule = require('../cafe24/supabase.js');

function row(platform, dataset, statusCode, message, values = {}) {
  const severity = values.severity || (['API_ERROR', 'PARSE_ERROR'].includes(statusCode) ? 'ERROR' : ['OK', 'REAL_ZERO'].includes(statusCode) ? 'INFO' : 'WARNING');
  return {
    platform,
    dataset,
    status_code: statusCode,
    severity,
    message,
    rows_checked: values.rowsChecked || 0,
    duplicate_count: values.duplicateCount || 0,
    remediation: values.remediation || null,
    retryable: Boolean(values.retryable),
    details: values.details || {},
    period_start: values.periodStart || null,
    period_end: values.periodEnd || null
  };
}

const qualityFingerprint = item => `QA:${item.platform}:${item.dataset}:${item.status_code}`;

function obsoleteQualityAlertIds(openAlerts = [], checks = []) {
  const active = new Set(checks.filter(item => item.severity === 'ERROR').map(qualityFingerprint));
  return openAlerts
    .filter(alert => String(alert.fingerprint || '').startsWith('QA:') && !active.has(alert.fingerprint))
    .map(alert => alert.id);
}

async function runDataQualityChecks({ automationRunId = null } = {}) {
  const db = supabaseModule.getSupabase();
  const [logs, traffic, cafeOrders, naverStats, coupangOrders, coupangProducts, coupangInventory, duplicates] = await Promise.all([
    db.from('sync_logs').select('platform,status,finished_at,error_message,rows_received,metadata').eq('job_type', 'FETCH_ALL').order('started_at', { ascending: false }).limit(30),
    db.from('cafe24_traffic_daily').select('date,visitors,pageviews,source_status').order('date', { ascending: false }).limit(14),
    db.from('cafe24_orders').select('*', { count: 'exact', head: true }),
    db.from('naver_stats_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
    db.from('coupang_orders').select('*', { count: 'exact', head: true }),
    db.from('coupang_products').select('*', { count: 'exact', head: true }),
    db.from('coupang_rg_inventory').select('stock_status,total_orderable_quantity,snapshot_at'),
    db.rpc('qa_duplicate_counts').maybeSingle()
  ]);
  const fatal = [logs, traffic, cafeOrders, naverStats, coupangOrders, coupangProducts, coupangInventory].find(item => item.error)?.error;
  if (fatal) throw fatal;

  const checks = [];
  for (const platform of ['CAFE24', 'NAVER', 'COUPANG']) {
    const latest = (logs.data || []).find(item => item.platform === platform);
    if (!latest) checks.push(row(platform, 'SYNC', 'NOT_COLLECTED', '아직 동기화 실행 기록이 없습니다.', { retryable: true, remediation: '수동 동기화를 실행해 주세요.' }));
    else if (latest.status === 'FAILED') checks.push(row(platform, 'SYNC', 'API_ERROR', latest.error_message || '최근 동기화가 실패했습니다.', { retryable: true, remediation: '자동 재시도 후에도 실패하면 API 연결 정보를 확인해 주세요.' }));
    else {
      const hours = latest.finished_at ? (Date.now() - new Date(latest.finished_at).getTime()) / 3600000 : 999;
      checks.push(row(platform, 'SYNC', hours > 30 ? 'STALE' : 'OK', hours > 30 ? '마지막 성공 수집 후 30시간 이상 지났습니다.' : '최근 데이터 수집이 정상입니다.', { rowsChecked: latest.rows_received, retryable: hours > 30, details: { finished_at: latest.finished_at, status: latest.status } }));
    }
  }

  const trafficRows = traffic.data || [];
  if (!trafficRows.length) checks.push(row('CAFE24', 'TRAFFIC', 'NOT_COLLECTED', '트래픽 데이터가 수집되지 않았습니다.', { retryable: true }));
  for (const item of trafficRows.slice(0, 7)) {
    let code = item.source_status || 'PARSE_ERROR';
    if (code === 'OK' && Number(item.visitors) === 0 && Number(item.pageviews) === 0) code = 'REAL_ZERO';
    checks.push(row('CAFE24', 'TRAFFIC', code, `${item.date} 트래픽: ${code === 'REAL_ZERO' ? '실제 0으로 확인' : code === 'OK' ? '정상' : '확인 필요'}`, { rowsChecked: 1, periodStart: item.date, periodEnd: item.date, retryable: ['API_ERROR', 'PARSE_ERROR'].includes(code) }));
  }

  checks.push(row('CAFE24', 'ORDERS', cafeOrders.count > 0 ? 'OK' : 'NO_DATA', cafeOrders.count > 0 ? `주문 ${cafeOrders.count}건이 저장되어 있습니다.` : '저장된 주문이 없습니다.', { rowsChecked: cafeOrders.count || 0 }));
  checks.push(row('NAVER', 'STATS', naverStats.data?.date ? 'OK' : 'NOT_COLLECTED', naverStats.data?.date ? `광고 실적 최신일은 ${naverStats.data.date}입니다.` : '광고 실적이 없습니다.', { rowsChecked: naverStats.data ? 1 : 0, details: { latest_date: naverStats.data?.date || null } }));
  checks.push(row('COUPANG', 'PRODUCTS', coupangProducts.count > 0 ? 'OK' : 'NO_DATA', coupangProducts.count > 0 ? `쿠팡 상품 ${coupangProducts.count}개가 저장되어 있습니다.` : '저장된 쿠팡 상품이 없습니다.', { rowsChecked: coupangProducts.count || 0 }));
  checks.push(row('COUPANG', 'ORDERS', coupangOrders.count > 0 ? 'OK' : 'REAL_ZERO', coupangOrders.count > 0 ? `쿠팡 주문 ${coupangOrders.count}건이 저장되어 있습니다.` : '수집 기간의 쿠팡 주문이 0건입니다.', { rowsChecked: coupangOrders.count || 0 }));
  const inventoryRows = coupangInventory.data || [];
  const outOfStock = inventoryRows.filter(item => item.stock_status === 'OUT_OF_STOCK').length;
  const staleInventory = Boolean(inventoryRows.length) && (Date.now() - new Date(inventoryRows[0].snapshot_at).getTime()) > 30 * 3600000;
  checks.push(row('COUPANG', 'RG_INVENTORY', !inventoryRows.length ? 'NOT_COLLECTED' : staleInventory ? 'STALE' : 'OK', !inventoryRows.length ? '로켓그로스 재고가 아직 수집되지 않았습니다.' : staleInventory ? '로켓그로스 재고가 30시간 이상 갱신되지 않았습니다.' : `로켓그로스 재고 ${inventoryRows.length}개 SKU가 저장되어 있습니다. 품절 ${outOfStock}개입니다.`, { rowsChecked: inventoryRows.length, retryable: !inventoryRows.length || staleInventory, details: { out_of_stock: outOfStock } }));

  if (!duplicates.error && duplicates.data) {
    const total = Object.values(duplicates.data).reduce((sum, value) => sum + Number(value || 0), 0);
    checks.push(row('ALL', 'DUPLICATES', total ? 'DUPLICATE' : 'OK', total ? `중복 후보 ${total}건이 발견되었습니다.` : '핵심 식별자 중복이 없습니다.', { duplicateCount: total, details: duplicates.data }));
  }

  const payload = checks.map(item => ({ ...item, automation_run_id: automationRunId }));
  const saved = await db.from('data_quality_checks').insert(payload).select('id');
  if (saved.error) throw saved.error;
  const errors = checks.filter(item => item.severity === 'ERROR'), newAlerts = [];
  for (const item of errors) {
    const fingerprint = qualityFingerprint(item);
    const existing = await db.from('alerts').select('id').eq('fingerprint', fingerprint).eq('status', 'OPEN').limit(1).maybeSingle();
    if (!existing.error && !existing.data) {
      const inserted = await db.from('alerts').insert({ source_type: 'DATA_QUALITY', platform: item.platform, severity: item.severity, title: `${item.platform} ${item.dataset} 점검 필요`, message: item.message, fingerprint, status: 'OPEN' }).select('id,platform,severity,title,message,fingerprint').single();
      if (!inserted.error && inserted.data) newAlerts.push(inserted.data);
    }
  }
  let resolvedAlerts = 0;
  const openQualityAlerts = await db.from('alerts').select('id,fingerprint').eq('source_type', 'DATA_QUALITY').eq('status', 'OPEN');
  if (!openQualityAlerts.error) {
    const obsoleteIds = obsoleteQualityAlertIds(openQualityAlerts.data || [], checks);
    if (obsoleteIds.length) {
      const resolved = await db.from('alerts').update({ status:'RESOLVED', resolved_at:new Date().toISOString() }).in('id', obsoleteIds).select('id');
      if (!resolved.error) resolvedAlerts = resolved.data?.length || obsoleteIds.length;
    }
  }
  const alertDelivery = newAlerts.length ? await notificationService.deliverAlerts(newAlerts,{db,triggerType:automationRunId?'SYSTEM':'MANUAL'}).catch(error=>({status:'FAILED',error:error.message})) : null;
  return { checked: checks.length, ok: checks.filter(item => ['OK', 'REAL_ZERO'].includes(item.status_code)).length, warnings: checks.filter(item => item.severity === 'WARNING').length, errors: errors.length, checks, new_alerts:newAlerts.length, resolved_alerts:resolvedAlerts, alert_delivery:alertDelivery };
}

module.exports = { qualityFingerprint, obsoleteQualityAlertIds, runDataQualityChecks };
