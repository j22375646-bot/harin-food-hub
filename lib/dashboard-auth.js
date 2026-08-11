'use strict';
const crypto = require('node:crypto');
const COOKIE_NAME = 'harin_dashboard_session';
function password() { const value = process.env.DASHBOARD_PASSWORD; if (!value) throw new Error('DASHBOARD_PASSWORD is not configured'); return value; }
function sessionToken() { return crypto.createHmac('sha256', password()).update('harin-dashboard-session-v1').digest('hex'); }
function safeEqual(left, right) { const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function verifyPassword(candidate) { return safeEqual(candidate, password()); }
function verifySession(token) { return safeEqual(token, sessionToken()); }
module.exports = { COOKIE_NAME, sessionToken, verifyPassword, verifySession };
