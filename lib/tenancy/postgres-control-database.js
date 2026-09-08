'use strict';

/**
 * Server-only PostgreSQL transport for the MOAON membership control store.
 *
 * The caller supplies a fixed-role connection. This module is not an HTTP SQL
 * endpoint and is intentionally not composed into legacy routes or clients.
 */

const { Pool } = require('pg');

const CONTROL_ROLE = 'moaon_control_app';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DIRECT_CONNECTION_KEYS = new Set([
  'host', 'port', 'database', 'user', 'password', 'ssl', 'enableChannelBinding',
  'sessionPoolerProjectRef',
]);
const URL_CONNECTION_KEYS = new Set(['connectionString', 'ssl', 'enableChannelBinding']);
const TLS_KEYS = new Set([
  'rejectUnauthorized',
  'ca',
  'cert',
  'key',
  'passphrase',
  'servername',
  'minVersion',
  'maxVersion',
  'ciphers',
  'honorCipherOrder',
]);

const ROLE_VALIDATION_SQL = `
  select
    current_user,
    session_user,
    r.rolsuper,
    r.rolinherit,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolreplication,
    r.rolbypassrls,
    exists (
      select 1 from pg_namespace n
      where n.nspname = 'moaon_control' and n.nspowner = r.oid
    ) as owns_control_schema,
    exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'moaon_control' and c.relowner = r.oid
    ) as owns_control_tables,
    exists (
      select 1 from pg_auth_members am where am.member = r.oid
    ) as has_role_membership
  from pg_roles r
  where r.rolname = current_user
`;

class PostgresControlDatabaseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PostgresControlDatabaseError';
    this.code = code;
  }
}

class DriverQueryFailure extends Error {}

function databaseError(code = 'CONTROL_DATABASE_UNAVAILABLE') {
  const message = code === 'CONTROL_DATABASE_CLOSED'
    ? 'Control database is closed.'
    : code === 'CONTROL_DATABASE_TRANSACTION_CLOSED'
      ? 'Control database transaction is closed.'
      : code === 'CONTROL_DATABASE_ROLE_REJECTED'
        ? 'Control database role was rejected.'
        : 'Control database is unavailable.';
  return new PostgresControlDatabaseError(code, message);
}

function configurationError() {
  return new TypeError('Valid explicit server PostgreSQL configuration is required.');
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function positiveBoundedInteger(value, fallback, maximum) {
  const candidate = value === undefined ? fallback : value;
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > maximum) {
    throw configurationError();
  }
  return candidate;
}

function cloneTlsMaterial(value) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value) && value.length > 0) {
    return value.map(cloneTlsMaterial);
  }
  throw configurationError();
}

function cloneTlsConfig(ssl) {
  if (!isPlainObject(ssl)
    || ssl.rejectUnauthorized !== true
    || Object.keys(ssl).some(key => !TLS_KEYS.has(key))) {
    throw configurationError();
  }
  const cloned = { rejectUnauthorized: true };
  for (const key of ['ca', 'cert', 'key']) {
    if (ssl[key] !== undefined) cloned[key] = cloneTlsMaterial(ssl[key]);
  }
  for (const key of ['passphrase', 'servername', 'ciphers']) {
    if (ssl[key] !== undefined) {
      if (typeof ssl[key] !== 'string' || ssl[key].length === 0) throw configurationError();
      cloned[key] = ssl[key];
    }
  }
  for (const key of ['minVersion', 'maxVersion']) {
    if (ssl[key] !== undefined) {
      if (!['TLSv1.2', 'TLSv1.3'].includes(ssl[key])) throw configurationError();
      cloned[key] = ssl[key];
    }
  }
  if (ssl.honorCipherOrder !== undefined) {
    if (typeof ssl.honorCipherOrder !== 'boolean') throw configurationError();
    cloned.honorCipherOrder = ssl.honorCipherOrder;
  }
  return cloned;
}

function parseConnection(connection) {
  if (!isPlainObject(connection)) throw configurationError();

  const hasUrl = typeof connection.connectionString === 'string';
  const allowedKeys = hasUrl ? URL_CONNECTION_KEYS : DIRECT_CONNECTION_KEYS;
  if (Object.keys(connection).some(key => !allowedKeys.has(key))) throw configurationError();

  let host;
  let database;
  let user;
  let password;
  let port;
  if (hasUrl) {
    let parsed;
    try {
      parsed = new URL(connection.connectionString);
    } catch (_error) {
      throw configurationError();
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || parsed.searchParams.size !== 0
      || parsed.hash
      || !parsed.hostname
      || !parsed.port
      || !parsed.pathname
      || parsed.pathname === '/') {
      throw configurationError();
    }
    try {
      host = parsed.hostname.toLowerCase();
      database = decodeURIComponent(parsed.pathname.slice(1));
      user = decodeURIComponent(parsed.username);
      password = decodeURIComponent(parsed.password);
      port = Number(parsed.port);
    } catch (_error) {
      throw configurationError();
    }
  } else {
    host = typeof connection.host === 'string' ? connection.host.trim().toLowerCase() : '';
    database = typeof connection.database === 'string' ? connection.database.trim() : '';
    user = connection.user;
    password = connection.password;
    port = connection.port;
  }

  // The suffix routes a Supavisor connection; it is NOT a PostgreSQL role.
  // Keep roleIsSafe checking the unsuffixed current_user AND session_user.
  const projectRef = connection.sessionPoolerProjectRef;
  let expectedUser = CONTROL_ROLE;
  if (projectRef !== undefined) {
    if (typeof projectRef !== 'string' || !/^[a-z]{20}$/.test(projectRef)
      || !/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
      || port !== 5432) throw configurationError();
    expectedUser = `${CONTROL_ROLE}.${projectRef}`;
  }

  if (!host
    || !database
    || user !== expectedUser
    || typeof password !== 'string'
    || password.length === 0
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535
    || (connection.enableChannelBinding !== undefined
      && typeof connection.enableChannelBinding !== 'boolean')) {
    throw configurationError();
  }
  return {
    host,
    port,
    database,
    user,
    password,
    loopback: LOOPBACK_HOSTS.has(host),
    enableChannelBinding: connection.enableChannelBinding === true,
  };
}

function validatedPoolConfig({
  connection,
  localTestOnly,
  maxConnections,
  connectionTimeoutMillis,
  idleTimeoutMillis,
} = {}) {
  const target = parseConnection(connection);
  let ssl;
  if (target.loopback && (connection.ssl === false || connection.ssl === undefined)) {
    if (localTestOnly !== true) throw configurationError();
    ssl = false;
  } else {
    ssl = cloneTlsConfig(connection.ssl);
  }

  return {
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.user,
    password: target.password,
    ssl,
    enableChannelBinding: target.enableChannelBinding,
    sslnegotiation: 'postgres',
    options: '-c search_path=pg_catalog',
    application_name: 'moaon-control',
    fallback_application_name: 'moaon-control',
    client_encoding: 'UTF8',
    replication: 'false',
    max: positiveBoundedInteger(maxConnections, 4, 16),
    connectionTimeoutMillis: positiveBoundedInteger(connectionTimeoutMillis, 2000, 60_000),
    idleTimeoutMillis: positiveBoundedInteger(idleTimeoutMillis, 10_000, 300_000),
    allowExitOnIdle: true,
  };
}

function roleIsSafe(row) {
  return Boolean(row)
    && row.current_user === CONTROL_ROLE
    && row.session_user === CONTROL_ROLE
    && row.rolsuper === false
    && row.rolinherit === false
    && row.rolcreaterole === false
    && row.rolcreatedb === false
    && row.rolreplication === false
    && row.rolbypassrls === false
    && row.owns_control_schema === false
    && row.owns_control_tables === false
    && row.has_role_membership === false;
}

function createPostgresControlDatabase({
  connection,
  localTestOnly = false,
  maxConnections,
  connectionTimeoutMillis,
  idleTimeoutMillis,
  statementTimeoutMillis = 5000,
  lockTimeoutMillis = 2000,
  idleInTransactionSessionTimeoutMillis = 5000,
  testPool,
  poolFactory,
  diagnostic = event => console.info('[CONTROL_DATABASE_FAILURE]', event),
} = {}) {
  if (typeof window !== 'undefined') throw configurationError();

  const poolConfig = validatedPoolConfig({
    connection,
    localTestOnly,
    maxConnections,
    connectionTimeoutMillis,
    idleTimeoutMillis,
  });
  const statementTimeout = positiveBoundedInteger(statementTimeoutMillis, 5000, 120_000);
  // Warm serverless instances must not pin a session-pooler backend while idle.
  // Keep the lease through the complete operation, including COMMIT and reset.
  const releaseSessionLease = Boolean(connection.sessionPoolerProjectRef);
  const lockTimeout = positiveBoundedInteger(lockTimeoutMillis, 2000, 60_000);
  const idleTransactionTimeout = positiveBoundedInteger(
    idleInTransactionSessionTimeoutMillis, 5000, 120_000
  );
  poolConfig.statement_timeout = statementTimeout;
  poolConfig.lock_timeout = lockTimeout;
  poolConfig.idle_in_transaction_session_timeout = idleTransactionTimeout;
  poolConfig.query_timeout = statementTimeout;
  if (testPool !== undefined && (!testPool || typeof testPool.connect !== 'function'
    || typeof testPool.end !== 'function')) throw configurationError();
  if (poolFactory !== undefined && typeof poolFactory !== 'function') throw configurationError();
  if (testPool !== undefined && poolFactory !== undefined) throw configurationError();

  const pool = testPool || (poolFactory ? poolFactory(poolConfig) : new Pool(poolConfig));
  if (!pool || typeof pool.connect !== 'function' || typeof pool.end !== 'function') {
    throw configurationError();
  }
  if (typeof pool.on === 'function') {
    // pg removes an idle errored client. This prevents an unhandled emitter
    // error without logging driver text or connection details.
    pool.on('error', () => {});
  }

  let closed = false;
  let closePromise;
  function report(stage,error){
    const code=/^(?:[0-9A-Z]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|CONTROL_DATABASE_ROLE_REJECTED)$/.test(error?.code||'')?error.code:'OTHER';
    try{diagnostic({stage,code});}catch{}
  }

  function release(client, destroy) {
    try {
      client.release(destroy);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function reset(client) {
    await client.query('ROLLBACK');
    await client.query('DISCARD ALL');
  }

  async function prepare(client) {
    await reset(client);
    await client.query(`SET statement_timeout = ${statementTimeout}`);
    await client.query(`SET lock_timeout = ${lockTimeout}`);
    await client.query(`SET idle_in_transaction_session_timeout = ${idleTransactionTimeout}`);
    const result = await client.query(ROLE_VALIDATION_SQL);
    if (!roleIsSafe(result?.rows?.[0])) {
      throw databaseError('CONTROL_DATABASE_ROLE_REJECTED');
    }
  }

  async function acquire() {
    if (closed) throw databaseError('CONTROL_DATABASE_CLOSED');
    let client;
    try {
      // Retry only rejected connection admission; never replay SQL or COMMIT.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (closed) throw databaseError('CONTROL_DATABASE_CLOSED');
        try {
          client = await pool.connect();
          break;
        } catch (error) {
          if (error?.code !== '53300' || attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      if (closed) {
        release(client, true);
        client = null;
        throw databaseError('CONTROL_DATABASE_CLOSED');
      }
      await prepare(client);
      return client;
    } catch (error) {
      report(client?'prepare':'connect',error);
      if (client) release(client, true);
      if (error instanceof PostgresControlDatabaseError) throw error;
      throw databaseError();
    }
  }

  async function releaseClean(client) {
    try {
      await reset(client);
    } catch (_error) {
      report('cleanup',_error);
      release(client, true);
      throw databaseError();
    }
    if (!release(client, releaseSessionLease)) {
      release(client, true);
      throw databaseError();
    }
  }

  async function query(text, values) {
    const client = await acquire();
    let result;
    try {
      result = await client.query(text, values);
    } catch (_error) {
      report('query',_error);
      release(client, true);
      throw databaseError();
    }
    await releaseClean(client);
    return result;
  }

  async function transaction(callback) {
    if (typeof callback !== 'function') throw new TypeError('Transaction callback is required.');
    const client = await acquire();
    let active = true;
    try {
      await client.query('BEGIN');
    } catch (_error) {
      active = false;
      release(client, true);
      throw databaseError();
    }

    const transactionHandle = Object.freeze({
      async query(text, values) {
        if (!active) throw databaseError('CONTROL_DATABASE_TRANSACTION_CLOSED');
        try {
          return await client.query(text, values);
        } catch (_error) {
          throw new DriverQueryFailure();
        }
      },
    });

    let value;
    try {
      value = await callback(transactionHandle);
    } catch (callbackError) {
      active = false;
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackError) {
        release(client, true);
        throw databaseError();
      }
      try {
        await releaseClean(client);
      } catch (_resetError) {
        throw databaseError();
      }
      if (callbackError instanceof DriverQueryFailure) throw databaseError();
      throw callbackError;
    }

    active = false;
    try {
      await client.query('COMMIT');
    } catch (_error) {
      // COMMIT failure is outcome-ambiguous. Destroy the lease and never retry.
      release(client, true);
      throw databaseError();
    }
    await releaseClean(client);
    return value;
  }

  async function close() {
    if (closePromise) return closePromise;
    closed = true;
    closePromise = Promise.resolve()
      .then(() => pool.end())
      .catch(() => { throw databaseError(); });
    return closePromise;
  }

  return Object.freeze({ query, transaction, close });
}

module.exports = {
  createPostgresControlDatabase,
  PostgresControlDatabaseError,
};
