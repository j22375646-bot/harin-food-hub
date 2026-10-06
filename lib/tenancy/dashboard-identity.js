'use strict';

/**
 * Server-composed bridge from the existing signed dashboard session to the
 * narrow identity contract consumed by the tenant control store.
 */

const dashboardAuth = require('../dashboard-auth.js');
const {performance}=require('node:perf_hooks');

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_CREDENTIAL_LENGTH = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

class DashboardIdentityError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'DashboardIdentityError';
    this.code = code;
    this.status = status;
  }
}

function failAuthentication() {
  throw new DashboardIdentityError('AUTH_REQUIRED', 401, 'Authentication is required.');
}

function failUnavailable() {
  throw new DashboardIdentityError(
    'IDENTITY_UNAVAILABLE',
    503,
    'Identity verification is unavailable.'
  );
}

function validUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function currentTime(now) {
  let value;
  try {
    value = Number(now());
  } catch (_error) {
    failUnavailable();
  }
  if (!Number.isFinite(value)) failUnavailable();
  return value;
}

function parseIsoTimestamp(value) {
  if (typeof value !== 'string') return Number.NaN;
  const matched = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!matched) return Number.NaN;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return Number.NaN;
  return Date.parse(value);
}

function sessionSnapshot(value, now) {
  if (!value || typeof value !== 'object'
    || !validUuid(value.id)
    || !validUuid(value.userId)
    || typeof value.expiresAt !== 'string') {
    failAuthentication();
  }
  const expiry = parseIsoTimestamp(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) failAuthentication();
  return Object.freeze({
    id: value.id,
    userId: value.userId,
    expiry,
  });
}

function optionalTimestamp(value) {
  if (value === null || value === undefined) return null;
  const parsed = parseIsoTimestamp(value);
  if (!Number.isFinite(parsed)) failAuthentication();
  return parsed;
}

function browserRuntime() {
  return typeof window !== 'undefined' || typeof document !== 'undefined';
}

function timeoutError() {
  return new DashboardIdentityError(
    'IDENTITY_UNAVAILABLE',
    503,
    'Identity verification is unavailable.'
  );
}

async function bounded(work, timeoutMs) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(timeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function createDashboardIdentityVerifier({
  db,
  authAdmin,
  validateSession = dashboardAuth.validateSession,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!db || typeof db.from !== 'function'
    || !authAdmin || typeof authAdmin.getUserById !== 'function'
    || typeof validateSession !== 'function'
    || typeof now !== 'function'
    || typeof timeoutMs !== 'number'
    || !Number.isFinite(timeoutMs)
    || timeoutMs <= 0) {
    throw new TypeError('Trusted server identity dependencies are required.');
  }

  return async function verifySession(opaqueCredential, options = {}) {
    const check = () => { if (options.signal?.aborted || options.deadline !== undefined && (!Number.isFinite(options.deadline) || performance.now() >= options.deadline)) failUnavailable(); };
    check();
    if (browserRuntime()) failUnavailable();
    if (typeof opaqueCredential !== 'string'
      || opaqueCredential.length === 0
      || opaqueCredential.length > MAX_CREDENTIAL_LENGTH
      || opaqueCredential !== opaqueCredential.trim()) {
      failAuthentication();
    }

    try {
      return await bounded(async () => {
        check();
        const firstResult = await validateSession(opaqueCredential, { db, touch: false, signal: options.signal, deadline: options.deadline });
        check();
        const first = sessionSnapshot(firstResult, currentTime(now));

        const profileResult = await db.from('dashboard_users')
          .select('user_id,email,active')
          .eq('user_id', first.userId)
          .maybeSingle();
        check();
        if (profileResult?.error) failUnavailable();
        const profile = profileResult?.data;
        if (!profile || typeof profile !== 'object') failAuthentication();
        const profileSnapshot = Object.freeze({
          userId: profile.user_id,
          email: normalizeEmail(profile.email),
          active: profile.active,
        });
        if (profileSnapshot.userId !== first.userId
          || profileSnapshot.active !== true
          || !profileSnapshot.email) {
          failAuthentication();
        }

        check();
        const authResult = await authAdmin.getUserById(first.userId);
        check();
        if (authResult?.error) failUnavailable();
        const user = authResult?.data?.user;
        if (!user || typeof user !== 'object') failAuthentication();
        const authSnapshot = Object.freeze({
          id: user.id,
          email: normalizeEmail(user.email),
          isAnonymous: user.is_anonymous,
          deletedAt: user.deleted_at,
          bannedUntil: user.banned_until,
          emailConfirmedAt: user.email_confirmed_at,
        });
        if (authSnapshot.id !== first.userId
          || authSnapshot.isAnonymous !== false
          || (authSnapshot.deletedAt !== null
            && authSnapshot.deletedAt !== undefined
            && authSnapshot.deletedAt !== '')
          || !authSnapshot.email
          || authSnapshot.email !== profileSnapshot.email) {
          failAuthentication();
        }

        const authNow = currentTime(now);
        const bannedUntil = optionalTimestamp(authSnapshot.bannedUntil);
        if (bannedUntil !== null && bannedUntil > authNow) failAuthentication();
        const confirmedAt = optionalTimestamp(authSnapshot.emailConfirmedAt);
        if (confirmedAt !== null && confirmedAt > authNow) failAuthentication();

        check();
        const secondResult = await validateSession(opaqueCredential, { db, touch: false, signal: options.signal, deadline: options.deadline });
        check();
        const finalNow = currentTime(now);
        const second = sessionSnapshot(secondResult, finalNow);
        if (second.id !== first.id || second.userId !== first.userId) failAuthentication();
        const expiry = Math.min(first.expiry, second.expiry);
        if (expiry <= finalNow) failAuthentication();

        return Object.freeze({
          id: first.id,
          userId: first.userId,
          email: authSnapshot.email,
          emailVerified: confirmedAt !== null,
          expiresAt: new Date(expiry).toISOString(),
        });
      }, timeoutMs);
    } catch (error) {
      if (error instanceof DashboardIdentityError) throw error;
      failUnavailable();
    }
  };
}

module.exports = {
  createDashboardIdentityVerifier,
  DashboardIdentityError,
};
