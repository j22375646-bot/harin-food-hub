'use strict';

const DEFAULT_JSON_BYTES = 64 * 1024;

class ApiInputError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') {
    super(message);
    this.name = 'ApiInputError';
    this.status = status;
    this.code = code;
  }
}

function cookieValue(request, cookieName) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`))?.split('=').slice(1).join('=');
}

function isAuthorized(request, authModule) {
  return authModule.verifySession(cookieValue(request, authModule.COOKIE_NAME));
}

function json(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  return Response.json(body, { ...init, headers });
}

function unauthorized() {
  return json({ ok:false, error:'Unauthorized' }, { status:401 });
}

async function readJson(request, { maxBytes = DEFAULT_JSON_BYTES } = {}) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new ApiInputError('Content-Type은 application/json이어야 합니다.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiInputError(`요청 본문은 ${maxBytes}바이트 이하여야 합니다.`, 413, 'BODY_TOO_LARGE');
  }
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new ApiInputError(`요청 본문은 ${maxBytes}바이트 이하여야 합니다.`, 413, 'BODY_TOO_LARGE');
  }
  let body;
  try { body = JSON.parse(text); }
  catch { throw new ApiInputError('올바른 JSON 요청이 아닙니다.', 400, 'INVALID_JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiInputError('JSON 객체를 전송해주세요.', 400, 'INVALID_JSON_OBJECT');
  }
  return body;
}

function inputErrorResponse(error) {
  if (!(error instanceof ApiInputError)) return null;
  return json({ ok:false, error:error.message, code:error.code }, { status:error.status });
}

function isoDate(value) {
  const text = String(value || '');
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function assertXlsx(buffer, fileName = 'file.xlsx') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
    throw new ApiInputError(`${fileName}: 실제 XLSX 형식이 아닙니다.`, 415, 'INVALID_XLSX');
  }
  return buffer;
}

module.exports = {
  ApiInputError,
  DEFAULT_JSON_BYTES,
  assertXlsx,
  cookieValue,
  inputErrorResponse,
  isoDate,
  isAuthorized,
  json,
  readJson,
  unauthorized
};
