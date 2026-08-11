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
fs.mkdirSync(path.dirname(logPath), { recursive: true });

function safeMessage(error) {
  const secrets = [process.env.COUPANG_ACCESS_KEY, process.env.COUPANG_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  return secrets.reduce((message, secret) => message.split(secret).join('[REDACTED]'), String(error?.message || error || 'Unknown error'));
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  process.stdout.write(`${line}\n`);
}

async function claimNext(db) {
  const now = new Date().toISOString();
  const pending = await db.from('coupang_sync_requests').select('id,request_type,attempt_count').eq('status', 'PENDING').or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order('requested_at', { ascending: true }).limit(1).maybeSingle();
  if (pending.error) throw pending.error;
  if (!pending.data) return null;
  const claimed = await db.from('coupang_sync_requests').update({ status: 'RUNNING', started_at: now, collector: 'HOME_PC', attempt_count: Number(pending.data.attempt_count || 0) + 1 }).eq('id', pending.data.id).eq('status', 'PENDING').select('id,request_type,attempt_count').maybeSingle();
  if (claimed.error) throw claimed.error;
  return claimed.data || null;
}

async function main() {
  const db = getSupabase();
  const request = await claimNext(db);
  if (!request) {
    return log('IDLE_NO_MANUAL_REQUEST');
  }
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
    if (retryable) return log(`RETRY ${request.request_type} ${request.id} at=${retryAt}`);
    throw error;
  }
}

main().catch(error => {
  log(`FAILED ${safeMessage(error)}`);
  process.exitCode = 1;
});
