'use strict';

class NativeHarnessCleanupError extends Error {
  constructor(steps) {
    super('Native PostgreSQL test resource cleanup failed.');
    this.name = 'NativeHarnessCleanupError';
    this.code = 'NATIVE_HARNESS_CLEANUP_FAILED';
    this.steps = Object.freeze([...steps]);
  }
}

class NativeBarrierError extends Error {
  constructor() {
    super('Native PostgreSQL race barrier failed.');
    this.name = 'NativeBarrierError';
    this.code = 'NATIVE_BARRIER_FAILED';
  }
}

function createBoundedBarrier(parties, { timeoutMs = 2000 } = {}) {
  if (!Number.isInteger(parties) || parties < 1
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('A positive barrier size and timeout are required.');
  }
  let arrivals = 0;
  let state = 'OPEN';
  let ready;
  let resolveReady;
  let rejectReady;
  let timer;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  function abort() {
    if (state !== 'OPEN') return;
    state = 'FAILED';
    clearTimer();
    if (rejectReady) rejectReady(new NativeBarrierError());
  }

  return Object.freeze({
    async arrive() {
      if (state !== 'OPEN') throw new NativeBarrierError();
      if (!ready) {
        ready = new Promise((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        });
        timer = setTimeout(abort, timeoutMs);
      }
      arrivals += 1;
      if (arrivals === parties) {
        state = 'COMPLETE';
        clearTimer();
        resolveReady();
      }
      await ready;
    },
    abort,
  });
}

function createNativeBarrierPool({ rawPool, matcher, evidence, barrierTimeoutMs = 2000 } = {}) {
  if (!rawPool || typeof rawPool.connect !== 'function' || typeof rawPool.end !== 'function'
    || typeof matcher !== 'function' || !Array.isArray(evidence)) {
    throw new TypeError('A native pool, matcher, and evidence list are required.');
  }
  const barrier = createBoundedBarrier(2, { timeoutMs: barrierTimeoutMs });
  return {
    on(event, listener) {
      rawPool.on(event, listener);
      return this;
    },
    async connect() {
      let raw;
      try {
        raw = await rawPool.connect();
        const pid = (await raw.query('select pg_backend_pid() as pid')).rows[0].pid;
        let waited = false;
        return {
          async query(text, values) {
            try {
              const sql = String(text);
              if (!waited && matcher(sql)) {
                waited = true;
                evidence.push(pid);
                await barrier.arrive();
              }
              return await raw.query(text, values);
            } catch (error) {
              barrier.abort();
              throw error;
            }
          },
          release(destroy) {
            if (destroy === true) barrier.abort();
            raw.release(destroy);
          },
        };
      } catch (error) {
        barrier.abort();
        if (raw) raw.release(true);
        throw error;
      }
    },
    abortBarrier() {
      barrier.abort();
    },
    end() {
      barrier.abort();
      return rawPool.end();
    },
  };
}

async function useAndClose(resource, operation) {
  if (!resource || typeof resource.close !== 'function' || typeof operation !== 'function') {
    throw new TypeError('A closable resource and operation are required.');
  }
  try {
    return await operation(resource);
  } finally {
    await resource.close();
  }
}

function databaseIdentifier(databaseName) {
  if (typeof databaseName !== 'string'
    || !/^moaon_test_control_[a-z0-9_]{1,40}$/.test(databaseName)) {
    return null;
  }
  return `"${databaseName}"`;
}

function auxiliaryRoleIdentifier(role) {
  if (typeof role !== 'string'
    || !/^(anon|authenticated|moaon_test_public_[0-9]+)$/.test(role)) {
    return null;
  }
  return `"${role}"`;
}

async function cleanupNativeResources({
  adminPool,
  supervisorPool,
  databaseCreated = false,
  databaseName,
  controlRoleCreated = false,
  createdAuxiliaryRoles = [],
} = {}) {
  const failures = [];
  async function attempt(step, operation) {
    try {
      await operation();
    } catch (_error) {
      failures.push(step);
    }
  }

  if (adminPool && typeof adminPool.end === 'function') {
    await attempt('admin pool close', () => adminPool.end());
  }

  if (supervisorPool && typeof supervisorPool.query === 'function') {
    if (databaseCreated) {
      const identifier = databaseIdentifier(databaseName);
      if (!identifier) {
        failures.push('database name validation');
      } else {
        await attempt('database connections terminate', () => supervisorPool.query(
          'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
          [databaseName]
        ));
        await attempt('database drop', () => supervisorPool.query(`drop database if exists ${identifier}`));
      }
    }
    if (controlRoleCreated) {
      await attempt('control role drop', () => supervisorPool.query(
        'drop role if exists moaon_control_app'
      ));
    }
    for (const role of [...createdAuxiliaryRoles].reverse()) {
      const identifier = auxiliaryRoleIdentifier(role);
      if (!identifier) {
        failures.push('auxiliary role name validation');
      } else {
        await attempt('auxiliary role drop', () => supervisorPool.query(
          `drop role if exists ${identifier}`
        ));
      }
    }
  }

  if (supervisorPool && typeof supervisorPool.end === 'function') {
    await attempt('supervisor pool close', () => supervisorPool.end());
  }

  if (failures.length > 0) throw new NativeHarnessCleanupError(failures);
}

module.exports = {
  cleanupNativeResources,
  createBoundedBarrier,
  createNativeBarrierPool,
  NativeHarnessCleanupError,
  useAndClose,
};
