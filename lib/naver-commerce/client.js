'use strict';

const bcrypt = require('bcryptjs');

const BASE_URL = 'https://api.commerce.naver.com/external';
const TOKEN_URL = `${BASE_URL}/v1/oauth2/token`;
let cachedToken = null;

const text = value => value == null ? '' : String(value).trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function getConfig(env = process.env) {
  const clientId = text(env.NAVER_COMMERCE_CLIENT_ID);
  const clientSecret = text(env.NAVER_COMMERCE_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    const error = new Error('네이버 커머스 API Client ID와 Secret이 고정 IP 서버에 필요합니다.');
    error.code = 'NAVER_COMMERCE_CONFIG_REQUIRED';
    error.status = 503;
    throw error;
  }
  const tokenType = text(env.NAVER_COMMERCE_TOKEN_TYPE || 'SELF').toUpperCase();
  if (!['SELF', 'SELLER'].includes(tokenType)) throw new Error('NAVER_COMMERCE_TOKEN_TYPE은 SELF 또는 SELLER여야 합니다.');
  const accountId = text(env.NAVER_COMMERCE_ACCOUNT_ID);
  if (tokenType === 'SELLER' && !accountId) throw new Error('SELLER 토큰에는 NAVER_COMMERCE_ACCOUNT_ID가 필요합니다.');
  return {
    clientId,
    clientSecret,
    tokenType,
    accountId,
    writeEnabled: text(env.NAVER_COMMERCE_WRITE_ENABLED).toLowerCase() === 'true'
  };
}

function createSecretSign({ clientId, clientSecret, timestamp }) {
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  return Buffer.from(hashed, 'utf8').toString('base64');
}

async function getAccessToken(config = getConfig(), options = {}) {
  const now = Date.now();
  if (!options.force && cachedToken?.key === `${config.tokenType}:${config.accountId}` && cachedToken.expiresAt - now > 60_000) return cachedToken.value;
  const timestamp = String(now);
  const body = new URLSearchParams({
    client_id: config.clientId,
    timestamp,
    client_secret_sign: createSecretSign({ clientId:config.clientId, clientSecret:config.clientSecret, timestamp }),
    grant_type: 'client_credentials',
    type: config.tokenType
  });
  if (config.tokenType === 'SELLER') body.set('account_id', config.accountId);
  const response = await fetch(TOKEN_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json' },
    body,
    cache:'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.message || payload.error_description || `네이버 커머스 인증 실패 (${response.status})`);
    error.status = response.status;
    error.code = payload.code || payload.error || 'NAVER_COMMERCE_TOKEN_FAILED';
    error.response = payload;
    throw error;
  }
  cachedToken = {
    key:`${config.tokenType}:${config.accountId}`,
    value:payload.access_token,
    expiresAt:now + Math.max(60, Number(payload.expires_in || 10800)) * 1000
  };
  return cachedToken.value;
}

async function request(method, pathname, options = {}) {
  const config = options.config || getConfig();
  const url = new URL(`${BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  let accessToken = await getAccessToken(config);
  let refreshedAuth = false;
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 4));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers:{
        Authorization:`Bearer ${accessToken}`,
        Accept:'application/json;charset=UTF-8',
        ...(options.body === undefined ? {} : { 'Content-Type':'application/json' })
      },
      body:options.body === undefined ? undefined : JSON.stringify(options.body),
      cache:'no-store'
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) return { status:response.status, data:payload };
    if (response.status === 401 && !refreshedAuth) {
      refreshedAuth = true;
      accessToken = await getAccessToken(config, { force:true });
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts - 1) {
      const retryAfterSeconds = Number(response.headers?.get?.('retry-after'));
      const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(10_000, retryAfterSeconds * 1000)
        : Math.min(8_000, 750 * (2 ** attempt));
      await sleep(retryDelay);
      continue;
    }
    const error = new Error(payload?.message || payload?.error_description || `네이버 커머스 API 실패 (${response.status})`);
    error.status = response.status;
    error.code = payload?.code || 'NAVER_COMMERCE_API_FAILED';
    error.response = payload;
    throw error;
  }
  throw new Error('네이버 커머스 인증을 갱신한 뒤에도 요청하지 못했습니다.');
}

function resetTokenCache() { cachedToken = null; }

module.exports = { BASE_URL, TOKEN_URL, getConfig, createSecretSign, getAccessToken, request, resetTokenCache };
