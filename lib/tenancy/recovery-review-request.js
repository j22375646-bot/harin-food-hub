'use strict';

const {createRecoveryReviewResolver} = require('./recovery-review-resolver.js');
const {DashboardIdentityError} = require('./dashboard-identity.js');

const COOKIE_NAME = 'harin_dashboard_session';
const MAX_COOKIE_HEADER_BYTES = 16_384;
const MAX_COOKIE_BYTES = 4_096;
const MAX_BODY_BYTES = 4_096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9a-f]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTC_MILLISECONDS = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i;
const ACTIONS = new Set(['CONFIRM_COMPLETED', 'CLOSE_NOT_STARTED']);
const RESPONSE_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json',
  vary: 'Cookie',
  'x-content-type-options': 'nosniff',
});

class RequestFailure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code) { throw new RequestFailure(status, code); }
function unavailable() { return new RequestFailure(503, 'RECOVERY_REVIEW_UNAVAILABLE'); }

function jsonResponse(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {status, headers: {...RESPONSE_HEADERS, ...extraHeaders}});
}

function errorResponse(status, code, extraHeaders) {
  return jsonResponse(status, {ok: false, code}, extraHeaders);
}

function exactOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = ['verifySession', 'rpcClient', 'allowedOrigin', 'timeoutMs', 'now'];
  let keys;
  try { keys = Reflect.ownKeys(value); } catch (_error) { return null; }
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))
    || !['verifySession', 'rpcClient', 'allowedOrigin'].every(key => keys.includes(key))) return null;
  const result = {};
  try { for (const key of keys) result[key] = value[key]; } catch (_error) { return null; }
  return result;
}

function canonicalOrigin(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.origin === value
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash ? value : null;
  } catch (_error) { return null; }
}

function sourceAllowed(request, allowedOrigin) {
  let url;
  try { url = new URL(request.url); } catch (_error) { return false; }
  return !request.url.includes('?') && !request.url.includes('#')
    && url.origin === allowedOrigin && !url.username && !url.password && !url.search && !url.hash
    && request.headers.get('origin') === allowedOrigin
    && (!request.headers.has('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin');
}

function readClock(now) {
  let value;
  try { value = now(); } catch (_error) { throw unavailable(); }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw unavailable();
  return value;
}

function createDeadline(signal, timeoutMs, now) {
  const startedAt = readClock(now);
  const expiresAt = startedAt + timeoutMs;
  let stopped = false;
  let rejectStop;
  const stoppedPromise = new Promise((_resolve, reject) => { rejectStop = reject; });
  stoppedPromise.catch(() => {});
  const stop = () => {
    if (stopped) return;
    stopped = true;
    rejectStop(unavailable());
  };
  const timer = setTimeout(stop, timeoutMs);
  const abort = () => stop();
  signal?.addEventListener?.('abort', abort, {once: true});
  if (signal?.aborted) stop();

  function checkpoint() {
    if (stopped || signal?.aborted) throw unavailable();
    const current = readClock(now);
    if (current < startedAt || current >= expiresAt) {
      stop();
      throw unavailable();
    }
    return Math.max(1, Math.min(30_000, Math.ceil(expiresAt - current)));
  }

  return Object.freeze({
    checkpoint,
    async run(work) {
      checkpoint();
      const result = await Promise.race([Promise.resolve().then(work), stoppedPromise]);
      checkpoint();
      return result;
    },
    close() {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abort);
    },
  });
}

function contentGuards(headers) {
  const type = headers.get('content-type');
  if (typeof type !== 'string' || !CONTENT_TYPE.test(type.trim())) fail(415, 'UNSUPPORTED_MEDIA_TYPE');
  const encoding = headers.get('content-encoding');
  if (encoding !== null && !/^identity$/i.test(encoding.trim())) fail(415, 'UNSUPPORTED_MEDIA_TYPE');
  const declared = headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))) fail(400, 'INVALID_REQUEST');
    if (Number(declared) > MAX_BODY_BYTES) fail(413, 'REQUEST_TOO_LARGE');
  }
}

function cookieCredential(headers) {
  if (headers.has('authorization')) fail(401, 'AUTH_REQUIRED');
  const header = headers.get('cookie');
  if (typeof header !== 'string' || Buffer.byteLength(header, 'utf8') > MAX_COOKIE_HEADER_BYTES
    || header.includes(',')) fail(401, 'AUTH_REQUIRED');
  const values = [];
  for (const rawPart of header.split(';')) {
    const part = rawPart.trim();
    if (!part) fail(401, 'AUTH_REQUIRED');
    const separator = part.indexOf('=');
    if (separator < 1) fail(401, 'AUTH_REQUIRED');
    if (part.slice(0, separator) === COOKIE_NAME) values.push(part.slice(separator + 1));
  }
  if (values.length !== 1) fail(401, 'AUTH_REQUIRED');
  const value = values[0];
  if (!value || Buffer.byteLength(value, 'utf8') > MAX_COOKIE_BYTES
    || !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/.test(value)) fail(401, 'AUTH_REQUIRED');
  return value;
}

function cancelReader(reader) {
  try { Promise.resolve(reader.cancel()).catch(() => {}); } catch (_error) {}
  try { reader.releaseLock(); } catch (_error) {}
}

async function readBody(request, deadline) {
  if (!request.body || typeof request.body.getReader !== 'function') fail(400, 'INVALID_REQUEST');
  let reader;
  try { reader = request.body.getReader(); } catch (_error) { fail(400, 'INVALID_REQUEST'); }
  const chunks = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const result = await deadline.run(() => reader.read());
      if (!result || typeof result !== 'object') fail(400, 'INVALID_REQUEST');
      if (result.done) { complete = true; break; }
      if (!(result.value instanceof Uint8Array)) fail(400, 'INVALID_REQUEST');
      total += result.value.byteLength;
      if (total > MAX_BODY_BYTES) fail(413, 'REQUEST_TOO_LARGE');
      chunks.push(result.value);
    }
  } catch (error) {
    if (request.signal?.aborted) throw unavailable();
    throw error;
  } finally {
    if (!complete) cancelReader(reader);
    else try { reader.releaseLock(); } catch (_error) {}
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch (_error) { fail(400, 'INVALID_REQUEST'); }
}

function exactBody(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || expected.some(key => !keys.includes(key))) return null;
  const copy = {};
  for (const key of expected) copy[key] = value[key];
  return copy;
}

function normalizedUuid(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function validatedBody(text) {
  let value;
  try {
    if (!text) fail(400, 'INVALID_REQUEST');
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    fail(400, 'INVALID_REQUEST');
  }
  const mode = value && typeof value === 'object' && !Array.isArray(value) ? value.mode : null;
  const expected = mode === 'inspect' ? ['mode', 'userId', 'operationId']
    : mode === 'resolve' ? ['mode', 'userId', 'operationId', 'resolutionId', 'expectedVersion', 'action'] : [];
  const copy = expected.length ? exactBody(value, expected) : null;
  if (!copy) fail(400, 'INVALID_REQUEST');
  const userId = normalizedUuid(copy.userId);
  const operationId = normalizedUuid(copy.operationId);
  if (!userId || !operationId) fail(400, 'INVALID_REQUEST');
  if (mode === 'inspect') return Object.freeze({mode, userId, operationId});
  const resolutionId = normalizedUuid(copy.resolutionId);
  if (!resolutionId || typeof copy.expectedVersion !== 'string'
    || !VERSION.test(copy.expectedVersion) || !ACTIONS.has(copy.action)) fail(400, 'INVALID_REQUEST');
  return Object.freeze({mode, userId, operationId, resolutionId,
    expectedVersion: copy.expectedVersion, action: copy.action});
}

function canonicalUtcMilliseconds(value) {
  if (typeof value !== 'string' || !UTC_MILLISECONDS.test(value)) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : Number.NaN;
}

function identitySnapshot(value, now) {
  if (value === null || value === undefined || value === false) fail(401, 'AUTH_REQUIRED');
  const expected = ['id', 'userId', 'email', 'emailVerified', 'expiresAt'];
  let copy;
  try { copy = exactBody(value, expected); } catch (_error) { throw unavailable(); }
  if (!copy) throw unavailable();
  const id = normalizedUuid(copy.id);
  const userId = normalizedUuid(copy.userId);
  const expiresAt = canonicalUtcMilliseconds(copy.expiresAt);
  if (!id || !userId || typeof copy.email !== 'string' || copy.email.length < 3 || copy.email.length > 320
    || copy.email !== copy.email.trim() || !EMAIL.test(copy.email) || !Number.isFinite(expiresAt)) throw unavailable();
  if (typeof copy.emailVerified !== 'boolean') throw unavailable();
  if (!copy.emailVerified || expiresAt <= readClock(now)) fail(401, 'AUTH_REQUIRED');
  return Object.freeze({id, userId, email: copy.email, emailVerified: true, expiresAt: copy.expiresAt});
}

function createRecoveryReviewRequestHandler(options) {
  const config = exactOptions(options);
  if (typeof window !== 'undefined' || typeof document !== 'undefined'
    || !config || typeof config.verifySession !== 'function'
    || !config.rpcClient || typeof config.rpcClient.rpc !== 'function'
    || !canonicalOrigin(config.allowedOrigin)) {
    throw new TypeError('Explicit recovery review request server dependencies are required.');
  }
  const timeoutMs = Object.hasOwn(config, 'timeoutMs') ? config.timeoutMs : 10_000;
  const now = Object.hasOwn(config, 'now') ? config.now : Date.now;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 || typeof now !== 'function') {
    throw new TypeError('A bounded recovery review request deadline is required.');
  }
  const verifySession = config.verifySession;
  const rpcClient = config.rpcClient;
  const allowedOrigin = config.allowedOrigin;

  return async function handleRecoveryReviewRequest(request) {
    let deadline;
    try {
      if (!(request instanceof Request)) fail(400, 'INVALID_REQUEST');
      if (request.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', {allow: 'POST'});
      if (!sourceAllowed(request, allowedOrigin)) fail(403, 'SOURCE_REJECTED');
      deadline = createDeadline(request.signal, timeoutMs, now);
      contentGuards(request.headers);
      const credential = cookieCredential(request.headers);
      const body = validatedBody(await readBody(request, deadline));
      deadline.checkpoint();
      let verified;
      try { verified = await deadline.run(() => verifySession(credential)); }
      catch (error) {
        if (error instanceof DashboardIdentityError && error.code === 'AUTH_REQUIRED') fail(401, 'AUTH_REQUIRED');
        throw error;
      }
      const trusted = identitySnapshot(verified, now);
      const resolver = createRecoveryReviewResolver({rpcClient, operatorId: trusted.userId,
        timeoutMs: deadline.checkpoint()});
      deadline.checkpoint();
      const input = body.mode === 'inspect'
        ? {userId: body.userId, operationId: body.operationId}
        : {userId: body.userId, operationId: body.operationId, resolutionId: body.resolutionId,
          expectedVersion: body.expectedVersion, action: body.action};
      const data = await deadline.run(() => body.mode === 'inspect' ? resolver.inspect(input) : resolver.resolve(input));
      return jsonResponse(200, {ok: true, data});
    } catch (error) {
      if (error instanceof RequestFailure) return errorResponse(error.status, error.code);
      return errorResponse(503, 'RECOVERY_REVIEW_UNAVAILABLE');
    } finally { deadline?.close(); }
  };
}

module.exports = {createRecoveryReviewRequestHandler};
