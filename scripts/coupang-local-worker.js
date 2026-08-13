'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
require('dotenv').config({ path: path.join(root, '.env.coupang.local'), override: false, quiet: true });
require('dotenv').config({ path: path.join(root, '.env.local'), override: false, quiet: true });

const { getSupabase } = require('../lib/cafe24/supabase.js');
const { syncCoupang } = require('../lib/automation/sync-all.js');
const { syncRocketGrowthInventoryOnly, syncRocketGrowthRealtime, syncSellerOrdersRealtime } = require('../lib/coupang/sync.js');
const operationQueue = require('../lib/coupang/operation-queue.js');
const coupangActions = require('../lib/coupang/actions.js');
const naverCommerceProbe = require('../lib/naver-commerce/probe.js');
const epostConfig = require('../lib/epost/config.js');
const epostClient = require('../lib/epost/client.js');
const epostTracking = require('../lib/epost/tracking.js');

const logPath = path.join(root, 'tmp', 'coupang-local-worker.log');
const watchMode = process.argv.includes('--watch');
const quietMode = process.argv.includes('--quiet');
const collectorId = String(process.env.COUPANG_COLLECTOR_ID || 'FIXED_IP_WORKER').trim();
fs.mkdirSync(path.dirname(logPath), { recursive: true });

function safeMessage(error) {
  const secrets = [process.env.COUPANG_ACCESS_KEY, process.env.COUPANG_SECRET_KEY, process.env.NAVER_COMMERCE_CLIENT_ID, process.env.NAVER_COMMERCE_CLIENT_SECRET, process.env.EPOST_API_KEY, process.env.EPOST_OPEN_API_KEY, process.env.EPOST_SECURITY_KEY, process.env.EPOST_SEED_KEY, process.env.EPOST_TRACKING_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  return secrets.reduce((message, secret) => message.split(secret).join('[REDACTED]'), String(error?.message || error || 'Unknown error'));
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  if (!quietMode) process.stdout.write(`${line}\n`);
}

async function publicIp() {
  const response = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Public IP check failed: HTTP ${response.status}`);
  const ip = String((await response.json()).ip || '').trim();
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) throw new Error('Public IP check returned an invalid IPv4 address.');
  return ip;
}

async function assertAllowedSourceIp() {
  const expected = String(process.env.COUPANG_ALLOWED_SOURCE_IP || '').trim();
  if (!expected) throw new Error('COUPANG_ALLOWED_SOURCE_IP is required for the fixed-IP worker.');
  const actual = await publicIp();
  if (actual !== expected) throw new Error(`Coupang source IP mismatch: actual=${actual} expected=${expected}`);
  log(`SOURCE_IP_VERIFIED ip=${actual} collector=${collectorId}`);
  return actual;
}

function scheduleRetry(db, retryAt) {
  const delay = Math.max(0, new Date(retryAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    processPending(db).catch(error => log(`RETRY_FAILED ${safeMessage(error)}`));
  }, delay);
  timer.unref?.();
}

async function claimNext(db) {
  const now = new Date().toISOString();
  const pending = await db.from('coupang_sync_requests').select('id,request_type,attempt_count').eq('status', 'PENDING').or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order('requested_at', { ascending: true }).limit(1).maybeSingle();
  if (pending.error) throw pending.error;
  if (!pending.data) return null;
  const claimed = await db.from('coupang_sync_requests').update({ status: 'RUNNING', started_at: now, collector: collectorId, attempt_count: Number(pending.data.attempt_count || 0) + 1 }).eq('id', pending.data.id).eq('status', 'PENDING').select('id,request_type,attempt_count').maybeSingle();
  if (claimed.error) throw claimed.error;
  return claimed.data || null;
}

async function processRequest(db, request) {
  log(`START ${request.request_type} ${request.id}`);
  try {
    const result = request.request_type === 'RG_INVENTORY' ? await syncRocketGrowthInventoryOnly()
      : request.request_type === 'RG_REALTIME' ? await syncRocketGrowthRealtime()
      : request.request_type === 'ORDER_REALTIME' ? await syncSellerOrdersRealtime()
      : await syncCoupang('MANUAL');
    const saved = await db.from('coupang_sync_requests').update({ status: 'SUCCESS', finished_at: new Date().toISOString(), result_json: result, error_message: null }).eq('id', request.id);
    if (saved.error) throw saved.error;
    log(`SUCCESS ${request.request_type} ${request.id}`);
  } catch (error) {
    const message = safeMessage(error);
    const retryable = /not allowed|403|429|timeout|fetch failed/i.test(message) && request.attempt_count < 8;
    const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await db.from('coupang_sync_requests').update(retryable ? { status: 'PENDING', next_attempt_at: retryAt, error_message: message } : { status: 'FAILED', finished_at: new Date().toISOString(), error_message: message }).eq('id', request.id);
    if (retryable) {
      scheduleRetry(db, retryAt);
      return log(`RETRY ${request.request_type} ${request.id} at=${retryAt}`);
    }
    throw error;
  }
}

async function processPending(db) {
  let processed = 0;
  while (true) {
    const request = await claimNext(db);
    if (!request) break;
    await processRequest(db, request);
    processed += 1;
  }
  return processed;
}

async function claimNextOperation(db) {
  const now = new Date().toISOString();
  const pending = await db.from('coupang_operation_requests')
    .select('id,operation_type,target_type,target_id,payload,attempt_count')
    .eq('status', 'PENDING')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('created_at', { ascending:true })
    .limit(1)
    .maybeSingle();
  if (pending.error) throw pending.error;
  if (!pending.data) return null;
  const claimed = await db.from('coupang_operation_requests').update({
    status:'RUNNING', started_at:now, collector:collectorId,
    attempt_count:Number(pending.data.attempt_count || 0) + 1
  }).eq('id', pending.data.id).eq('status', 'PENDING')
    .select('id,operation_type,target_type,target_id,payload,attempt_count')
    .maybeSingle();
  if (claimed.error) throw claimed.error;
  return claimed.data || null;
}

async function expirePendingOperations(db) {
  const now = new Date().toISOString();
  const expired = await db.from('coupang_operation_requests').update({
    status:'FAILED', executed_at:now,
    error_message:'고정 IP 서버 처리 기한이 지나 안전을 위해 실행하지 않았습니다. 다시 요청해주세요.'
  }).eq('status', 'PENDING').lt('expires_at', now);
  if (expired.error) throw expired.error;
}

async function dispatchOperation(request, payload, handlers = coupangActions, db = getSupabase()) {
  if (request.operation_type === 'NAVER_COMMERCE_PROBE') return { naverCommerce:await naverCommerceProbe.probeReadAccess({ db }) };
  if (request.operation_type === 'EPOST_CONFIG_PROBE') {
    const actualIp = await publicIp();
    return { epost:epostConfig.readiness({ actualIp }) };
  }
  if (request.operation_type === 'EPOST_TEST_ISSUE') {
    if (payload.testOnly !== true) throw Object.assign(new Error('우체국 테스트 전용 요청이 아닙니다.'), { code:'EPOST_TEST_ONLY' });
    const actualIp = await publicIp();
    const readiness = epostConfig.readiness({ actualIp });
    if (!readiness.readyForTest) throw Object.assign(new Error('우체국 테스트 접수에 필요한 서버 설정이 완료되지 않았습니다.'), { code:'EPOST_SETUP_REQUIRED' });
    let order = payload.order || {};
    if (order.platform === 'COUPANG') {
      const detail = await handlers.getOrderDetail(order.shipmentId);
      order = {
        ...order, receiver:detail.receiver,
        goodsName:(detail.items || []).map(item => item.name).filter(Boolean).join(' 외 '),
        quantity:(detail.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      };
    }
    return { epostTest:await epostClient.issueTestShipment(order) };
  }
  if (request.operation_type === 'EPOST_TRACKING') {
    if (request.target_type !== 'TRACKING' || payload.trackingNo !== request.target_id) {
      throw Object.assign(new Error('우체국 배송추적 요청 정보가 일치하지 않습니다.'), { code:'EPOST_TRACKING_TARGET_MISMATCH' });
    }
    return { epostTracking:await epostTracking.trace(payload.trackingNo) };
  }
  if (request.operation_type === 'ORDER_DETAIL') return { order:await handlers.getOrderDetail(request.target_id) };
  if (request.operation_type === 'PRODUCT_DETAIL') return { product:await handlers.getProductDetail(request.target_id) };
  const options = { audit:{ db, id:request.id } };
  if (request.target_type === 'PRODUCT') return handlers.executeProductAction(request.operation_type, payload, options);
  if (request.target_type === 'ORDER') return handlers.executeOrderAction(request.operation_type, payload, options);
  if (request.target_type === 'INQUIRY') return handlers.executeCsAction(request.operation_type, payload, options);
  if (['RETURN', 'EXCHANGE'].includes(request.target_type)) return handlers.executeCaseAction(request.operation_type, payload, options);
  throw new Error(`Unsupported Coupang operation target: ${request.target_type}`);
}

async function processOperationRequest(db, request) {
  log(`OPERATION_START ${request.operation_type} ${request.id}`);
  try {
    const payload = operationQueue.open(request.payload);
    const result = await dispatchOperation(request, payload, coupangActions, db);
    const saved = await db.from('coupang_operation_requests').update({
      status:'SUCCESS', result_json:operationQueue.seal(result), error_message:null,
      executed_at:new Date().toISOString()
    }).eq('id', request.id).eq('status', 'RUNNING');
    if (saved.error) throw saved.error;
    log(`OPERATION_SUCCESS ${request.operation_type} ${request.id}`);
  } catch (error) {
    const message = safeMessage(error);
    await db.from('coupang_operation_requests').update({
      status:'FAILED', error_message:message, executed_at:new Date().toISOString()
    }).eq('id', request.id).eq('status', 'RUNNING');
    log(`OPERATION_FAILED ${request.operation_type} ${request.id} ${message}`);
  }
}

async function processPendingOperations(db) {
  let processed = 0;
  await expirePendingOperations(db);
  while (true) {
    const request = await claimNextOperation(db);
    if (!request) break;
    await processOperationRequest(db, request);
    processed += 1;
  }
  return processed;
}

async function processAllPending(db) {
  const syncRequests = await processPending(db);
  const operationRequests = await processPendingOperations(db);
  return syncRequests + operationRequests;
}

async function runOnce(db = getSupabase()) {
  const processed = await processAllPending(db);
  if (!processed) log('IDLE_NO_MANUAL_REQUEST');
  return processed;
}

async function watch(db = getSupabase()) {
  await processAllPending(db);
  // Realtime is the fast path. This quiet recovery pass only drains explicitly
  // queued requests if a WebSocket event was missed; it never starts a
  // collection unless a user or the daily scheduler already queued one.
  const keepAlive = setInterval(() => {
    processAllPending(db).catch(error => log(`RECOVERY_FAILED ${safeMessage(error)}`));
  }, 60 * 1000);
  const channel = db.channel('harin-coupang-manual-requests')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'coupang_sync_requests' }, () => {
      processPending(db).catch(error => log(`EVENT_FAILED ${safeMessage(error)}`));
    })
    .subscribe((status, error) => {
      log(`REALTIME_${status}${error ? ` ${safeMessage(error)}` : ''}`);
      if (status === 'SUBSCRIBED') processAllPending(db).catch(nextError => log(`RECOVERY_FAILED ${safeMessage(nextError)}`));
    });
  const operationChannel = db.channel('harin-coupang-operation-requests')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'coupang_operation_requests' }, () => {
      processPendingOperations(db).catch(error => log(`OPERATION_EVENT_FAILED ${safeMessage(error)}`));
    })
    .subscribe((status, error) => log(`OPERATION_REALTIME_${status}${error ? ` ${safeMessage(error)}` : ''}`));
  const shutdown = async signal => {
    log(`STOP ${signal}`);
    clearInterval(keepAlive);
    await db.removeChannel(channel).catch(() => {});
    await db.removeChannel(operationChannel).catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  log('WATCHING_FIXED_IP_REQUESTS');
  return channel;
}

async function main() {
  await assertAllowedSourceIp();
  const db = getSupabase();
  return watchMode ? watch(db) : runOnce(db);
}

if (require.main === module) main().catch(error => {
  log(`FAILED ${safeMessage(error)}`);
  process.exitCode = 1;
});

module.exports = { assertAllowedSourceIp, claimNext, claimNextOperation, dispatchOperation, expirePendingOperations, processRequest, processOperationRequest, processPending, processPendingOperations, processAllPending, publicIp, runOnce, scheduleRetry, watch };
