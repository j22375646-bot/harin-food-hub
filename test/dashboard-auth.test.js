'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/dashboard-auth.js');

test('재무 신뢰 토큰은 서버 서명·만료·허용 상태를 검증한다', () => {
  const previous = process.env.DASHBOARD_PASSWORD;
  process.env.DASHBOARD_PASSWORD = 'test-only-password';
  try {
    const now = Date.parse('2026-08-12T00:00:00Z');
    const token = auth.signFinancialTrust({ formula_version:'financial-trust-v1', allowed:{ allowed_cpc:true } }, now);
    assert.equal(auth.verifyFinancialTrust(token, now + 1000).allowed_cpc, true);
    assert.equal(auth.verifyFinancialTrust(`${token}x`, now + 1000), null);
    assert.equal(auth.verifyFinancialTrust(token, now + 11 * 60 * 1000), null);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_PASSWORD;
    else process.env.DASHBOARD_PASSWORD = previous;
  }
});

test('차단 상태로 서명한 토큰은 목표 CPC를 허용하지 않는다', () => {
  const previous = process.env.DASHBOARD_PASSWORD;
  process.env.DASHBOARD_PASSWORD = 'test-only-password';
  try {
    const token = auth.signFinancialTrust({ allowed:{ allowed_cpc:false } }, 1000);
    assert.equal(auth.verifyFinancialTrust(token, 2000).allowed_cpc, false);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_PASSWORD;
    else process.env.DASHBOARD_PASSWORD = previous;
  }
});
