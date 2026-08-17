'use strict';

const crypto = require('node:crypto');

const API_BASE = 'https://api.solapi.com';
const DEFAULT_PRICES = Object.freeze({ SMS:18, LMS:45 });
const enabled = value => String(value || '').toLowerCase() === 'true';
const text = value => value == null ? '' : String(value).trim();

function configuration(env = process.env) {
  const missing = [];
  if (!text(env.SOLAPI_API_KEY)) missing.push('SOLAPI_API_KEY');
  if (!text(env.SOLAPI_API_SECRET)) missing.push('SOLAPI_API_SECRET');
  if (!text(env.SOLAPI_SENDER_NUMBER)) missing.push('SOLAPI_SENDER_NUMBER');
  if (!text(env.SOLAPI_OPTOUT_NUMBER)) missing.push('SOLAPI_OPTOUT_NUMBER');
  return {
    enabled:enabled(env.SOLAPI_REPURCHASE_ENABLED),
    writeEnabled:enabled(env.SOLAPI_REPURCHASE_WRITES_ENABLED),
    configured:missing.length === 0,
    missing,
    senderMasked:maskPhone(env.SOLAPI_SENDER_NUMBER),
    optOutMasked:maskPhone(env.SOLAPI_OPTOUT_NUMBER),
    prices:{ ...DEFAULT_PRICES }
  };
}

function normalizePhone(value) { return text(value).replace(/\D/g, '').slice(0, 12); }
function maskPhone(value) {
  const phone = normalizePhone(value);
  if (!phone) return '';
  if (phone.length < 8) return `${phone.slice(0,2)}***${phone.slice(-2)}`;
  return `${phone.slice(0,3)}-${'*'.repeat(Math.max(3,phone.length-7))}-${phone.slice(-4)}`;
}
function messageBytes(value) {
  return [...String(value || '')].reduce((sum,char)=>sum+(char.codePointAt(0) <= 0x7f ? 1 : 2),0);
}
function messageType(value) { return messageBytes(value) <= 90 ? 'SMS' : 'LMS'; }
function estimateCost(value, count, prices = DEFAULT_PRICES) {
  const type = messageType(value);
  return { type, unitPrice:Number(prices[type] || 0), total:Math.max(0,Number(count)||0)*Number(prices[type]||0), bytes:messageBytes(value) };
}

function authorization({ apiKey, apiSecret, date = new Date().toISOString(), salt = crypto.randomBytes(16).toString('hex') }) {
  const signature = crypto.createHmac('sha256',apiSecret).update(`${date}${salt}`).digest('hex');
  return { header:`HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`, date, salt };
}

function sanitizeResult(payload = {}) {
  const group = payload.groupInfo || payload.group || payload;
  return {
    groupId:text(group.groupId || group.group_id) || null,
    status:text(group.status) || null,
    count:{ total:Number(group.count?.total || group.count || 0), sent:Number(group.count?.sentTotal || group.successCount || 0), failed:Number(group.count?.sentFailed || group.failedCount || 0) },
    balance:Number.isFinite(Number(group.balance)) ? Number(group.balance) : null
  };
}

async function sendBatch({ recipients, body, env = process.env, fetchImpl = fetch }) {
  const config = configuration(env);
  if (!config.enabled) throw Object.assign(new Error('SOLAPI 재구매 메시지 기능이 꺼져 있습니다.'),{ code:'PROVIDER_DISABLED' });
  if (!config.configured) throw Object.assign(new Error(`SOLAPI 설정이 필요합니다: ${config.missing.join(', ')}`),{ code:'CONFIG_REQUIRED' });
  if (!config.writeEnabled) throw Object.assign(new Error('SOLAPI 실제 발송 잠금이 해제되지 않았습니다.'),{ code:'WRITE_LOCKED' });
  const rows = (recipients || []).map(item=>({ to:normalizePhone(item.phone), from:normalizePhone(env.SOLAPI_SENDER_NUMBER), text:String(body || '') })).filter(item=>item.to).slice(0,50);
  if (!rows.length) throw Object.assign(new Error('발송할 연락처가 없습니다.'),{ code:'NO_RECIPIENTS' });
  const auth = authorization({ apiKey:env.SOLAPI_API_KEY, apiSecret:env.SOLAPI_API_SECRET });
  const response = await fetchImpl(`${API_BASE}/messages/v4/send-many/detail`,{
    method:'POST', headers:{ Authorization:auth.header, 'Content-Type':'application/json' },
    body:JSON.stringify({ messages:rows, strict:true, allowDuplicates:false, showMessageList:true })
  });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw Object.assign(new Error(text(payload.errorMessage || payload.message) || `SOLAPI 발송 실패 (${response.status})`),{ code:text(payload.errorCode)||'SOLAPI_ERROR', status:response.status });
  return sanitizeResult(payload);
}

module.exports = { API_BASE, DEFAULT_PRICES, authorization, configuration, estimateCost, maskPhone, messageBytes, messageType, normalizePhone, sanitizeResult, sendBatch };
