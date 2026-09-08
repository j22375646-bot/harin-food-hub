'use strict';

const {canonicalizeTrustedClientIp} = require('./auth-client-ip.js');
const {createAuthRequestAdmission} = require('./auth-request-admission.js');
const {
  validateAuthHmacKey,
  validateAuthRequestInput,
} = require('./auth-request-limit.js');

const DEFAULT_TIMEOUT_MS = 10_000;
const CONFIGURATION_ERROR = 'Exact Vercel auth request admission configuration is required.';

class AuthIngressError extends Error {
  constructor() {
    super('Authentication ingress is unavailable.');
    this.name = 'AuthIngressError';
    this.code = 'AUTH_INGRESS_UNAVAILABLE';
    this.status = 503;
  }
}

function unavailable() {
  return new AuthIngressError();
}

function trustedRuntime() {
  return typeof window === 'undefined'
    && typeof document === 'undefined'
    && process.env.VERCEL === '1'
    && process.env.VERCEL_ENV === 'production';
}

function configurationFailure() {
  return new TypeError(CONFIGURATION_ERROR);
}

function exactConfiguration(value) {
  if (!trustedRuntime() || value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw configurationFailure();
  }
  let keys;
  let descriptors;
  try {
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (_error) {
    throw configurationFailure();
  }
  const required = ['rpcClient', 'hmacKey', 'ingress'];
  const allowed = [...required, 'timeoutMs'];
  if (required.some(key => !keys.includes(key))
    || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) {
    throw configurationFailure();
  }
  const copy = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw configurationFailure();
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function capturedMethod(host, name) {
  if (host === null || !['object', 'function'].includes(typeof host)) {
    throw configurationFailure();
  }
  try {
    for (let current = host; current !== null; current = Object.getPrototypeOf(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
        throw configurationFailure();
      }
      const method = descriptor.value;
      return (...args) => Reflect.apply(method, host, args);
    }
  } catch (_error) {
    throw configurationFailure();
  }
  throw configurationFailure();
}

function selectedIp(headers, name, required) {
  const value = headers.get(name);
  if (value === null) {
    if (required) throw unavailable();
    return null;
  }
  if (value.length < 1 || value.length > 64 || value.includes(',')) throw unavailable();
  return canonicalizeTrustedClientIp(value);
}

function trustedClientIp(request) {
  const vercelIp = selectedIp(request.headers, 'x-vercel-forwarded-for', true);
  const forwardedIp = selectedIp(request.headers, 'x-forwarded-for', true);
  const realIp = selectedIp(request.headers, 'x-real-ip', false);
  if (vercelIp !== forwardedIp || realIp !== null && realIp !== vercelIp) throw unavailable();
  return vercelIp;
}

function checkpoint(signal) {
  if (!trustedRuntime() || signal.aborted) throw unavailable();
}

function requestRpcDependency(rpc, signal) {
  return Object.freeze({
    async rpc(name, args) {
      checkpoint(signal);
      const result = await rpc(name, args);
      checkpoint(signal);
      return result;
    },
  });
}

function createVercelAuthRequestAdmission(configuration) {
  let config;
  let rpc;
  let hmacKey;
  let timeoutMs;
  try {
    config = exactConfiguration(configuration);
    if (config.ingress !== 'vercel-direct') throw configurationFailure();
    timeoutMs = Object.hasOwn(config, 'timeoutMs') ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
      throw configurationFailure();
    }
    hmacKey = validateAuthHmacKey(config.hmacKey);
    rpc = capturedMethod(config.rpcClient, 'rpc');
  } catch (_error) {
    throw configurationFailure();
  }

  return async function admit(request, input) {
    try {
      if (!trustedRuntime() || !(request instanceof Request)) throw unavailable();
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || request.signal.aborted) throw unavailable();
      const validated = validateAuthRequestInput(input);
      const copiedInput = Object.freeze({kind: validated.kind, subject: validated.subject});
      const canonicalIp = trustedClientIp(request);
      const signal = request.signal;
      checkpoint(signal);
      const admission = createAuthRequestAdmission({
        rpcClient: requestRpcDependency(rpc, signal),
        hmacKey,
        trustedClientIp: canonicalIp,
        timeoutMs,
      });
      const result = await admission(copiedInput);
      checkpoint(signal);
      return result;
    } catch (_error) {
      throw unavailable();
    }
  };
}

module.exports = {createVercelAuthRequestAdmission, AuthIngressError};
