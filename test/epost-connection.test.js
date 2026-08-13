'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const seed128 = require('../lib/epost/seed128.js');
const epostConfig = require('../lib/epost/config.js');

test('ePost SEED-128 ECB matches the KISA standard vector', () => {
  const vector = seed128.STANDARD_VECTOR;
  const encrypted = seed128.encryptEcbZeroPadded(
    Buffer.from(vector.key, 'hex'),
    Buffer.from(vector.plaintext, 'hex')
  );
  assert.equal(encrypted.toString('hex'), vector.ciphertext);
  assert.deepEqual(seed128.selfTest(), { ok:true, vector:'KISA-SEED-128-ECB' });
});

test('ePost regData uses UTF-8, zero padding and lowercase hex', () => {
  const encrypted = seed128.encryptRegData('0123456789abcdef', 'ordNm=홍길동');
  assert.match(encrypted, /^[0-9a-f]+$/);
  assert.equal(encrypted.length % 32, 0);
  assert.throws(() => seed128.encryptRegData('short', 'test'), error => error.code === 'EPOST_INVALID_SEED_KEY');
});

test('ePost readiness never exposes authentication or contract values', () => {
  const env = {
    EPOST_API_KEY:'auth-secret-value',
    EPOST_SECURITY_KEY:'0123456789abcdef',
    EPOST_CUSTOMER_NO:'customer-secret',
    EPOST_CONTRACT_APPROVAL_NO:'approval-secret',
    EPOST_OFFICE_SERIAL:'office-secret',
    EPOST_ALLOWED_SOURCE_IP:'13.124.12.17',
    EPOST_LIVE_WRITES_ENABLED:'false'
  };
  const result = epostConfig.readiness({ env, actualIp:'13.124.12.17' });
  assert.equal(result.status, 'READY_FOR_TEST');
  assert.equal(result.readyForTest, true);
  assert.equal(result.liveWritesEnabled, false);
  const serialized = JSON.stringify(result);
  for (const secret of ['auth-secret-value','0123456789abcdef','customer-secret','approval-secret','office-secret']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('ePost status route is authenticated and only queues a non-writing probe', () => {
  const root = path.resolve(__dirname, '..');
  const route = fs.readFileSync(path.join(root, 'app/api/epost/status/route.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'scripts/coupang-local-worker.js'), 'utf8');
  assert.match(route, /apiSafety\.isAuthorized\(request, authModule\)/);
  assert.match(route, /EPOST_CONFIG_PROBE/);
  assert.match(route, /operationQueue\.queueOperation/);
  assert.doesNotMatch(route, /EPOST_SECURITY_KEY|EPOST_API_KEY/);
  assert.match(worker, /epostConfig\.readiness/);
  assert.doesNotMatch(`${route}\n${worker}`, /InsertOrder|api\.InsertOrder/);
});
