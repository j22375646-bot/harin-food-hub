'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedLoginRequest } = require('../lib/dashboard-login-request.js');

function loginRequest(headers = {}, url = 'https://harin-cafe24-sync.vercel.app/api/dashboard/login') {
  return {
    url,
    headers: new Headers(headers)
  };
}

test('운영 주소와 같은 Origin의 로그인 폼은 허용한다', () => {
  const request = loginRequest({ origin: 'https://harin-cafe24-sync.vercel.app' });
  assert.equal(isTrustedLoginRequest(request), true);
});

test('Origin이 빠진 동일 출처 브라우저 로그인은 Fetch Metadata로 허용한다', () => {
  const request = loginRequest({ 'sec-fetch-site': 'same-origin' });
  assert.equal(isTrustedLoginRequest(request), true);
});

test('Origin이 null이어도 운영 주소 Referer가 있으면 허용한다', () => {
  const request = loginRequest({
    origin: 'null',
    referer: 'https://harin-cafe24-sync.vercel.app/login?next=%2Fcs'
  });
  assert.equal(isTrustedLoginRequest(request), true);
});

test('Vercel 프록시 뒤에서는 전달된 운영 호스트와 같은 Origin을 허용한다', () => {
  const request = loginRequest({
    origin: 'https://harin-cafe24-sync.vercel.app',
    'x-forwarded-host': 'harin-cafe24-sync.vercel.app',
    'x-forwarded-proto': 'https'
  }, 'https://harin-cafe24-sync-abc123.vercel.app/api/dashboard/login');
  assert.equal(isTrustedLoginRequest(request), true);
});

test('외부 Origin 또는 cross-site 로그인 요청은 차단한다', () => {
  const foreignOrigin = loginRequest({
    origin: 'https://attacker.example',
    'sec-fetch-site': 'cross-site'
  });
  const missingOriginCrossSite = loginRequest({
    referer: 'https://attacker.example/login',
    'sec-fetch-site': 'cross-site'
  });

  assert.equal(isTrustedLoginRequest(foreignOrigin), false);
  assert.equal(isTrustedLoginRequest(missingOriginCrossSite), false);
});
