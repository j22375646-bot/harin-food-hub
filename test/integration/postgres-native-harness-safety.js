'use strict';

class NativeHarnessCleanupError extends Error {
  constructor(steps) {
    super('Native PostgreSQL test resource cleanup failed.');
    this.name = 'NativeHarnessCleanupError';
    this.code = 'NATIVE_HARNESS_CLEANUP_FAILED';
    this.steps = Object.freeze([...steps]);
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
  NativeHarnessCleanupError,
};
