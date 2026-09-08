'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readControlDatabaseConfig, createConfiguredControlDatabase } = require('../lib/tenancy/control-database-config.js');
const valid = () => ({
  MOAON_CONTROL_DB_HOST: 'db.example.com', MOAON_CONTROL_DB_PORT: '5432',
  MOAON_CONTROL_DB_NAME: 'postgres', MOAON_CONTROL_DB_PASSWORD: 'synthetic-only',
});
test('missing dedicated settings never fall back to global database credentials', () => {
  assert.equal(readControlDatabaseConfig({DATABASE_URL:'secret',PGPASSWORD:'secret'}), null);
  assert.equal(createConfiguredControlDatabase({}), null);
});
test('partial or malformed settings fail without exposing their values', () => {
  for (const changes of [{MOAON_CONTROL_DB_PORT:''}, {MOAON_CONTROL_DB_PORT:'5432junk'},
    {MOAON_CONTROL_DB_PORT:'0'}, {MOAON_CONTROL_DB_PORT:'65536'},
    {MOAON_CONTROL_DB_HOST:'https://secret.example'}, {MOAON_CONTROL_DB_NAME:''},
    {MOAON_CONTROL_DB_PASSWORD:''}]) {
    assert.throws(() => readControlDatabaseConfig({...valid(),...changes}), error => {
      assert.equal(error.code, 'CONTROL_DATABASE_CONFIGURATION_INVALID');
      assert.doesNotMatch(error.message, /synthetic|secret|5432/);
      return true;
    });
  }
});
test('dedicated configuration pins role and verified TLS without inheriting PG options', async () => {
  const env = {...valid(), PGUSER:'postgres', PGOPTIONS:'-c role=postgres'};
  const config = readControlDatabaseConfig(env);
  assert.equal(config.connection.user, 'moaon_control_app');
  assert.equal(config.connection.port, 5432);
  assert.equal(config.connection.ssl.rejectUnauthorized, true);
  assert.equal(config.connection.options, undefined);
  env.MOAON_CONTROL_DB_PASSWORD = 'changed';
  assert.equal(config.connection.password, 'synthetic-only');
  const db = createConfiguredControlDatabase(valid());
  await db.close(); // Constructor is lazy: no network connection is required.
});
test('browser runtime cannot read database configuration', () => {
  global.window = {};
  try { assert.throws(() => readControlDatabaseConfig(valid()), {code:'CONTROL_DATABASE_CONFIGURATION_INVALID'}); }
  finally { delete global.window; }
});
