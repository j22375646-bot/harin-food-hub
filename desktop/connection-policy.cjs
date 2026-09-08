'use strict';

const APP_ENTRY_URL = 'moaon://app/index.html';
const HARIN_ORIGIN = 'https://harin-cafe24-sync.vercel.app';
const LOGIN_URL = `${HARIN_ORIGIN}/login`;
const ORDERS_URL = `${HARIN_ORIGIN}/api/orders/page?stage=ACTIVE&platform=ALL`;
const READONLY_PARTITION = 'moaon-harin-readonly';
const MAX_LOGIN_QUERY_LENGTH = 512;
const LOGIN_QUERY_KEYS = new Set(['error', 'next']);

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
  const loginWindowRequest = context.loginWindowActive === true
    && Number.isInteger(context.loginWebContentsId)
    && details.webContentsId === context.loginWebContentsId;

  if (method === 'GET' && details.url === ORDERS_URL) {
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
  ORDERS_URL,
  READONLY_PARTITION,
  isAllowedRemoteRequest,
  isTrustedRenderer,
});
