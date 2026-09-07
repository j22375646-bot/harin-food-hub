'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTenantContext } = require('../lib/tenancy/context.js');
const { authorizeAction } = require('../lib/tenancy/permissions.js');

async function contextFor(role) {
  return resolveTenantContext(
    {
      session: { id: `session-${role}`, userId: 'user-1', expiresAt: '2026-09-07T01:00:00.000Z' },
      requestedTenantId: 'tenant-1',
    },
    {
      findMembership: async () => ({
        userId: 'user-1', tenantId: 'tenant-1', status: 'ACTIVE', role, version: 1,
      }),
      now: () => new Date('2026-09-07T00:00:00.000Z'),
    }
  );
}

function denied(run) {
  assert.throws(run, error => {
    assert.equal(error.code, 'PERMISSION_DENIED');
    assert.equal(error.status, 403);
    return true;
  });
}

test('workspace.read는 발급된 모든 역할 context에 허용한다', async () => {
  for (const role of ['OWNER', 'OPERATOR', 'VIEWER']) {
    assert.equal(authorizeAction(await contextFor(role), 'workspace.read'), true);
  }
});

test('orders.write는 OWNER와 OPERATOR에만 허용한다', async () => {
  assert.equal(authorizeAction(await contextFor('OWNER'), 'orders.write'), true);
  assert.equal(authorizeAction(await contextFor('OPERATOR'), 'orders.write'), true);
  denied(() => authorizeAction(awaitedViewer, 'orders.write'));
});

let awaitedViewer;
test.before(async () => {
  awaitedViewer = await contextFor('VIEWER');
});

test('connections.manage와 members.manage는 OWNER에만 허용한다', async () => {
  const owner = await contextFor('OWNER');
  const operator = await contextFor('OPERATOR');
  for (const action of ['connections.manage', 'members.manage']) {
    assert.equal(authorizeAction(owner, action), true);
    denied(() => authorizeAction(operator, action));
  }
});

test('임의 객체와 발급 context 복제본은 위조 context로 거부한다', async () => {
  const issued = await contextFor('OWNER');
  denied(() => authorizeAction({
    userId: 'user-1', sessionId: 'session-OWNER', tenantId: 'tenant-1', role: 'OWNER', membershipVersion: 1,
  }, 'members.manage'));
  denied(() => authorizeAction({ ...issued }, 'members.manage'));
});

test('context 속성 변경을 통한 역할 상승을 허용하지 않는다', async () => {
  const viewer = await contextFor('VIEWER');
  assert.throws(() => { viewer.role = 'OWNER'; }, TypeError);
  denied(() => authorizeAction(viewer, 'members.manage'));
});

test('알 수 없는 action이나 role은 fail-closed로 거부한다', async () => {
  const owner = await contextFor('OWNER');
  denied(() => authorizeAction(owner, 'billing.write'));
  denied(() => authorizeAction({
    userId: 'user-1', sessionId: 'session-1', tenantId: 'tenant-1', role: 'SUPERUSER', membershipVersion: 1,
  }, 'workspace.read'));
});
