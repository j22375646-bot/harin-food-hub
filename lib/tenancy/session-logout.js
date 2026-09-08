'use strict';

const {
  parseSession,
  revokeSession,
  tokenHash,
} = require('../dashboard-auth.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TOKEN_BYTES = 16_384;
const DEFAULT_TIMEOUT_MS = 10_000;
const CONFIGURATION_ERROR = 'Exact session logout configuration is required.';
const SERVER_ONLY_ERROR = 'Session logout is server-only.';

class SessionLogoutError extends Error {
  constructor() {
    super('Logout is unavailable.');
    this.name = 'SessionLogoutError';
    this.code = 'LOGOUT_UNAVAILABLE';
    this.status = 503;
  }
}

function unavailable() {
  return new SessionLogoutError();
}

function serverOnly(message) {
  if (typeof window !== 'undefined' || typeof document !== 'undefined') {
    throw new TypeError(message);
  }
}

function exactConfiguration(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  let keys;
  let descriptors;
  try {
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (_error) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  const allowed = ['db', 'stepUpStorage', 'timeoutMs'];
  if (!keys.includes('db') || !keys.includes('stepUpStorage')
    || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  const copy = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(CONFIGURATION_ERROR);
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function capturedMethod(host, name) {
  if (host === null || !['object', 'function'].includes(typeof host)) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  try {
    for (let current = host; current !== null; current = Object.getPrototypeOf(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
        throw new TypeError(CONFIGURATION_ERROR);
      }
      return descriptor.value;
    }
  } catch (_error) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  throw new TypeError(CONFIGURATION_ERROR);
}

function createDeadline(timeoutMs) {
  const expiresAt = Date.now() + timeoutMs;
  let expired = false;

  function checkpoint() {
    if (expired || Date.now() >= expiresAt) throw unavailable();
  }

  async function dispatch(operation) {
    checkpoint();
    const remaining = Math.max(1, expiresAt - Date.now());
    let timer;
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => {
          checkpoint();
          return operation();
        }),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(unavailable());
          }, remaining);
        }),
      ]);
      checkpoint();
      return value;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({checkpoint, dispatch});
}

function createSessionLogout(configuration) {
  serverOnly(CONFIGURATION_ERROR);
  const config = exactConfiguration(configuration);
  const dbHost = config.db;
  const storageHost = config.stepUpStorage;
  const from = capturedMethod(dbHost, 'from');
  const revoke = capturedMethod(storageHost, 'revoke');
  const timeoutMs = config.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : config.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  const explicitDb = Object.freeze({
    from(...args) {
      return from.call(dbHost, ...args);
    },
  });

  async function logout(token) {
    serverOnly(SERVER_ONLY_ERROR);
    if (typeof token !== 'string' || Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) return false;

    let session;
    let hash;
    try {
      session = parseSession(token);
      if (!session) return false;
      if (!UUID.test(session.id) || !UUID.test(session.userId)) return false;
      hash = tokenHash(token);
    } catch (_error) {
      throw unavailable();
    }

    const identity = Object.freeze({
      userId: session.userId,
      sessionId: session.id,
      tokenHash: hash,
    });
    const deadline = createDeadline(timeoutMs);
    try {
      const revoked = await deadline.dispatch(() => revokeSession(token, explicitDb));
      if (revoked !== true) throw unavailable();
      deadline.checkpoint();
      const cleaned = await deadline.dispatch(() => revoke.call(storageHost, identity));
      if (cleaned !== true) throw unavailable();
      return true;
    } catch (_error) {
      throw unavailable();
    }
  }

  return Object.freeze({logout});
}

module.exports = {createSessionLogout, SessionLogoutError};
