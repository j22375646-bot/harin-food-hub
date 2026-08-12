'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../lib/dashboard-auth.js');
const users = require('../lib/dashboard-users.js');

function withSecret(run) {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'test-only-session-secret-with-enough-entropy';
  try { return run(); }
  finally { if(previous===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=previous; }
}

test('재무 신뢰 토큰은 서버 서명·만료·허용 상태를 검증한다', () => withSecret(() => {
  const now = Date.parse('2026-08-12T00:00:00Z');
  const token = auth.signFinancialTrust({ status:'READY', formula_version:'financial-trust-v1', allowed:{ allowed_cpc:true, bid_increase:true } }, now);
  assert.equal(auth.verifyFinancialTrust(token, now + 1000).allowed_cpc, true);
  assert.equal(auth.verifyFinancialTrust(token, now + 1000).financial_actions, true);
  assert.equal(auth.verifyFinancialTrust(`${token}x`, now + 1000), null);
  assert.equal(auth.verifyFinancialTrust(token, now + 11 * 60 * 1000), null);
}));

test('차단 상태로 서명한 토큰은 목표 CPC를 허용하지 않는다', () => withSecret(() => {
  const token = auth.signFinancialTrust({ allowed:{ allowed_cpc:false } }, 1000);
  assert.equal(auth.verifyFinancialTrust(token, 2000).allowed_cpc, false);
  assert.equal(auth.verifyFinancialTrust(token, 2000).financial_actions, false);
}));

test('개인 세션은 사용자·역할·12시간 만료를 서명하고 위조를 거부한다', () => withSecret(() => {
  const expiresAt = new Date(Date.now()+60_000).toISOString();
  const token=auth.createSessionToken({sessionId:'s1',userId:'u1',username:'owner',displayName:'운영 OWNER',role:'OWNER',expiresAt});
  const session=auth.parseSession(token);
  assert.equal(session.username,'owner');
  assert.equal(session.role,'OWNER');
  assert.equal(auth.roleAtLeast(session,'OPERATOR'),true);
  assert.equal(auth.hasRole(session,['OWNER']),true);
  assert.equal(auth.parseSession(`${token}x`),null);
  assert.equal(auth.parseSession(token,Date.now()+120_000),null);
}));

test('계정 입력은 역할·계정명·강한 초기 비밀번호를 검증한다', () => {
  assert.deepEqual(users.validateAccount({username:'operator.1',email:'OPS@example.com',displayName:'운영 담당',role:'OPERATOR',password:'a-secure-password'}),{
    username:'operator.1',email:'ops@example.com',displayName:'운영 담당',role:'OPERATOR',password:'a-secure-password'
  });
  assert.throws(()=>users.validateAccount({username:'X',email:'bad',displayName:'A',role:'ADMIN',password:'short'},{passwordRequired:true}));
});

test('RBAC Proxy는 조회자 변경과 OWNER 전용 작업, 다른 출처 요청을 차단한다', () => {
  const proxy=fs.readFileSync(path.resolve(__dirname,'../proxy.js'),'utf8');
  assert.match(proxy,/session\.role === 'VIEWER'/);
  assert.match(proxy,/OWNER_MUTATIONS/);
  assert.match(proxy,/CSRF_ORIGIN_MISMATCH/);
  assert.match(proxy,/x-harin-role/);
  assert.match(proxy,/validateSession/);
});

test('계정·세션·로그인 제한 테이블은 브라우저 역할에서 격리된다', () => {
  const migration=fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql'),'utf8');
  assert.match(migration,/dashboard_users[\s\S]*enable row level security/i);
  assert.match(migration,/dashboard_sessions[\s\S]*enable row level security/i);
  assert.match(migration,/dashboard_access_audit_logs[\s\S]*enable row level security/i);
  assert.match(migration,/revoke update, delete on public\.dashboard_access_audit_logs from service_role/i);
  assert.match(migration,/revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(migration,/token_hash text not null unique/i);
  assert.doesNotMatch(migration,/password\s+text/i);
});
