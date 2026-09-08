'use strict';

const {performance} = require('node:perf_hooks');

const COOKIE_NAME = 'harin_dashboard_session';
const MAX_COOKIE_HEADER_BYTES = 16_384;
const DEFAULT_TIMEOUT_MS = 10_000;
const CONFIGURATION_ERROR = 'Exact session logout request configuration is required.';
const RESPONSE_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json',
  pragma: 'no-cache',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
});
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_VALUE_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
const SIGNED_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

class RequestFailure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code) {
  throw new RequestFailure(status, code);
}

function serverEnvironment() {
  return typeof window === 'undefined' && typeof document === 'undefined';
}

function exactConfiguration(value) {
  let array;
  try { array = Array.isArray(value); } catch (_error) { throw new TypeError(CONFIGURATION_ERROR); }
  if (value === null || typeof value !== 'object' || array) {
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
  const allowed = ['allowedOrigins', 'logout', 'timeoutMs'];
  if (!keys.includes('allowedOrigins') || !keys.includes('logout')
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

function canonicalOrigin(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value
      && !url.username && !url.password && url.pathname === '/'
      && !url.search && !url.hash;
  } catch (_error) {
    return false;
  }
}

function copyAllowedOrigins(value) {
  let array;
  let length;
  let keys;
  let descriptors;
  try {
    array = Array.isArray(value);
    length = value.length;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (_error) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  if (!array || !Number.isInteger(length) || length < 1 || length > 16) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  const expected = Array.from({length}, (_unused, index) => String(index));
  if (keys.length !== expected.length + 1 || keys[keys.length - 1] !== 'length'
    || expected.some(key => !keys.includes(key))) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  const origins = [];
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
      || !canonicalOrigin(descriptor.value)) {
      throw new TypeError(CONFIGURATION_ERROR);
    }
    origins.push(descriptor.value);
  }
  if (new Set(origins).size !== origins.length) throw new TypeError(CONFIGURATION_ERROR);
  return Object.freeze(origins);
}

function jsonResponse(status, payload, headers) {
  return new Response(JSON.stringify(payload), {status, headers: {...RESPONSE_HEADERS, ...headers}});
}

function errorResponse(status, code, headers) {
  return jsonResponse(status, {ok: false, code}, headers);
}

function sourceAllowed(request, allowedOrigins) {
  let url;
  let declared;
  try {
    url = new URL(request.url);
    declared = request.headers.get('origin');
  } catch (_error) {
    return false;
  }
  if (!allowedOrigins.includes(url.origin) || !canonicalOrigin(declared)
    || declared !== url.origin || !allowedOrigins.includes(declared)) return false;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin';
}

function bodyless(request) {
  if (request.body !== null) fail(400, 'INVALID_REQUEST');
  const length = request.headers.get('content-length');
  if (length !== null && length !== '0') fail(400, 'INVALID_REQUEST');
  if (request.headers.has('transfer-encoding') || request.headers.has('content-encoding')) {
    fail(400, 'INVALID_REQUEST');
  }
}

function cookieCredential(headers) {
  if (headers.has('authorization')) fail(401, 'AUTH_REQUIRED');
  const cookie = headers.get('cookie');
  if (typeof cookie !== 'string' || Buffer.byteLength(cookie, 'utf8') > MAX_COOKIE_HEADER_BYTES
    || cookie.includes(',')) fail(401, 'AUTH_REQUIRED');
  const targets = [];
  for (const raw of cookie.split(';')) {
    const pair = raw.replace(/^[ \t]+/, '');
    if (!pair) fail(401, 'AUTH_REQUIRED');
    const separator = pair.indexOf('=');
    if (separator < 1) fail(401, 'AUTH_REQUIRED');
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!COOKIE_NAME_PATTERN.test(name) || !COOKIE_VALUE_PATTERN.test(value)) {
      fail(401, 'AUTH_REQUIRED');
    }
    if (name === COOKIE_NAME) targets.push(value);
  }
  if (targets.length !== 1 || !SIGNED_TOKEN_PATTERN.test(targets[0]) || targets[0].includes('%')) {
    fail(401, 'AUTH_REQUIRED');
  }
  return targets[0];
}

function createDeadline(signal, timeoutMs) {
  const expiresAt = performance.now() + timeoutMs;
  let stopped = false;
  let rejectStop;
  const stoppedPromise = new Promise((_resolve, reject) => { rejectStop = reject; });
  stoppedPromise.catch(() => {});
  const stop = () => {
    if (stopped) return;
    stopped = true;
    rejectStop(new RequestFailure(503, 'LOGOUT_UNAVAILABLE'));
  };
  const timer = setTimeout(stop, timeoutMs);
  const abort = () => stop();
  signal.addEventListener('abort', abort, {once: true});
  if (signal.aborted || performance.now() >= expiresAt) stop();

  function checkpoint() {
    if (stopped || signal.aborted || performance.now() >= expiresAt) {
      stop();
      fail(503, 'LOGOUT_UNAVAILABLE');
    }
  }

  return Object.freeze({
    checkpoint,
    async run(operation) {
      checkpoint();
      const result = await Promise.race([
        Promise.resolve().then(() => {
          checkpoint();
          return operation();
        }),
        stoppedPromise,
      ]);
      checkpoint();
      return result;
    },
    close() {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    },
  });
}

function createSessionLogoutRequestHandler(configuration) {
  if (!serverEnvironment()) throw new TypeError(CONFIGURATION_ERROR);
  const config = exactConfiguration(configuration);
  if (typeof config.logout !== 'function') throw new TypeError(CONFIGURATION_ERROR);
  const allowedOrigins = copyAllowedOrigins(config.allowedOrigins);
  const timeoutMs = Object.hasOwn(config, 'timeoutMs') ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  const logout = config.logout;

  return async function handleSessionLogoutRequest(request) {
    let deadline;
    try {
      if (!(request instanceof Request)) fail(400, 'INVALID_REQUEST');
      if (request.method !== 'POST') {
        return errorResponse(405, 'METHOD_NOT_ALLOWED', {allow: 'POST'});
      }
      if (!serverEnvironment()) fail(503, 'LOGOUT_UNAVAILABLE');
      if (request.signal.aborted) fail(503, 'LOGOUT_UNAVAILABLE');
      deadline = createDeadline(request.signal, timeoutMs);
      if (!sourceAllowed(request, allowedOrigins)) fail(403, 'SOURCE_NOT_ALLOWED');
      bodyless(request);
      const token = cookieCredential(request.headers);
      deadline.checkpoint();
      // This deadline bounds the response only: remote logout work can still complete after a 503.
      const result = await deadline.run(() => logout(token));
      if (result === false) fail(401, 'AUTH_REQUIRED');
      if (result !== true) fail(503, 'LOGOUT_UNAVAILABLE');
      return jsonResponse(200, {ok: true}, {
        'set-cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      });
    } catch (error) {
      if (error instanceof RequestFailure) return errorResponse(error.status, error.code);
      return errorResponse(503, 'LOGOUT_UNAVAILABLE');
    } finally {
      deadline?.close();
    }
  };
}

module.exports = {createSessionLogoutRequestHandler};
