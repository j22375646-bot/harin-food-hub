'use strict';

const APP_ENTRY_URL = 'moaon://app/index.html';
const HARIN_ORIGIN = 'https://harin-cafe24-sync.vercel.app';
const LOGIN_URL = `${HARIN_ORIGIN}/login`;
const ORDER_SCOPES = Object.freeze(['ACTIVE', 'REGISTER', 'IN_TRANSIT', 'COMPLETED']);
const ORDER_SCOPE_SET = new Set(ORDER_SCOPES);
const ORDERS_PATH = `${HARIN_ORIGIN}/api/orders/page?stage=`;
const ORDERS_URL = `${ORDERS_PATH}ACTIVE&platform=ALL`;
const READONLY_PARTITION = 'persist:moaon-harin-readonly';
const MAX_LOGIN_QUERY_LENGTH = 512;
const LOGIN_QUERY_KEYS = new Set(['error', 'next']);
const ORDERS_PAGE_SIZE = 20;
const SNAPSHOT_PATTERN = /^[0-9a-f]{64}$/;

function buildOrdersScopeUrl(scope = 'ACTIVE') {
  if (!ORDER_SCOPE_SET.has(scope)) throw new TypeError('Invalid orders scope');
  return `${ORDERS_PATH}${scope}&platform=ALL`;
}

function buildOrdersPageUrl(offset, snapshot, scope = 'ACTIVE') {
  const ordersUrl = buildOrdersScopeUrl(scope);
  if (
    !Number.isSafeInteger(offset)
    || offset < 0
    || offset % ORDERS_PAGE_SIZE !== 0
    || typeof snapshot !== 'string'
    || !SNAPSHOT_PATTERN.test(snapshot)
  ) {
    throw new TypeError('Invalid orders page cursor');
  }
  return `${ordersUrl}&offset=${offset}&snapshot=${snapshot}`;
}

function parseOrdersPageUrl(value) {
  if (typeof value !== 'string') return null;
  const escapedPath = ORDERS_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = value.match(new RegExp(`^${escapedPath}(ACTIVE|REGISTER|IN_TRANSIT|COMPLETED)&platform=ALL(?:&offset=([0-9]+)&snapshot=([0-9a-f]{64}))?$`));
  if (!match) return null;
  if (match[2] === undefined) return Object.freeze({ scope: match[1], offset: 0, snapshot: null });
  const offset = Number(match[2]);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % ORDERS_PAGE_SIZE !== 0 || String(offset) !== match[2]) return null;
  return Object.freeze({ scope: match[1], offset, snapshot: match[3] });
}

function isSafeLoginUrl(url) {
  if (url.origin !== HARIN_ORIGIN || url.pathname !== '/login') return false;
  if (url.hash || url.search.length > MAX_LOGIN_QUERY_LENGTH) return false;

  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!LOGIN_QUERY_KEYS.has(key) || seen.has(key)) return false;
    seen.add(key);
    if (key === 'next' && value !== '/') return false;
    if (key === 'error' && !/^[a-z_-]{1,32}$/.test(value)) return false;
  }
  return true;
}

function isLoginAsset(url) {
  if (url.origin !== HARIN_ORIGIN || url.search || url.hash) return false;
  if (url.pathname === '/favicon.ico') return true;
  return url.pathname.startsWith('/_next/static/') && url.pathname.length > '/_next/static/'.length;
}

function isMainProcessRequest(webContentsId) {
  return webContentsId === undefined
    || webContentsId === null
    || (Number.isInteger(webContentsId) && webContentsId <= 0);
}

function isAllowedRemoteRequest(details = {}, context = {}) {
  if (typeof details.url !== 'string' || typeof details.method !== 'string') return false;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;

  const method = details.method.toUpperCase();
  if(context.shipmentRequestActive===true && isMainProcessRequest(details.webContentsId)) {
    const endpoint=`${HARIN_ORIGIN}/api/epost/issue`;
    if(method==='POST'&&details.url===endpoint)return true;
    if(method==='GET'&&details.url.startsWith(endpoint+'?requestId=')
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(details.url.slice((endpoint+'?requestId=').length)))return true;
  }
  const loginWindowRequest = context.loginWindowActive === true
    && Number.isInteger(context.loginWebContentsId)
    && details.webContentsId === context.loginWebContentsId;

  if (method === 'GET' && parseOrdersPageUrl(details.url)) {
    return isMainProcessRequest(details.webContentsId);
  }

  if (!loginWindowRequest) return false;
  if (method === 'GET') return isSafeLoginUrl(url) || isLoginAsset(url);
  return method === 'POST'
    && url.origin === HARIN_ORIGIN
    && url.pathname === '/api/dashboard/login'
    && !url.search
    && !url.hash;
}

function isTrustedRenderer(event, mainWindow) {
  if (!event || !mainWindow || typeof mainWindow.isDestroyed !== 'function' || mainWindow.isDestroyed()) {
    return false;
  }
  const expected = mainWindow.webContents;
  const mainFrame = expected?.mainFrame;
  return Boolean(
    expected
    && mainFrame
    && event.sender === expected
    && event.senderFrame === mainFrame
    && event.senderFrame.url === APP_ENTRY_URL
    && expected.getURL() === APP_ENTRY_URL,
  );
}

module.exports = Object.freeze({
  APP_ENTRY_URL,
  HARIN_ORIGIN,
  LOGIN_URL,
  ORDER_SCOPES,
  ORDERS_URL,
  READONLY_PARTITION,
  buildOrdersPageUrl,
  buildOrdersScopeUrl,
  isAllowedRemoteRequest,
  isTrustedRenderer,
});
