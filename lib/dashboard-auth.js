'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const supabaseModule = require('./cafe24/supabase.js');

const COOKIE_NAME = 'harin_dashboard_session';
const SESSION_HOURS = 12;
const ROLES = ['VIEWER', 'OPERATOR', 'OWNER'];
const ROLE_LEVEL = Object.freeze({ VIEWER:1, OPERATOR:2, OWNER:3 });
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_AUTH_TIMEOUT_MS = 12 * 1000;
const DEVELOPMENT_OWNER_SESSION = Object.freeze({
  id:'local-development-session',
  userId:'local-development-owner',
  username:'local-owner',
  displayName:'로컬 개발 OWNER',
  role:'OWNER',
  expiresAt:'9999-12-31T23:59:59.999Z'
});

function text(value) { return value == null ? '' : String(value).trim(); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function secretSource(previous = false) {
  const value = previous
    ? process.env.DASHBOARD_SESSION_SECRET_PREVIOUS
    : process.env.DASHBOARD_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('DASHBOARD_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY is required');
  return value;
}
function signingKey(scope, previous = false) {
  return crypto.createHash('sha256').update(`harin-dashboard-${scope}-v2\0${secretSource(previous)}`).digest();
}
function signature(scope, value, previous = false) {
  return crypto.createHmac('sha256', signingKey(scope, previous)).update(String(value)).digest('base64url');
}
function verifySignature(scope, value, provided) {
  if (safeEqual(provided, signature(scope, value))) return true;
  if (!process.env.DASHBOARD_SESSION_SECRET_PREVIOUS) return false;
  return safeEqual(provided, signature(scope, value, true));
}
function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
function normalizeRole(value) {
  const role = text(value).toUpperCase();
  if (!ROLES.includes(role)) throw Object.assign(new Error('지원하지 않는 계정 권한입니다.'), { status:400, code:'INVALID_ROLE' });
  return role;
}
function hasRole(session, allowed = ROLES) {
  return Boolean(session && allowed.map(normalizeRole).includes(session.role));
}
function roleAtLeast(session, minimum) {
  return Number(ROLE_LEVEL[session?.role] || 0) >= Number(ROLE_LEVEL[normalizeRole(minimum)] || 0);
}
function developmentAuthBypassEnabled(env = process.env) {
  return env?.NODE_ENV === 'development' && env?.HARIN_DEV_AUTH_BYPASS === '1';
}
function developmentOwnerSession() {
  return developmentAuthBypassEnabled() ? { ...DEVELOPMENT_OWNER_SESSION } : null;
}

function createSessionToken({ sessionId = crypto.randomUUID(), userId = crypto.randomUUID(), username = 'test-owner', displayName = '테스트 OWNER', role = 'OWNER', expiresAt } = {}) {
  const now = Date.now();
  const payload = {
    v:2,
    sid:String(sessionId),
    sub:String(userId),
    usr:text(username).toLowerCase(),
    name:text(displayName).slice(0, 80),
    role:normalizeRole(role),
    iat:Math.floor(now / 1000),
    exp:Math.floor((expiresAt ? new Date(expiresAt).getTime() : now + SESSION_HOURS * 60 * 60 * 1000) / 1000)
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature('session', encoded)}`;
}

function parseSession(token, now = Date.now()) {
  const [encoded, provided, extra] = String(token || '').split('.');
  if (!encoded || !provided || extra || !verifySignature('session', encoded, provided)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.v !== 2 || !payload.sid || !payload.sub || !payload.usr || !ROLES.includes(payload.role)) return null;
    if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= Number(now)) return null;
    return { id:payload.sid, userId:payload.sub, username:payload.usr, displayName:payload.name, role:payload.role, expiresAt:new Date(payload.exp * 1000).toISOString() };
  } catch { return null; }
}

function verifySession(token, now) {
  return developmentAuthBypassEnabled() || Boolean(parseSession(token, now));
}
function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value=>value.trim())
    .find(value=>value.startsWith(`${COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}
function sessionCookieOptions(maxAge = SESSION_HOURS * 60 * 60, {secure=true} = {}) {
  return { httpOnly:true, secure:Boolean(secure), sameSite:'lax', path:'/', maxAge };
}

function createAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the server');
  return createClient(url, key, { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } });
}

async function signInWithTimeout(client, credentials, timeoutMs = LOGIN_AUTH_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(
      new Error('로그인 인증 서버 응답이 지연되고 있습니다.'),
      { status:503, code:'LOGIN_AUTH_TIMEOUT' }
    )), Math.max(1, Number(timeoutMs) || LOGIN_AUTH_TIMEOUT_MS));
    timer.unref?.();
  });
  try {
    return await Promise.race([client.auth.signInWithPassword(credentials), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function createDatabaseSession(profile, requestMeta = {}, db = supabaseModule.getSupabase()) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const token = createSessionToken({
    sessionId,
    userId:profile.user_id,
    username:profile.username,
    displayName:profile.display_name,
    role:profile.role,
    expiresAt
  });
  const inserted = await db.from('dashboard_sessions').insert({
    id:sessionId,
    user_id:profile.user_id,
    token_hash:tokenHash(token),
    username:profile.username,
    display_name:profile.display_name,
    role:profile.role,
    expires_at:expiresAt,
    ip_hash:requestMeta.ip ? tokenHash(`ip\0${requestMeta.ip}`) : null,
    user_agent:text(requestMeta.userAgent).slice(0, 300) || null
  });
  if (inserted.error) throw inserted.error;
  await db.from('dashboard_sessions').update({ revoked_at:new Date().toISOString() })
    .eq('user_id', profile.user_id).is('revoked_at', null).lt('expires_at', new Date().toISOString());
  return { token, session:parseSession(token) };
}

async function validateSession(token, { db, touch = false } = {}) {
  const developmentSession = developmentOwnerSession();
  if (developmentSession) return developmentSession;
  const local = parseSession(token);
  if (!local) return null;
  const database = db || supabaseModule.getSupabase();
  const found = await database.from('dashboard_sessions')
    .select('id,user_id,username,display_name,role,expires_at,revoked_at,last_seen_at,token_hash')
    .eq('id', local.id).eq('token_hash', tokenHash(token)).maybeSingle();
  if (found.error) throw found.error;
  const row = found.data;
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.user_id !== local.userId || row.username !== local.username || row.role !== local.role) return null;
  if (touch && Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
    await database.from('dashboard_sessions').update({ last_seen_at:new Date().toISOString() }).eq('id', row.id).is('revoked_at', null);
  }
  return { id:row.id, userId:row.user_id, username:row.username, displayName:row.display_name, role:row.role, expiresAt:row.expires_at };
}

async function revokeSession(token, db = supabaseModule.getSupabase()) {
  const session = parseSession(token);
  if (!session) return false;
  const result = await db.from('dashboard_sessions').update({ revoked_at:new Date().toISOString() })
    .eq('id', session.id).eq('token_hash', tokenHash(token)).is('revoked_at', null);
  if (result.error) throw result.error;
  return true;
}

async function revokeUserSessions(userId, db = supabaseModule.getSupabase()) {
  const result = await db.from('dashboard_sessions').update({ revoked_at:new Date().toISOString() })
    .eq('user_id', userId).is('revoked_at', null);
  if (result.error) throw result.error;
}

function loginAttemptKey(account, ip) {
  return tokenHash(`login\0${text(account).toLowerCase()}\0${text(ip)}`);
}
async function loginAttempt(db, key) {
  const result = await db.from('dashboard_login_attempts').select('*').eq('attempt_key', key).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
async function assertLoginAllowed(db, key) {
  const row = await loginAttempt(db, key);
  if (row?.blocked_until && new Date(row.blocked_until).getTime() > Date.now()) {
    throw Object.assign(new Error('로그인 시도가 잠시 차단되었습니다. 15분 뒤 다시 시도해주세요.'), { status:429, code:'LOGIN_RATE_LIMITED' });
  }
}
async function recordLoginFailure(db, key) {
  const now = Date.now();
  const row = await loginAttempt(db, key);
  const inWindow = row && now - new Date(row.window_started_at).getTime() < LOGIN_WINDOW_MS;
  const failedCount = inWindow ? Number(row.failed_count || 0) + 1 : 1;
  const values = {
    attempt_key:key,
    failed_count:failedCount,
    window_started_at:inWindow ? row.window_started_at : new Date(now).toISOString(),
    last_attempt_at:new Date(now).toISOString(),
    blocked_until:failedCount >= LOGIN_MAX_FAILURES ? new Date(now + LOGIN_WINDOW_MS).toISOString() : null
  };
  const saved = await db.from('dashboard_login_attempts').upsert(values, { onConflict:'attempt_key' });
  if (saved.error) throw saved.error;
  return failedCount >= LOGIN_MAX_FAILURES;
}

async function authenticateAccount({ account, password, ip, userAgent }, db = supabaseModule.getSupabase()) {
  const normalized = text(account).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._@+-]{2,119}$/.test(normalized) || text(password).length < 6 || String(password).length > 200) {
    throw Object.assign(new Error('계정 또는 비밀번호를 확인해주세요.'), { status:401, code:'INVALID_CREDENTIALS' });
  }
  const attemptKey = loginAttemptKey(normalized, ip);
  await assertLoginAllowed(db, attemptKey);
  const profileResult = await db.from('dashboard_users').select('user_id,email,username,display_name,role,active')
    .eq(normalized.includes('@') ? 'email' : 'username', normalized).maybeSingle();
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data;
  const client = createAuthClient();
  const loginEmail = profile?.active ? profile.email : `invalid-${attemptKey.slice(0, 20)}@invalid.local`;
  const authResult = await signInWithTimeout(client, { email:loginEmail, password:String(password) });
  if (authResult.error || !authResult.data?.user || authResult.data.user.id !== profile?.user_id) {
    const blocked = await recordLoginFailure(db, attemptKey);
    throw Object.assign(new Error(blocked ? '로그인 시도가 잠시 차단되었습니다. 15분 뒤 다시 시도해주세요.' : '계정 또는 비밀번호를 확인해주세요.'), { status:blocked?429:401, code:blocked?'LOGIN_RATE_LIMITED':'INVALID_CREDENTIALS' });
  }
  await db.from('dashboard_login_attempts').delete().eq('attempt_key', attemptKey);
  // persistSession:false인 요청 전용 클라이언트이므로 원격 signOut을 기다릴 필요가 없다.
  // 이 호출은 로그인 성공 후 세션 저장을 수 분간 막을 수 있었다.
  return createDatabaseSession(profile, { ip, userAgent }, db);
}

function actor(session) {
  return session ? `${session.username}:${session.userId}`.slice(0, 100) : 'unauthenticated';
}
function requestActor(request) {
  const username=text(request.headers.get('x-harin-username')) || 'unknown';
  const userId=text(request.headers.get('x-harin-user-id')) || 'unknown';
  return `${username}:${userId}`.slice(0, 100);
}

function signFinancialTrust(trust = {}, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    scope:'financial-trust',
    exp:Number(now) + 10 * 60 * 1000,
    formula_version:trust.formula_version || null,
    allowed_cpc:trust.allowed?.allowed_cpc === true,
    financial_actions:trust.status === 'READY' && trust.allowed?.allowed_cpc === true && trust.allowed?.bid_increase === true
  })).toString('base64url');
  return `${payload}.${signature('financial-trust', payload)}`;
}
function verifyFinancialTrust(token, now = Date.now()) {
  const [payload, provided, extra] = String(token || '').split('.');
  if (!payload || !provided || extra || !verifySignature('financial-trust', payload, provided)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.scope !== 'financial-trust' || !Number.isFinite(parsed.exp) || parsed.exp < Number(now)) return null;
    return parsed;
  } catch { return null; }
}

function signAiSnapshot(snapshot, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    scope:'ai-analysis',
    exp:Number(now) + 30 * 60 * 1000,
    snapshot
  })).toString('base64url');
  return `${payload}.${signature('ai-analysis', payload)}`;
}

function verifyAiSnapshot(token, now = Date.now()) {
  const [payload, provided, extra] = String(token || '').split('.');
  if (!payload || !provided || extra || !verifySignature('ai-analysis', payload, provided)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.scope !== 'ai-analysis' || !Number.isFinite(parsed.exp) || parsed.exp < Number(now) || !parsed.snapshot) return null;
    return parsed.snapshot;
  } catch { return null; }
}

function signBidProposalSnapshot(snapshot, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    scope:'naver-bid-proposal',
    exp:Number(now) + 20 * 60 * 1000,
    snapshot
  })).toString('base64url');
  return `${payload}.${signature('naver-bid-proposal', payload)}`;
}

function verifyBidProposalSnapshot(token, now = Date.now()) {
  const [payload, provided, extra] = String(token || '').split('.');
  if (!payload || !provided || extra || !verifySignature('naver-bid-proposal', payload, provided)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.scope !== 'naver-bid-proposal' || !Number.isFinite(parsed.exp) || parsed.exp < Number(now) || parsed.snapshot?.scope !== 'naver-bid-proposal') return null;
    return parsed.snapshot;
  } catch { return null; }
}

module.exports = {
  COOKIE_NAME, ROLES, ROLE_LEVEL, SESSION_HOURS,
  actor, authenticateAccount, cookieValue, createAuthClient, createDatabaseSession, createSessionToken,
  developmentAuthBypassEnabled, developmentOwnerSession,
  hasRole, normalizeRole, parseSession, revokeSession, revokeUserSessions, roleAtLeast,
  requestActor, sessionCookieOptions, signFinancialTrust, tokenHash, validateSession,
  signAiSnapshot, verifyAiSnapshot, signBidProposalSnapshot, verifyBidProposalSnapshot, signInWithTimeout,
  verifyFinancialTrust, verifySession
};
