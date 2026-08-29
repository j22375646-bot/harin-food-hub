'use strict';

const crypto = require('node:crypto');
const supabaseModule = require('../cafe24/supabase.js');
const operationsConfig = require('../operations-health/config.js');
const telegramClient = require('../operations-health/telegram-client.js');

const DEFAULTS = {
  setting_key: 'default', recipient_email: '', email_enabled: false,
  instant_alert_enabled: true, daily_report_enabled: true,
  weekly_report_enabled: true, monthly_report_enabled: true,
  minimum_severity: 'ERROR', timezone: 'Asia/Seoul'
};
const RANK = { INFO: 0, WARNING: 1, ERROR: 2 };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
const won = value => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;

function activeAlertsForDelivery(alerts = [], now = new Date()) {
  const reference = new Date(now).getTime();
  return alerts.filter(item => String(item?.status || 'OPEN').toUpperCase() === 'OPEN'
    && (!item?.snoozed_until || new Date(item.snoozed_until).getTime() <= reference));
}

function publicSettings(row = {}) {
  return { ...DEFAULTS, ...row, recipient_email: row.recipient_email || '' };
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function sanitizeSettings(input = {}) {
  const recipient = String(input.recipient_email || '').trim();
  if (recipient && !validEmail(recipient)) throw new Error('수신 이메일 주소를 확인해주세요.');
  const severity = String(input.minimum_severity || 'ERROR').toUpperCase();
  if (!(severity in RANK)) throw new Error('알림 중요도를 확인해주세요.');
  return {
    setting_key: 'default', recipient_email: recipient || null,
    email_enabled: Boolean(input.email_enabled), instant_alert_enabled: Boolean(input.instant_alert_enabled),
    daily_report_enabled: Boolean(input.daily_report_enabled), weekly_report_enabled: Boolean(input.weekly_report_enabled),
    monthly_report_enabled: Boolean(input.monthly_report_enabled), minimum_severity: severity,
    timezone: 'Asia/Seoul', updated_at: new Date().toISOString()
  };
}

async function getSettings(db = supabaseModule.getSupabase()) {
  const result = await db.from('notification_settings').select('*').eq('setting_key', 'default').maybeSingle();
  if (result.error) throw result.error;
  if (result.data) return publicSettings(result.data);
  const inserted = await db.from('notification_settings').insert(DEFAULTS).select('*').single();
  if (inserted.error) throw inserted.error;
  return publicSettings(inserted.data);
}

async function updateSettings(input, db = supabaseModule.getSupabase()) {
  const row = sanitizeSettings(input);
  const result = await db.from('notification_settings').upsert(row, { onConflict: 'setting_key' }).select('*').single();
  if (result.error) throw result.error;
  return publicSettings(result.data);
}

function deliveryConfiguration(settings) {
  if (!settings.email_enabled) return { ready:false, reason:'이메일 발송이 꺼져 있습니다.' };
  if (!validEmail(settings.recipient_email)) return { ready:false, reason:'수신 이메일이 설정되지 않았습니다.' };
  if (String(process.env.RESEND_ALERT_WRITES_ENABLED || '').trim().toLowerCase() !== 'true') return { ready:false, reason:'서버의 Resend 실제 발송 안전 스위치가 잠겨 있습니다.' };
  if (!String(process.env.RESEND_API_KEY || '').trim()) return { ready:false, reason:'Vercel RESEND_API_KEY가 설정되지 않았습니다.' };
  if (!String(process.env.REPORT_FROM_EMAIL || '').trim()) return { ready:false, reason:'Vercel REPORT_FROM_EMAIL이 설정되지 않았습니다.' };
  return { ready:true };
}

function telegramDeliveryConfiguration(env = process.env) {
  const config = operationsConfig.telegramConfig(env);
  if (!config.enabled) return { ready:false, reason:'Telegram 운영 알림이 꺼져 있습니다.', config };
  if (!config.token) return { ready:false, reason:'Vercel TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.', config };
  if (!config.chatId) return { ready:false, reason:'Vercel TELEGRAM_ALERT_CHAT_ID가 설정되지 않았습니다.', config };
  if (!config.writesEnabled) return { ready:false, reason:'Telegram 실제 발송 안전 스위치가 잠겨 있습니다.', config };
  return { ready:true, config };
}

async function recordDelivery(db, row) {
  const result = await db.from('notification_deliveries').insert(row).select('id,status,sent_at,error_message').single();
  if (result.error) throw result.error;
  return result.data;
}

async function alreadySent(db, dedupKey, channel = 'EMAIL') {
  if (!dedupKey) return false;
  const result = await db.from('notification_deliveries').select('id').eq('dedup_key', dedupKey).eq('channel',channel).in('status', ['PENDING','SENT']).limit(1).maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

async function claimDelivery(db, row) {
  const claimed = await db.from('notification_deliveries').insert({ ...row, status:'PENDING' }).select('id,status').single();
  if (claimed.error?.code === '23505') return { duplicate:true, data:null };
  if (claimed.error) throw claimed.error;
  return { duplicate:false, data:claimed.data };
}

async function finishDelivery(db, id, values) {
  const result = await db.from('notification_deliveries').update(values).eq('id',id).select('id,status,sent_at,error_message').single();
  if (result.error) throw result.error;
  return result.data;
}

async function sendEmail({ to, subject, html, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${String(process.env.RESEND_API_KEY || '').trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: String(process.env.REPORT_FROM_EMAIL || '').trim(), to: [to], subject, html })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `이메일 발송 실패 (${response.status})`);
  return body;
}

function reportEmail(report) {
  const summary = report.summary_json || {};
  const configuredUrl = String(process.env.PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://harin-cafe24-sync.vercel.app');
  const appUrl = (/^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`).replace(/\/$/, '');
  const findings = (summary.insights || []).slice(0, 5).map(item => `<li><b>${escapeHtml(item.title)}</b><br>${escapeHtml(item.body)}</li>`).join('');
  const actions = (summary.recommendations || []).slice(0, 3).map(item => `<li><b>${escapeHtml(item.title)}</b> — ${escapeHtml(item.expected || item.reason)}</li>`).join('');
  const metrics = [
    summary.cafe24 && `Cafe24 매출 ${won(summary.cafe24.revenue)}`,
    summary.naver && `네이버 Paid ROAS ${Number(summary.naver.roas || 0).toFixed(1)}%`,
    summary.coupang && `쿠팡 매출 ${won(summary.coupang.gross_sales)}`
  ].filter(Boolean).join(' · ');
  return `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#20232a"><p style="color:#ef7f2d;font-weight:700">HARIN FOOD HUB</p><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.period_start)} ~ ${escapeHtml(report.period_end)} · 서버 자동 계산</p><div style="padding:16px;border-radius:12px;background:#f4f6f8"><b>${escapeHtml(metrics || '플랫폼 보고서')}</b></div><h2>핵심 진단</h2><ul style="line-height:1.7">${findings || '<li>새로운 주요 진단이 없습니다.</li>'}</ul><h2>오늘의 액션</h2><ol style="line-height:1.7">${actions || '<li>새로운 권장 액션이 없습니다.</li>'}</ol><p><a href="${appUrl}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#202936;color:#fff;text-decoration:none">허브에서 상세 보고서 보기</a></p></div>`;
}

function alertEmail(alerts) {
  const rows = alerts.map(item => `<div style="margin:10px 0;padding:14px;border-left:4px solid ${item.severity === 'ERROR' ? '#d8483c' : '#ed9a35'};background:#f8f9fa"><small>${escapeHtml(item.platform)} · ${escapeHtml(item.severity)}</small><h3 style="margin:5px 0">${escapeHtml(item.title)}</h3><p style="margin:0">${escapeHtml(item.message)}</p></div>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#20232a"><p style="color:#d8483c;font-weight:700">HARIN FOOD HUB · IMPORTANT ALERT</p><h1>중요 이상징후 ${alerts.length}건</h1>${rows}<p>허브 알림센터에서 확인·처리 상태를 기록할 수 있습니다.</p></div>`;
}

function alertTelegram(alerts) {
  const configuredUrl = String(process.env.PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://harin-cafe24-sync.vercel.app');
  const appUrl = (/^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`).replace(/\/$/, '');
  const rows = alerts.slice(0,10).map((item,index) => `${index+1}. [${item.severity}] ${item.platform} · ${item.title}\n${String(item.message||'').trim()}`).join('\n\n');
  return `[하린식품 허브] 중요 이상징후 ${alerts.length}건\n\n${rows}\n\n확인: ${appUrl}/alerts`;
}

async function deliver({ eventType, sourceId = null, platform = 'ALL', subject, html, triggerType = 'SYSTEM', dedupKey = null, details = {}, force = false, db = supabaseModule.getSupabase() }) {
  const settings = await getSettings(db);
  const config = deliveryConfiguration(force ? { ...settings, email_enabled:true } : settings);
  const base = { event_type:eventType, source_id:sourceId, platform, channel:'EMAIL', recipient:settings.recipient_email || null, subject, trigger_type:triggerType, dedup_key:dedupKey, details };
  if (!config.ready) {
    await recordDelivery(db, { ...base, status:'SKIPPED', error_message:config.reason });
    return { status:'SKIPPED', reason:config.reason };
  }
  if (!force && dedupKey && await alreadySent(db, dedupKey, 'EMAIL')) return { status:'SKIPPED', reason:'이미 발송 또는 발송 중인 이메일입니다.' };
  const claim = await claimDelivery(db, base);
  if (claim.duplicate) return { status:'SKIPPED', reason:'이미 발송 또는 발송 중인 이메일입니다.' };
  try {
    const sent = await sendEmail({ to:settings.recipient_email, subject, html });
    await finishDelivery(db, claim.data.id, { status:'SENT', provider_message_id:sent.id || null, sent_at:new Date().toISOString(), error_message:null });
    return { status:'SENT', id:sent.id || null };
  } catch (error) {
    await finishDelivery(db, claim.data.id, { status:'FAILED', error_message:error.message });
    return { status:'FAILED', error:error.message };
  }
}

async function deliverTelegramAlerts(alerts, { eventType='ALERT', sourceId=null, platform='ALL', subject, triggerType='SYSTEM', dedupKey=null, details={}, force=false, db=supabaseModule.getSupabase(), env=process.env, fetchImpl=fetch } = {}) {
  const delivery = telegramDeliveryConfiguration(env);
  if (!delivery.ready) return { status:'SKIPPED', reason:delivery.reason };
  const base = { event_type:eventType, source_id:sourceId, platform, channel:'TELEGRAM', recipient:String(delivery.config.chatId), subject, trigger_type:triggerType, dedup_key:dedupKey, details };
  if (!force && dedupKey && await alreadySent(db, dedupKey, 'TELEGRAM')) return { status:'SKIPPED', reason:'이미 발송 또는 발송 중인 Telegram 알림입니다.' };
  const claim = await claimDelivery(db, base);
  if (claim.duplicate) return { status:'SKIPPED', reason:'이미 발송 또는 발송 중인 Telegram 알림입니다.' };
  try {
    const sent = await telegramClient.sendAlert({ config:delivery.config, text:alertTelegram(alerts), fetchImpl });
    await finishDelivery(db, claim.data.id, { status:'SENT', provider_message_id:sent.id || null, sent_at:new Date().toISOString(), error_message:null });
    return { status:'SENT', id:sent.id || null };
  } catch (error) {
    await finishDelivery(db, claim.data.id, { status:'FAILED', error_message:error.message });
    return { status:'FAILED', error:error.message };
  }
}

async function deliverReport(reportOrId, options = {}) {
  const db = options.db || supabaseModule.getSupabase();
  let report = reportOrId;
  if (typeof reportOrId === 'string') {
    const result = await db.from('reports').select('id,platform,report_type,period_start,period_end,title,summary_json').eq('id', reportOrId).single();
    if (result.error) throw result.error;
    report = result.data;
  }
  const settings = await getSettings(db);
  const cadence = String(options.cadence || report.report_type || '').toUpperCase();
  const enabled = cadence === 'DAILY' ? settings.daily_report_enabled : cadence === 'WEEKLY' ? settings.weekly_report_enabled : cadence === 'MONTHLY' ? settings.monthly_report_enabled : true;
  if (!enabled && !options.force) return { status:'SKIPPED', reason:`${cadence} 보고서 자동 전달이 꺼져 있습니다.` };
  return deliver({ eventType:'REPORT', sourceId:report.id, platform:report.platform, subject:`[하린식품] ${report.title}`, html:reportEmail(report), triggerType:options.triggerType || 'SYSTEM', dedupKey:options.force ? null : `REPORT:${cadence}:${report.id}`, details:{cadence,report_type:report.report_type}, force:options.force, db });
}

async function deliverAlerts(alerts = [], options = {}) {
  const db = options.db || supabaseModule.getSupabase();
  if (!alerts.length) return { status:'SKIPPED', reason:'새 중요 알림이 없습니다.' };
  const settings = await getSettings(db);
  if (!settings.instant_alert_enabled && !options.force) return { status:'SKIPPED', reason:'즉시 이상징후 알림이 꺼져 있습니다.' };
  const selected = alerts.filter(item => RANK[item.severity] >= RANK[settings.minimum_severity]);
  if (!selected.length) return { status:'SKIPPED', reason:'설정된 중요도 이상의 새 알림이 없습니다.' };
  const hash = crypto.createHash('sha256').update(selected.map(item => item.fingerprint || item.id).sort().join('|')).digest('hex').slice(0, 20);
  const common = { eventType:'ALERT', sourceId:selected[0].id || null, platform:selected.every(item => item.platform === selected[0].platform) ? selected[0].platform : 'ALL', subject:`[하린식품 긴급] 중요 이상징후 ${selected.length}건`, triggerType:options.triggerType || 'SYSTEM', dedupKey:options.force ? null : `ALERT:${hash}`, details:{alert_ids:selected.map(item => item.id)}, force:options.force, db };
  const [email,telegram] = await Promise.all([
    deliver({ ...common, html:alertEmail(selected) }),
    deliverTelegramAlerts(selected,{ ...common, env:options.env || process.env, fetchImpl:options.fetchImpl || fetch })
  ]);
  const status = [email,telegram].some(item=>item.status==='SENT')?'SENT':[email,telegram].some(item=>item.status==='FAILED')?'FAILED':'SKIPPED';
  return { status, deliveries:{ email, telegram } };
}

async function centerData(db = supabaseModule.getSupabase()) {
  const [settings, alerts, deliveries] = await Promise.all([
    getSettings(db),
    db.from('alerts').select('id,source_type,source_id,platform,severity,title,message,status,created_at,acknowledged_at,resolved_at,snoozed_until').order('created_at',{ascending:false}).limit(100),
    db.from('notification_deliveries').select('id,event_type,source_id,platform,channel,recipient,subject,status,trigger_type,error_message,attempted_at,sent_at').order('attempted_at',{ascending:false}).limit(50)
  ]);
  if (alerts.error || deliveries.error) throw (alerts.error || deliveries.error);
  const telegram=telegramDeliveryConfiguration();
  return { settings, alerts:alerts.data || [], deliveries:deliveries.data || [], email_provider_configured:Boolean(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL), email_writes_unlocked:String(process.env.RESEND_ALERT_WRITES_ENABLED || '').trim().toLowerCase()==='true', telegram_provider_configured:Boolean(telegram.config.token&&telegram.config.chatId), telegram_writes_unlocked:telegram.config.writesEnabled };
}

module.exports = { DEFAULTS, RANK, validEmail, sanitizeSettings, publicSettings, deliveryConfiguration, telegramDeliveryConfiguration, activeAlertsForDelivery, reportEmail, alertEmail, alertTelegram, sendEmail, getSettings, updateSettings, alreadySent, claimDelivery, finishDelivery, deliver, deliverTelegramAlerts, deliverReport, deliverAlerts, centerData };
