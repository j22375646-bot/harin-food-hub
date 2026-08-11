'use strict';

const crypto = require('node:crypto');
const { getConfig } = require('./config.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastRequestAt = 0;

function signedDate(now = new Date()) {
  return now.toISOString().slice(2, 19).replace(/[-:]/g, '') + 'Z';
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.append(key, String(value));
  }
  return query.toString();
}

function createAuthorization({ method, path, query = '', accessKey, secretKey, now = new Date() }) {
  const datetime = signedDate(now);
  const message = `${datetime}${method.toUpperCase()}${path}${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

async function throttle(minInterval = 250) {
  const remaining = minInterval - (Date.now() - lastRequestAt);
  if (remaining > 0) await wait(remaining);
  lastRequestAt = Date.now();
}

async function request(method, path, params = {}, options = {}) {
  const config = getConfig();
  const query = queryString(params);
  const url = `${config.baseUrl}${path}${query ? `?${query}` : ''}`;
  const maxAttempts = options.maxAttempts || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await throttle(options.minInterval || 250);
    const authorization = createAuthorization({ method, path, query, accessKey: config.accessKey, secretKey: config.secretKey });
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json;charset=UTF-8',
          'X-EXTENDED-TIMEOUT': '90000',
          'X-Requested-By': config.vendorId
        },
        ...(options.rawBody !== undefined ? { body: options.rawBody } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(options.timeout || 95000)
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 1000) }; }
      if (!response.ok) {
        const error = new Error(`Coupang API ${response.status}: ${data.message || data.error || 'request failed'}`);
        error.status = response.status;
        error.response = data;
        if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
          lastError = error;
          await wait(700 * (2 ** (attempt - 1)));
          continue;
        }
        throw error;
      }
      return { status: response.status, data };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && (error.name === 'TimeoutError' || error.name === 'TypeError')) {
        await wait(700 * (2 ** (attempt - 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Coupang API request failed');
}

module.exports = { request, signedDate, queryString, createAuthorization };
