'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readControlDatabaseConfig, createConfiguredControlDatabase } = require('../lib/tenancy/control-database-config.js');
const valid = () => ({
  MOAON_CONTROL_DB_HOST: 'db.example.com', MOAON_CONTROL_DB_PORT: '5432',
  MOAON_CONTROL_DB_NAME: 'postgres', MOAON_CONTROL_DB_PASSWORD: 'synthetic-only',
});

test('explicit CA reaches verified TLS configuration without weakening verification', async () => {
  const ca = require('node:tls').rootCertificates[0];
  const env = {...valid(), MOAON_CONTROL_DB_CA: ca};
  const config = readControlDatabaseConfig(env);
  assert.equal(config.connection.ssl.ca, ca);
  assert.equal(config.connection.ssl.rejectUnauthorized, true);
  const db = createConfiguredControlDatabase(env);
  await db.close();
});

test('malformed supplied CA fails closed rather than silently using default trust', () => {
  for (const ca of ['', 'secret-invalid-certificate', false, '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----']) {
    assert.throws(() => readControlDatabaseConfig({...valid(), MOAON_CONTROL_DB_CA: ca}), error => {
      assert.equal(error.code, 'CONTROL_DATABASE_CONFIGURATION_INVALID');
      assert.doesNotMatch(error.message, /secret|CERTIFICATE/);
      return true;
    });
  }
});
test('session pooler is explicit, project-scoped and never accepts transaction mode', async () => {
  const env = {...valid(), MOAON_CONTROL_DB_MODE:'supabase-session',
    MOAON_CONTROL_DB_PROJECT_REF:'abcdefghijklmnopqrst',
    MOAON_CONTROL_DB_HOST:'aws-0-ap-southeast-1.pooler.supabase.com'};
  const config = readControlDatabaseConfig(env);
  assert.equal(config.connection.user,'moaon_control_app.abcdefghijklmnopqrst');
  assert.equal(config.connection.sessionPoolerProjectRef,'abcdefghijklmnopqrst');
  const db = createConfiguredControlDatabase(env);
  await db.close();
  for (const change of [{MOAON_CONTROL_DB_PORT:'6543'},
    {MOAON_CONTROL_DB_PROJECT_REF:''}, {MOAON_CONTROL_DB_PROJECT_REF:'bad.ref'},
    {MOAON_CONTROL_DB_HOST:'evil.pooler.supabase.com.attacker.test'},
    {MOAON_CONTROL_DB_MODE:'transaction'}, {MOAON_CONTROL_DB_MODE:'direct'}]) {
    assert.throws(()=>readControlDatabaseConfig({...env,...change}),
      {code:'CONTROL_DATABASE_CONFIGURATION_INVALID'});
  }
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
