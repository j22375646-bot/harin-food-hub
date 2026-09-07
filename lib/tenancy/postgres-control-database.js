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
]);
const URL_CONNECTION_KEYS = new Set(['connectionString', 'ssl', 'enableChannelBinding']);

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

function parseConnection(connection) {
  if (!isPlainObject(connection)) throw configurationError();

  const hasUrl = typeof connection.connectionString === 'string';
  const allowedKeys = hasUrl ? URL_CONNECTION_KEYS : DIRECT_CONNECTION_KEYS;
  if (Object.keys(connection).some(key => !allowedKeys.has(key))) throw configurationError();

  let host;
  let database;
  let user;
  if (hasUrl) {
    let parsed;
    try {
      parsed = new URL(connection.connectionString);
    } catch (_error) {
      throw configurationError();
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || parsed.searchParams.size !== 0
      || !parsed.hostname
      || !parsed.pathname
      || parsed.pathname === '/') {
      throw configurationError();
    }
    try {
      host = parsed.hostname.toLowerCase();
      database = decodeURIComponent(parsed.pathname.slice(1));
      user = decodeURIComponent(parsed.username);
    } catch (_error) {
      throw configurationError();
    }
  } else {
    host = typeof connection.host === 'string' ? connection.host.trim().toLowerCase() : '';
    database = typeof connection.database === 'string' ? connection.database.trim() : '';
    user = connection.user;
  }

  if (!host || !database || user !== CONTROL_ROLE) throw configurationError();
  return { loopback: LOOPBACK_HOSTS.has(host) };
}

function validatedPoolConfig({
  connection,
  localTestOnly,
  maxConnections,
  connectionTimeoutMillis,
  idleTimeoutMillis,
} = {}) {
  const target = parseConnection(connection);
  const ssl = connection.ssl;
  if (target.loopback && (ssl === false || ssl === undefined)) {
    if (localTestOnly !== true) throw configurationError();
  } else if (!isPlainObject(ssl) || ssl.rejectUnauthorized !== true) {
    throw configurationError();
  }

  return {
    ...connection,
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
  const lockTimeout = positiveBoundedInteger(lockTimeoutMillis, 2000, 60_000);
  const idleTransactionTimeout = positiveBoundedInteger(
    idleInTransactionSessionTimeoutMillis, 5000, 120_000
  );
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
      client = await pool.connect();
      if (closed) {
        release(client, true);
        client = null;
        throw databaseError('CONTROL_DATABASE_CLOSED');
      }
      await prepare(client);
      return client;
    } catch (error) {
      if (client) release(client, true);
      if (error instanceof PostgresControlDatabaseError) throw error;
      throw databaseError();
    }
  }

  async function releaseClean(client) {
    try {
      await reset(client);
    } catch (_error) {
      release(client, true);
      throw databaseError();
    }
    if (!release(client, false)) {
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
