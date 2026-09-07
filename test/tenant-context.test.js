'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTenantContext } = require('../lib/tenancy/context.js');

const NOW = new Date('2026-09-07T00:00:00.000Z');

function validSession(overrides = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    expiresAt: '2026-09-07T01:00:00.000Z',
    ...overrides,
  };
}

function activeMembership(overrides = {}) {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    status: 'ACTIVE',
    role: 'OPERATOR',
    version: 3,
    ...overrides,
  };
}

async function rejectsWith(run, code, status) {
  await assert.rejects(run, error => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

test('membership에서 확인한 역할로 동결된 사업장 context를 발급한다', async () => {
  const context = await resolveTenantContext(
    { session: validSession({ role: 'OWNER' }), requestedTenantId: 'tenant-1', role: 'OWNER' },
    { findMembership: async () => activeMembership(), now: () => NOW }
  );

  assert.deepEqual(context, {
    userId: 'user-1',
    sessionId: 'session-1',
    tenantId: 'tenant-1',
    role: 'OPERATOR',
    membershipVersion: 3,
  });
  assert.equal(Object.isFrozen(context), true);
});

test('요청한 사업장과 다른 membership으로 교차 사업장 접근을 허용하지 않는다', async () => {
  await rejectsWith(
    () => resolveTenantContext(
      { session: validSession(), requestedTenantId: 'tenant-2' },
      { findMembership: async () => activeMembership({ tenantId: 'tenant-1' }), now: () => NOW }
    ),
    'TENANT_ACCESS_DENIED',
    403
  );
});

test('누락된 tenant ID는 membership 조회 전에 거부한다', async () => {
  let lookupCount = 0;
  await rejectsWith(
    () => resolveTenantContext(
      { session: validSession(), requestedTenantId: '  ' },
      { findMembership: async () => { lookupCount += 1; }, now: () => NOW }
    ),
    'TENANT_REQUIRED',
    400
  );
  assert.equal(lookupCount, 0);
});

test('누락·잘못된 만료일·만료된 서버 세션을 거부한다', async () => {
  const sessions = [
    null,
    validSession({ id: '' }),
    validSession({ userId: '' }),
    validSession({ expiresAt: 'not-a-date' }),
    validSession({ expiresAt: NOW.toISOString() }),
  ];

  for (const session of sessions) {
    await rejectsWith(
      () => resolveTenantContext(
        { session, requestedTenantId: 'tenant-1' },
        { findMembership: async () => activeMembership(), now: () => NOW }
      ),
      'AUTH_REQUIRED',
      401
    );
  }
});

test('비회원·비활성·불명확하거나 잘못된 membership을 fail-closed로 거부한다', async () => {
  const invalidMemberships = [
    null,
    activeMembership({ userId: 'user-2' }),
    activeMembership({ status: 'PENDING' }),
    activeMembership({ status: 'active' }),
    activeMembership({ role: 'ADMIN' }),
    activeMembership({ version: 0 }),
    activeMembership({ version: 1.5 }),
  ];

  for (const membership of invalidMemberships) {
    await rejectsWith(
      () => resolveTenantContext(
        { session: validSession(), requestedTenantId: 'tenant-1' },
        { findMembership: async () => membership, now: () => NOW }
      ),
      'TENANT_ACCESS_DENIED',
      403
    );
  }
});

test('매 호출 membership을 다시 조회하여 revoke를 즉시 반영한다', async () => {
  let lookupCount = 0;
  const findMembership = async () => {
    lookupCount += 1;
    return lookupCount === 1 ? activeMembership() : activeMembership({ status: 'REVOKED' });
  };
  const input = { session: validSession(), requestedTenantId: 'tenant-1' };
  const dependencies = { findMembership, now: () => NOW };

  await resolveTenantContext(input, dependencies);
  await rejectsWith(
    () => resolveTenantContext(input, dependencies),
    'TENANT_ACCESS_DENIED',
    403
  );
  assert.equal(lookupCount, 2);
});

test('membership 저장소 오류를 안전한 오류로 감싸고 원문을 노출하지 않는다', async () => {
  const secret = 'database host and credential detail';
  await assert.rejects(
    () => resolveTenantContext(
      { session: validSession(), requestedTenantId: 'tenant-1' },
      { findMembership: async () => { throw new Error(secret); }, now: () => NOW }
    ),
    error => {
      assert.equal(error.code, 'TENANT_LOOKUP_FAILED');
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    }
  );
});
