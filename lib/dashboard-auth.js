'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const supabaseModule = require('./cafe24/supabase.js');
const { isLoginServiceRestriction } = require('./dashboard-login-request.js');

const COOKIE_NAME = 'harin_dashboard_session';
const SESSION_HOURS = 12;
const ROLES = ['VIEWER', 'OPERATOR', 'OWNER'];
const ROLE_LEVEL = Object.freeze({ VIEWER:1, OPERATOR:2, OWNER:3 });
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_AUTH_TIMEOUT_MS = 12 * 1000;
const LOGIN_FENCE_TIMEOUT_MS = 10 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTH_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_TIMESTAMP = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
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
function verifiedRequestSession(headers) {
  if (!headers || typeof headers.get !== 'function' || headers.get('x-harin-session-verified') !== '1') return null;
  const userId=text(headers.get('x-harin-user-id'));
  const username=text(headers.get('x-harin-username')).toLowerCase();
  const role=text(headers.get('x-harin-role')).toUpperCase();
  // 이 표시는 보호 경로를 통과한 Proxy가 원본 요청 값을 덮어쓴 뒤에만
  // 설정한다. 페이지는 이미 끝난 DB 세션 검증을 다시 수행하지 않는다.
  if (!userId || !username || role !== 'OWNER') return null;
  return { userId, username, role };
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

function fencedLoginError(code = 'LOGIN_AUTH_UNAVAILABLE') {
  return Object.assign(new Error(code === 'LOGIN_AUTH_TIMEOUT'
    ? '로그인 인증 서버 응답이 지연되고 있습니다.'
    : '로그인 인증 서비스를 사용할 수 없습니다.'), { status:503, code });
}
function fencedLoginConfig(sessionFence, fenceTimeoutMs) {
  if (fenceTimeoutMs !== undefined
    && (!Number.isInteger(fenceTimeoutMs) || fenceTimeoutMs < 1 || fenceTimeoutMs > 30000)) {
    throw new TypeError('fenceTimeoutMs must be an integer between 1 and 30000.');
  }
  if (sessionFence === undefined) return null;
  if (!sessionFence || typeof sessionFence.beginLogin !== 'function' || typeof sessionFence.issueSession !== 'function') {
    throw new TypeError('An explicit server session fence is required.');
  }
  return { sessionFence, timeoutMs:fenceTimeoutMs ?? LOGIN_FENCE_TIMEOUT_MS };
}
async function boundedFencedDependency(run, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      new Promise((_, reject) => {
        timer=setTimeout(() => reject(fencedLoginError()), timeoutMs);
        timer.unref?.();
      })
    ]);
  } catch (error) {
    throw fencedLoginError();
  } finally { clearTimeout(timer); }
}
function authTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const match=AUTH_TIMESTAMP.exec(value);
  if (!match) return NaN;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  if (day > [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]) return NaN;
  return Date.parse(value);
}
function validFencedProviderUser(user, profile, now = Date.now()) {
  const providerEmail=typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  const profileEmail=text(profile?.email).toLowerCase();
  const confirmedAt=authTimestamp(user?.email_confirmed_at);
  const bannedAt=[null,undefined,''].includes(user?.banned_until) ? null : authTimestamp(user.banned_until);
  return Boolean(user && UUID.test(user.id || '') && user.id === profile?.user_id
    && AUTH_EMAIL.test(providerEmail) && providerEmail === profileEmail
    && user.is_anonymous === false
    && Number.isFinite(confirmedAt) && confirmedAt <= now
    && (bannedAt === null || Number.isFinite(bannedAt) && bannedAt <= now)
    && [null,undefined,''].includes(user.deleted_at));
}

async function createDatabaseSession(profile, requestMeta = {}, db = supabaseModule.getSupabase(), {sessionFence, ticketId, fenceTimeoutMs} = {}) {
  const fence=fencedLoginConfig(sessionFence, fenceTimeoutMs);
  if (fence && (typeof ticketId !== 'string' || !UUID.test(ticketId))) {
    throw new TypeError('A valid server login ticket is required.');
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const token = createSessionToken({
    sessionId,
    userId:profile.user_id,
    username:profile.username,
    displayName:profile.display_name,
    role:profile.role,
    expiresAt
  });
  if (fence) {
    const confirmed=await boundedFencedDependency(() => fence.sessionFence.issueSession({
      userId:profile.user_id,
      ticketId,
      sessionId,
      tokenHash:tokenHash(token),
      expiresAt
    }), fence.timeoutMs);
    if (confirmed !== true) throw fencedLoginError();
    return { token, session:parseSession(token) };
  }
  const insertedPromise = db.from('dashboard_sessions').insert({
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
  const expiredSessionCleanup = db.from('dashboard_sessions').update({ revoked_at:nowIso })
    .eq('user_id', profile.user_id).is('revoked_at', null).lt('expires_at', nowIso);
  const [inserted] = await Promise.all([insertedPromise, expiredSessionCleanup]);
  if (inserted.error) throw inserted.error;
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

async function resolveRequestSession({ headers, token, db, touch = false } = {}) {
  const verified = verifiedRequestSession(headers);
  if (verified) return verified;
  return validateSession(token, { db, touch }).catch(()=>null);
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

async function authenticateAccount({ account, password, ip, userAgent }, db = supabaseModule.getSupabase(), { authClient, sessionFence, fenceTimeoutMs } = {}) {
  const fence=fencedLoginConfig(sessionFence, fenceTimeoutMs);
  const normalized = text(account).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._@+-]{2,119}$/.test(normalized) || text(password).length < 6 || String(password).length > 200) {
    throw Object.assign(new Error('계정 또는 비밀번호를 확인해주세요.'), { status:401, code:'INVALID_CREDENTIALS' });
  }
  const attemptKey = loginAttemptKey(normalized, ip);
  const profilePromise = db.from('dashboard_users').select('user_id,email,username,display_name,role,active')
    .eq(normalized.includes('@') ? 'email' : 'username', normalized).maybeSingle();
  const [, profileResult] = await Promise.all([
    assertLoginAllowed(db, attemptKey),
    profilePromise
  ]);
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data;
  const client = authClient || createAuthClient();
  const loginEmail = profile?.active ? profile.email : `invalid-${attemptKey.slice(0, 20)}@invalid.local`;
  let ticketId;
  if (fence && profile?.active) {
    ticketId=crypto.randomUUID();
    const confirmed=await boundedFencedDependency(
      () => fence.sessionFence.beginLogin({userId:profile.user_id,ticketId}),
      fence.timeoutMs
    );
    if (confirmed !== true) throw fencedLoginError();
  }
  let authResult;
  try {
    authResult=await signInWithTimeout(client, { email:loginEmail, password:String(password) }, fence?.timeoutMs);
  } catch (error) {
    if (!fence) throw error;
    if (error?.code === 'LOGIN_AUTH_TIMEOUT') throw fencedLoginError('LOGIN_AUTH_TIMEOUT');
    throw fencedLoginError();
  }
  if (fence && (!authResult || typeof authResult !== 'object')) throw fencedLoginError();
  if (authResult.error) {
    const error = authResult.error;
    const invalidCredentials = error.code === 'invalid_credentials'
      || (!error.code && Number(error.status) === 400 && error.message === 'Invalid login credentials');
    if (!invalidCredentials) {
      const restricted = isLoginServiceRestriction(error);
      throw Object.assign(new Error('로그인 인증 서비스를 사용할 수 없습니다.'), {
        status:503, code:restricted ? 'LOGIN_SERVICE_RESTRICTED' : 'LOGIN_AUTH_UNAVAILABLE'
      });
    }
  }
  if (authResult.error || !authResult.data?.user || authResult.data.user.id !== profile?.user_id
    || fence && (!authResult.data?.session || !validFencedProviderUser(authResult.data.user, profile))) {
    const blocked = await recordLoginFailure(db, attemptKey);
    throw Object.assign(new Error(blocked ? '로그인 시도가 잠시 차단되었습니다. 15분 뒤 다시 시도해주세요.' : '계정 또는 비밀번호를 확인해주세요.'), { status:blocked?429:401, code:blocked?'LOGIN_RATE_LIMITED':'INVALID_CREDENTIALS' });
  }
  let sessionProfile=profile;
  if (fence) {
    const fresh=await boundedFencedDependency(
      () => db.from('dashboard_users').select('user_id,email,username,display_name,role,active')
        .eq('user_id', profile.user_id).maybeSingle(),
      fence.timeoutMs
    );
    if (fresh?.error) throw fencedLoginError();
    sessionProfile=fresh?.data;
    if (!sessionProfile?.active || sessionProfile.user_id !== profile.user_id
      || !validFencedProviderUser(authResult.data.user, sessionProfile)) {
      const blocked=await recordLoginFailure(db, attemptKey);
      throw Object.assign(new Error(blocked ? '로그인 시도가 잠시 차단되었습니다. 15분 뒤 다시 시도해주세요.' : '계정 또는 비밀번호를 확인해주세요.'), { status:blocked?429:401, code:blocked?'LOGIN_RATE_LIMITED':'INVALID_CREDENTIALS' });
    }
  }
  // persistSession:false인 요청 전용 클라이언트이므로 원격 signOut을 기다릴 필요가 없다.
  // 이 호출은 로그인 성공 후 세션 저장을 수 분간 막을 수 있었다.
  const [sessionResult] = await Promise.all([
    createDatabaseSession(sessionProfile, { ip, userAgent }, db, fence ? {
      sessionFence:fence.sessionFence,ticketId,fenceTimeoutMs:fence.timeoutMs
    } : undefined),
    db.from('dashboard_login_attempts').delete().eq('attempt_key', attemptKey)
  ]);
  return sessionResult;
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
  requestActor, resolveRequestSession, sessionCookieOptions, signFinancialTrust, tokenHash, validateSession,
  signAiSnapshot, verifyAiSnapshot, signBidProposalSnapshot, verifyBidProposalSnapshot, signInWithTimeout,
  verifiedRequestSession, verifyFinancialTrust, verifySession
};
