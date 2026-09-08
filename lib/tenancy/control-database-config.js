'use strict';
const { createPostgresControlDatabase } = require('./postgres-control-database.js');

function invalid() {
  return Object.assign(new Error('Control database configuration is invalid.'), {
    code: 'CONTROL_DATABASE_CONFIGURATION_INVALID',
  });
}

// Server-only dedicated settings. Never fall back to DATABASE_URL, PG*, or a
// Supabase service key. No connection is opened until the adapter is queried.
function readControlDatabaseConfig(env = process.env) {
  if (typeof window !== 'undefined' || typeof document !== 'undefined') throw invalid();
  const keys = ['HOST', 'PORT', 'NAME', 'PASSWORD'];
  const values = keys.map(key => env[`MOAON_CONTROL_DB_${key}`]);
  const mode = env.MOAON_CONTROL_DB_MODE || 'direct';
  const projectRef = env.MOAON_CONTROL_DB_PROJECT_REF;
  if (!['direct', 'supabase-session'].includes(mode)) throw invalid();
  if (mode === 'direct' && projectRef) throw invalid();
  if (values.every(value => value === undefined || value === '') && mode === 'direct') return null;
  if (values.some(value => typeof value !== 'string' || !value.trim())) throw invalid();
  const [host, port, database, password] = values;
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host.length > 253
    || !/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535
    || !/^[a-zA-Z0-9_-]+$/.test(database) || database.length > 63) throw invalid();
  const pooler = mode === 'supabase-session';
  if (pooler && (typeof projectRef !== 'string' || !/^[a-z]{20}$/.test(projectRef)
    || !/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
    || port !== '5432')) throw invalid();
  return Object.freeze({
    connection: Object.freeze({host, port: Number(port), database, password,
      user: pooler ? `moaon_control_app.${projectRef}` : 'moaon_control_app',
      ...(pooler ? {sessionPoolerProjectRef: projectRef} : {}),
      ssl: Object.freeze({rejectUnauthorized: true})}),
    maxConnections: 2,
    connectionTimeoutMillis: 5000,
  });
}

function createConfiguredControlDatabase(env = process.env) {
  const config = readControlDatabaseConfig(env);
  return config === null ? null : createPostgresControlDatabase(config);
}

module.exports = { readControlDatabaseConfig, createConfiguredControlDatabase };
