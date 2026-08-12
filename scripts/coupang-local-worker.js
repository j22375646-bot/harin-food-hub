'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
require('dotenv').config({ path: path.join(root, '.env.coupang.local'), override: false, quiet: true });
require('dotenv').config({ path: path.join(root, '.env.local'), override: false, quiet: true });

const { getSupabase } = require('../lib/cafe24/supabase.js');
const { syncCoupang } = require('../lib/automation/sync-all.js');
const { syncRocketGrowthInventoryOnly, syncRocketGrowthRealtime } = require('../lib/coupang/sync.js');

const logPath = path.join(root, 'tmp', 'coupang-local-worker.log');
const watchMode = process.argv.includes('--watch');
const quietMode = process.argv.includes('--quiet');
const collectorId = String(process.env.COUPANG_COLLECTOR_ID || 'FIXED_IP_WORKER').trim();
fs.mkdirSync(path.dirname(logPath), { recursive: true });

function safeMessage(error) {
  const secrets = [process.env.COUPANG_ACCESS_KEY, process.env.COUPANG_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
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

async function runOnce(db = getSupabase()) {
  const processed = await processPending(db);
  if (!processed) log('IDLE_NO_MANUAL_REQUEST');
  return processed;
}

async function watch(db = getSupabase()) {
  await processPending(db);
  // Some Node WebSocket implementations unref their socket. Keep the hidden
  // scheduled task alive without polling the database or running a collection.
  const keepAlive = setInterval(() => {}, 60 * 1000);
  const channel = db.channel('harin-coupang-manual-requests')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'coupang_sync_requests' }, () => {
      processPending(db).catch(error => log(`EVENT_FAILED ${safeMessage(error)}`));
    })
    .subscribe((status, error) => {
      log(`REALTIME_${status}${error ? ` ${safeMessage(error)}` : ''}`);
      if (status === 'SUBSCRIBED') processPending(db).catch(nextError => log(`RECOVERY_FAILED ${safeMessage(nextError)}`));
    });
  const shutdown = async signal => {
    log(`STOP ${signal}`);
    clearInterval(keepAlive);
    await db.removeChannel(channel).catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  log('WATCHING_MANUAL_REQUESTS');
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

module.exports = { assertAllowedSourceIp, claimNext, processRequest, processPending, publicIp, runOnce, scheduleRetry, watch };
