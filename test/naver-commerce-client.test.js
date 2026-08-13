'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const client = require('../lib/naver-commerce/client.js');
const probe = require('../lib/naver-commerce/probe.js');

test('Naver Commerce signature is a base64 encoded bcrypt result', () => {
  const clientId = 'test-client';
  const timestamp = '1786600000000';
  const clientSecret = bcrypt.genSaltSync(10);
  const encoded = client.createSecretSign({ clientId, clientSecret, timestamp });
  const hash = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(bcrypt.compareSync(`${clientId}_${timestamp}`, hash), true);
});

test('Naver Commerce config requires server credentials and keeps writes locked by default', () => {
  assert.throws(() => client.getConfig({}), error => error.code === 'NAVER_COMMERCE_CONFIG_REQUIRED');
  const config = client.getConfig({ NAVER_COMMERCE_CLIENT_ID:'id', NAVER_COMMERCE_CLIENT_SECRET:'secret' });
  assert.equal(config.tokenType, 'SELF');
  assert.equal(config.writeEnabled, false);
  assert.throws(() => client.getConfig({ NAVER_COMMERCE_CLIENT_ID:'id', NAVER_COMMERCE_CLIENT_SECRET:'secret', NAVER_COMMERCE_TOKEN_TYPE:'SELLER' }), /ACCOUNT_ID/);
});

test('Naver Commerce order window is formatted in Korea time', () => {
  assert.equal(probe.kstIso(new Date('2026-08-13T00:00:00.000Z')), '2026-08-13T09:00:00.000+09:00');
});
