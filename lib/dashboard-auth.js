'use strict';
const crypto = require('node:crypto');
const COOKIE_NAME = 'harin_dashboard_session';
function password() { const value = process.env.DASHBOARD_PASSWORD; if (!value) throw new Error('DASHBOARD_PASSWORD is not configured'); return value; }
function sessionToken() { return crypto.createHmac('sha256', password()).update('harin-dashboard-session-v1').digest('hex'); }
function safeEqual(left, right) { const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function verifyPassword(candidate) { return safeEqual(candidate, password()); }
function verifySession(token) { return safeEqual(token, sessionToken()); }
function signFinancialTrust(trust = {}, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    scope:'financial-trust',
    exp:Number(now) + 10 * 60 * 1000,
    formula_version:trust.formula_version || null,
    allowed_cpc:trust.allowed?.allowed_cpc === true
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', password()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyFinancialTrust(token, now = Date.now()) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', password()).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.scope !== 'financial-trust' || !Number.isFinite(parsed.exp) || parsed.exp < Number(now)) return null;
    return parsed;
  } catch { return null; }
}
module.exports = { COOKIE_NAME, sessionToken, verifyPassword, verifySession, signFinancialTrust, verifyFinancialTrust };
