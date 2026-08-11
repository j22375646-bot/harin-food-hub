'use strict';

const { readToken, writeToken } = require('./token-store');

function basicAuth(config) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
}

async function tokenRequest(config, body) {
  const response = await fetch(`https://${config.mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(config), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Cafe24 token request failed (${response.status}): ${JSON.stringify(payload)}`);
  return writeToken(payload);
}

async function exchangeCode(config, code) {
  return tokenRequest(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri });
}

async function getAccessToken(config, forceRefresh = false) {
  let token = await readToken();
  if (!token) throw new Error('Cafe24 is not connected. Complete OAuth first.');
  const expiresAt = Date.parse(token.expires_at || 0);
  if (!forceRefresh && expiresAt - Date.now() > 60_000) return token.access_token;
  if (!token.refresh_token) throw new Error('Cafe24 refresh token is missing. Reconnect OAuth.');
  token = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: token.refresh_token });
  return token.access_token;
}

async function requestJson(url, accessToken) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Cafe24-Api-Version': process.env.CAFE24_API_VERSION || '2026-03-01'
        }
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) return { status: response.status, payload };
      const error = Object.assign(new Error(`Cafe24 API failed (${response.status}) ${url}`), { status: response.status, payload });
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error.status && error.status !== 429 && error.status < 500) throw error;
      lastError = error;
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 700));
  }
  throw new Error(`Cafe24 network request failed after 3 attempts: ${url} (${lastError?.message || 'unknown error'})`);
}

async function adminGet(config, pathname, params = {}) {
  const url = new URL(`https://${config.mallId}.cafe24api.com/api/v2/admin${pathname}`);
  Object.entries({ shop_no: config.shopNo, ...params }).forEach(([key, value]) => value != null && url.searchParams.set(key, String(value)));
  let token = await getAccessToken(config);
  try { return await requestJson(url, token); }
  catch (error) {
    if (error.status !== 401) throw error;
    token = await getAccessToken(config, true);
    return requestJson(url, token);
  }
}

async function analyticsGet(config, pathname, params = {}) {
  const url = new URL(`https://ca-api.cafe24data.com${pathname}`);
  Object.entries({ mall_id: config.mallId, shop_no: config.shopNo, ...params }).forEach(([key, value]) => value != null && url.searchParams.set(key, String(value)));
  let token = await getAccessToken(config);
  try { return await requestJson(url, token); }
  catch (error) {
    if (error.status !== 401) throw error;
    token = await getAccessToken(config, true);
    return requestJson(url, token);
  }
}

module.exports = { exchangeCode, getAccessToken, adminGet, analyticsGet };
