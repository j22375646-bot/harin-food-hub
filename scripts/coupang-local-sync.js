'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
require('dotenv').config({ path: path.join(root, '.env.coupang.local'), override: false, quiet: true });
require('dotenv').config({ path: path.join(root, '.env.local'), override: false, quiet: true });

const { syncCoupang } = require('../lib/automation/sync-all.js');
const { getSupabase } = require('../lib/cafe24/supabase.js');

const tmpDir = path.join(root, 'tmp');
const lockPath = path.join(tmpDir, 'coupang-local-sync.lock');
const logPath = path.join(tmpDir, 'coupang-local-sync.log');
const statusPath = path.join(tmpDir, 'coupang-local-status.json');
const ipOnly = process.argv.includes('--ip-only');
const collectorId = String(process.env.COUPANG_COLLECTOR_ID || 'FIXED_IP_WORKER').trim();

fs.mkdirSync(tmpDir, { recursive: true });

function safeMessage(error) {
  const secrets = [process.env.COUPANG_ACCESS_KEY, process.env.COUPANG_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  return secrets.reduce((message, secret) => message.split(secret).join('[REDACTED]'), String(error?.message || error || '알 수 없는 오류'));
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  process.stdout.write(`${line}\n`);
}

async function publicIp() {
  const services = ['https://api.ipify.org?format=json', 'https://ifconfig.co/json'];
  let lastError;
  for (const url of services) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const ip = String(data.ip || '').trim();
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
      throw new Error('IPv4 응답이 없습니다.');
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`공인 IP 확인 실패: ${safeMessage(lastError)}`);
}

function acquireLock() {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    fs.closeSync(fd);
    return;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const age = Date.now() - fs.statSync(lockPath).mtimeMs;
    if (age > 2 * 60 * 60 * 1000) {
      fs.unlinkSync(lockPath);
      return acquireLock();
    }
    throw new Error('이미 실행 중인 쿠팡 동기화가 있습니다.');
  }
}

async function recordIpMismatch(currentIp, expectedIp) {
  const db = getSupabase();
  await db.from('sync_logs').insert({
    platform: 'COUPANG', job_type: 'LOCAL_IP_CHECK', status: 'FAILED', finished_at: new Date().toISOString(),
    error_message: '집 인터넷 공인 IP가 변경되어 쿠팡 WING 허용 IP 갱신이 필요합니다.',
    metadata: { current_ip: currentIp, expected_ip: expectedIp, collector: collectorId }
  });
}

async function main() {
  const ip = await publicIp();
  log(`PUBLIC_IP=${ip}`);
  if (ipOnly) return;

  acquireLock();
  const expectedIp = String(process.env.COUPANG_ALLOWED_SOURCE_IP || '').trim();
  if (expectedIp && expectedIp !== ip) {
    await recordIpMismatch(ip, expectedIp);
    throw new Error(`공인 IP 변경 감지: 현재 ${ip}, WING 등록값 ${expectedIp}`);
  }

  const result = await syncCoupang('MANUAL');
  const status = { ok: true, publicIp: ip, finishedAt: new Date().toISOString(), result };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
  log(`SYNC_${result.status || 'SUCCESS'} attempts=${result.attempts || 1}`);
}

main().catch(error => {
  const status = { ok: false, finishedAt: new Date().toISOString(), error: safeMessage(error) };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
  log(`FAILED ${status.error}`);
  process.exitCode = 1;
}).finally(() => {
  if (!ipOnly && fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
});
