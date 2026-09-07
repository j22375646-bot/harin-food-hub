'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPostgresControlDatabase,
  PostgresControlDatabaseError,
} = require('../lib/tenancy/postgres-control-database.js');
const {
  cleanupNativeResources,
  createBoundedBarrier,
  createNativeBarrierPool,
  NativeHarnessCleanupError,
  useAndClose,
} = require('./integration/postgres-native-harness-safety.js');

const SAFE_ROLE = Object.freeze({
  current_user: 'moaon_control_app',
  session_user: 'moaon_control_app',
  rolsuper: false,
  rolinherit: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolbypassrls: false,
  owns_control_schema: false,
  owns_control_tables: false,
  has_role_membership: false,
});

function localConnection(overrides = {}) {
  return {
    host: '127.0.0.1',
    port: 5432,
    database: 'moaon_test_unit',
    user: 'moaon_control_app',
    password: 'synthetic',
    ssl: false,
    ...overrides,
  };
}

function createFakeClient(respond) {
  const client = {
    calls: [],
    releases: [],
    async query(text, values) {
      const call = { text: String(text), values };
      this.calls.push(call);
      if (/from pg_roles/i.test(call.text)) return { rows: [{ ...SAFE_ROLE }] };
      if (respond) return respond(call, this.calls.length);
      return { rows: [] };
    },
    release(destroy) {
      this.releases.push(destroy === true);
    },
  };
  return client;
}

function createFakePool(client, { connectError, endError } = {}) {
  return {
    connects: 0,
    ends: 0,
    on() {},
    async connect() {
      this.connects += 1;
      if (connectError) throw connectError;
      return client;
    },
    async end() {
      this.ends += 1;
      if (endError) throw endError;
    },
  };
}

function createDatabase(pool, overrides = {}) {
  return createPostgresControlDatabase({
    connection: localConnection(),
    localTestOnly: true,
    testPool: pool,
    ...overrides,
  });
}

async function expectSafeDatabaseError(run, code = 'CONTROL_DATABASE_UNAVAILABLE') {
  await assert.rejects(run, error => {
    assert.equal(error instanceof PostgresControlDatabaseError, true);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /secret|password|postgres|select|sql/i);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(Object.hasOwn(error, 'detail'), false);
    return true;
  });
}

test('제한 PostgreSQL adapter는 query, transaction, close 공개 seam만 반환한다', async () => {
  const client = createFakeClient();
  const pool = createFakePool(client);
  const database = createPostgresControlDatabase({
    connection: localConnection(),
    localTestOnly: true,
    testPool: pool,
  });

  assert.deepEqual(Object.keys(database).sort(), ['close', 'query', 'transaction']);
  assert.equal(Object.isFrozen(database), true);
  assert.deepEqual((await database.query('select $1::integer as value', [7])).rows, []);
  assert.equal(pool.connects, 1);
  assert.deepEqual(client.releases, [false]);
  await database.close();
});

test('연결 설정은 명시된 고정 역할과 안전한 TLS 또는 loopback test opt-in만 허용한다', async t => {
  const inertPool = createFakePool(createFakeClient());
  const invalid = [
    {},
    { connection: localConnection(), testPool: inertPool },
    { connection: localConnection({ user: 'postgres' }), localTestOnly: true, testPool: inertPool },
    { connection: localConnection({ host: 'db.example.com', ssl: false }), testPool: inertPool },
    { connection: localConnection({ host: 'db.example.com', ssl: { rejectUnauthorized: false } }), testPool: inertPool },
    { connection: localConnection({ options: '-c role=postgres' }), localTestOnly: true, testPool: inertPool },
    { connection: localConnection({ max: 1000 }), localTestOnly: true, testPool: inertPool },
    {
      connection: {
        connectionString: 'postgresql://moaon_control_app:secret@db.example.com/moaon?sslmode=require',
        ssl: { rejectUnauthorized: true },
      },
      testPool: inertPool,
    },
    {
      connection: {
        connectionString: 'postgresql://moaon_control_app:secret@127.0.0.1/moaon_test_unit?options=-c%20role%3Dpostgres',
        ssl: false,
      },
      localTestOnly: true,
      testPool: inertPool,
    },
    {
      connection: {
        connectionString: 'postgresql://postgres:secret@127.0.0.1/moaon_test_unit',
        ssl: false,
      },
      localTestOnly: true,
      testPool: inertPool,
    },
  ];
  for (const input of invalid) {
    await t.test(JSON.stringify(input.connection || {}), () => {
      assert.throws(() => createPostgresControlDatabase(input), TypeError);
    });
  }

  let captured;
  const remote = createPostgresControlDatabase({
    connection: {
      host: 'db.example.com',
      port: 5432,
      database: 'moaon',
      user: 'moaon_control_app',
      password: 'synthetic',
      ssl: { rejectUnauthorized: true, ca: 'synthetic-ca' },
    },
    poolFactory: config => {
      captured = config;
      return inertPool;
    },
  });
  assert.equal(captured.max, 4);
  assert.equal(captured.connectionTimeoutMillis, 2000);
  assert.equal(captured.ssl.rejectUnauthorized, true);
  await remote.close();
});

test('browser 환경에서는 생성 자체를 거부한다', () => {
  const priorWindow = global.window;
  global.window = {};
  try {
    assert.throws(() => createPostgresControlDatabase({
      connection: localConnection(),
      localTestOnly: true,
      testPool: createFakePool(createFakeClient()),
    }), TypeError);
  } finally {
    if (priorWindow === undefined) delete global.window;
    else global.window = priorWindow;
  }
});

test('매 checkout마다 잔여 상태를 reset하고 고정 역할 metadata를 검증한다', async () => {
  const client = createFakeClient();
  const database = createDatabase(createFakePool(client));
  await database.query('select 1', []);

  assert.equal(client.calls.filter(call => /^rollback$/i.test(call.text.trim())).length, 2);
  assert.equal(client.calls.filter(call => /^discard all$/i.test(call.text.trim())).length, 2);
  assert.equal(client.calls.filter(call => /from pg_roles/i.test(call.text)).length, 1);
  assert.equal(client.calls.some(call => /statement_timeout/i.test(call.text)), true);
  assert.equal(client.calls.some(call => /lock_timeout/i.test(call.text)), true);
  assert.equal(client.calls.some(call => /idle_in_transaction_session_timeout/i.test(call.text)), true);
  await database.close();
});

test('잘못되거나 특권이 있는 역할, ownership, membership은 작업 전에 연결을 폐기한다', async t => {
  for (const [field, value] of [
    ['current_user', 'postgres'],
    ['session_user', 'postgres'],
    ['rolsuper', true],
    ['rolinherit', true],
    ['rolcreaterole', true],
    ['rolcreatedb', true],
    ['rolreplication', true],
    ['rolbypassrls', true],
    ['owns_control_schema', true],
    ['owns_control_tables', true],
    ['has_role_membership', true],
  ]) {
    await t.test(field, async () => {
      const client = createFakeClient(call => {
        if (/from pg_roles/i.test(call.text)) {
          return { rows: [{ ...SAFE_ROLE, [field]: value }] };
        }
        return { rows: [] };
      });
      // Override the helper's default role row for this case.
      client.query = async function query(text, values) {
        const call = { text: String(text), values };
        this.calls.push(call);
        if (/from pg_roles/i.test(call.text)) return { rows: [{ ...SAFE_ROLE, [field]: value }] };
        return { rows: [] };
      };
      const pool = createFakePool(client);
      const database = createDatabase(pool);
      await expectSafeDatabaseError(() => database.query('select secret from private'), 'CONTROL_DATABASE_ROLE_REJECTED');
      assert.equal(client.calls.some(call => /select secret from private/i.test(call.text)), false);
      assert.deepEqual(client.releases, [true]);
      await database.close();
    });
  }
});

test('transaction은 동일 leased client를 사용하고 callback 뒤 handle을 만료시킨다', async () => {
  const client = createFakeClient(call => {
    if (/select 42/i.test(call.text)) return { rows: [{ value: 42 }] };
    return { rows: [] };
  });
  const database = createDatabase(createFakePool(client));
  let leakedHandle;
  const result = await database.transaction(async transaction => {
    leakedHandle = transaction;
    assert.deepEqual(Object.keys(transaction), ['query']);
    assert.equal(Object.isFrozen(transaction), true);
    return (await transaction.query('select 42 as value')).rows[0].value;
  });
  assert.equal(result, 42);
  assert.equal(client.calls.filter(call => /^begin$/i.test(call.text.trim())).length, 1);
  assert.equal(client.calls.filter(call => /^commit$/i.test(call.text.trim())).length, 1);
  assert.deepEqual(client.releases, [false]);
  await assert.rejects(() => leakedHandle.query('select 99'), error => {
    assert.equal(error.code, 'CONTROL_DATABASE_TRANSACTION_CLOSED');
    return true;
  });
  assert.equal(client.calls.some(call => /select 99/i.test(call.text)), false);
  await database.close();
});

test('callback domain error는 성공한 rollback 뒤 원형을 보존한다', async () => {
  const domainError = Object.assign(new Error('domain-visible'), { code: 'DOMAIN_CONFLICT' });
  const client = createFakeClient();
  const database = createDatabase(createFakePool(client));
  await assert.rejects(
    () => database.transaction(async () => { throw domainError; }),
    error => error === domainError
  );
  assert.equal(client.calls.filter(call => /^rollback$/i.test(call.text.trim())).length >= 2, true);
  assert.deepEqual(client.releases, [false]);
  await database.close();
});

test('connect, BEGIN, COMMIT, rollback, reset 실패는 누설 없이 sanitize하고 lease를 폐기한다', async t => {
  await t.test('connect', async () => {
    const pool = createFakePool(null, { connectError: new Error('password=secret postgres://leak') });
    const database = createDatabase(pool);
    await expectSafeDatabaseError(() => database.query('select secret'));
    assert.equal(pool.connects, 1);
    await database.close();
  });

  for (const phase of ['BEGIN', 'COMMIT', 'ROLLBACK', 'DISCARD ALL']) {
    await t.test(phase, async () => {
      let matchingCalls = 0;
      const client = createFakeClient(call => {
        if (call.text.trim().toUpperCase() === phase) {
          matchingCalls += 1;
          const shouldFail = ['DISCARD ALL', 'ROLLBACK'].includes(phase)
            ? matchingCalls === 2
            : matchingCalls === 1;
          if (shouldFail) throw Object.assign(new Error(`secret ${phase} sql detail`), { detail: 'password' });
        }
        return { rows: [] };
      });
      const database = createDatabase(createFakePool(client));
      const run = phase === 'ROLLBACK'
        ? () => database.transaction(async () => { throw new Error('domain-visible'); })
        : () => database.transaction(async transaction => transaction.query('select 1'));
      await expectSafeDatabaseError(run);
      assert.deepEqual(client.releases, [true]);
      await database.close();
    });
  }
});

test('driver query 오류는 SQL, detail, credential을 노출하지 않고 자동 재시도하지 않는다', async () => {
  let workCalls = 0;
  const client = createFakeClient(call => {
    if (/select secret/i.test(call.text)) {
      workCalls += 1;
      throw Object.assign(new Error('postgres://moaon_control_app:password@host/db select secret'), {
        detail: 'row contains secret@example.com',
      });
    }
    return { rows: [] };
  });
  const pool = createFakePool(client);
  const database = createDatabase(pool);
  await expectSafeDatabaseError(() => database.query('select secret', ['password']));
  assert.equal(workCalls, 1);
  assert.equal(pool.connects, 1);
  assert.deepEqual(client.releases, [true]);
  await database.close();
});

test('close는 pool을 한 번 닫고 이후 operation을 즉시 거부한다', async () => {
  const pool = createFakePool(createFakeClient());
  const database = createDatabase(pool);
  await database.close();
  await database.close();
  assert.equal(pool.ends, 1);
  await expectSafeDatabaseError(() => database.query('select 1'), 'CONTROL_DATABASE_CLOSED');
  await expectSafeDatabaseError(() => database.transaction(async () => 1), 'CONTROL_DATABASE_CLOSED');
  assert.equal(pool.connects, 0);
});

test('port와 password를 생략한 direct 또는 URL config는 driver 환경 fallback 전에 거부한다', () => {
  const pool = createFakePool(createFakeClient());
  for (const connection of [
    localConnection({ port: undefined }),
    localConnection({ password: undefined }),
    localConnection({ password: '' }),
    {
      connectionString: 'postgresql://moaon_control_app:synthetic@127.0.0.1/moaon_test_unit',
      ssl: false,
    },
    {
      connectionString: 'postgresql://moaon_control_app@127.0.0.1:5432/moaon_test_unit',
      ssl: false,
    },
  ]) {
    assert.throws(() => createPostgresControlDatabase({
      connection,
      localTestOnly: true,
      testPool: pool,
    }), TypeError);
  }
});

test('명시 config는 PG 환경 오염을 driver에 전달하지 않고 process.env도 변경하지 않는다', async () => {
  const names = [
    'PGPASSWORD', 'PGPORT', 'PGOPTIONS', 'PGAPPNAME', 'PGSSLMODE',
    'PGSSLNEGOTIATION', 'PGCLIENT_ENCODING', 'PGREPLICATION', 'PGUSER',
    'PGDATABASE', 'PGHOST', 'PGCONNECT_TIMEOUT',
  ];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const contamination = {
    PGPASSWORD: 'environment-secret',
    PGPORT: '6543',
    PGOPTIONS: '-c role=postgres',
    PGAPPNAME: 'environment-app',
    PGSSLMODE: 'no-verify',
    PGSSLNEGOTIATION: 'direct',
    PGCLIENT_ENCODING: 'SQL_ASCII',
    PGREPLICATION: 'database',
    PGUSER: 'postgres',
    PGDATABASE: 'production',
    PGHOST: 'production.example.com',
    PGCONNECT_TIMEOUT: '99',
  };
  Object.assign(process.env, contamination);
  let captured;
  try {
    const database = createPostgresControlDatabase({
      connection: localConnection(),
      localTestOnly: true,
      poolFactory(config) {
        captured = config;
        return createFakePool(createFakeClient());
      },
    });
    assert.equal(Object.hasOwn(captured, 'connectionString'), false);
    assert.equal(captured.password, 'synthetic');
    assert.equal(captured.port, 5432);
    assert.equal(captured.host, '127.0.0.1');
    assert.equal(captured.database, 'moaon_test_unit');
    assert.equal(captured.user, 'moaon_control_app');
    assert.equal(captured.options, '-c search_path=pg_catalog');
    assert.equal(captured.application_name, 'moaon-control');
    assert.equal(captured.client_encoding, 'UTF8');
    assert.equal(captured.replication, 'false');
    assert.equal(captured.ssl, false);
    assert.equal(captured.sslnegotiation, 'postgres');
    assert.equal(captured.connectionTimeoutMillis, 2000);
    assert.deepEqual(
      Object.fromEntries(names.map(name => [name, process.env[name]])),
      contamination
    );
    await database.close();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('검증한 TLS config는 caller의 사후 mutation과 unsupported hook에서 격리된다', async () => {
  const ca = Buffer.from('safe-ca');
  const cert = Buffer.from('safe-cert');
  const ssl = {
    rejectUnauthorized: true,
    ca: [ca, 'safe-ca-two'],
    cert,
    key: 'safe-key',
    servername: 'db.example.com',
    minVersion: 'TLSv1.2',
  };
  const connection = localConnection({ host: 'db.example.com', ssl });
  let captured;
  const database = createPostgresControlDatabase({
    connection,
    poolFactory(config) {
      captured = config;
      return createFakePool(createFakeClient());
    },
  });

  ssl.rejectUnauthorized = false;
  ca.fill(0);
  cert.fill(0);
  ssl.ca[1] = 'mutated';
  connection.host = 'attacker.example.com';
  assert.equal(captured.host, 'db.example.com');
  assert.equal(captured.ssl.rejectUnauthorized, true);
  assert.equal(captured.ssl.ca[0].toString(), 'safe-ca');
  assert.equal(captured.ssl.ca[1], 'safe-ca-two');
  assert.equal(captured.ssl.cert.toString(), 'safe-cert');
  await database.close();

  assert.throws(() => createPostgresControlDatabase({
    connection: localConnection({
      host: 'db.example.com',
      ssl: { rejectUnauthorized: true, checkServerIdentity() {} },
    }),
    testPool: createFakePool(createFakeClient()),
  }), TypeError);
});

test('failed setup 전에 존재한 control role은 native cleanup 소유 대상이 아니다', async () => {
  const statements = [];
  const supervisorPool = {
    async query(sql) { statements.push(String(sql)); },
    async end() {},
  };
  await cleanupNativeResources({
    supervisorPool,
    databaseCreated: false,
    controlRoleCreated: false,
    createdAuxiliaryRoles: [],
  });
  assert.equal(statements.some(sql => /drop role.*moaon_control_app/i.test(sql)), false);
});

test('native cleanup은 한 단계가 실패해도 모든 owned resource를 시도하고 안전하게 보고한다', async () => {
  const statements = [];
  const supervisorPool = {
    async query(sql) {
      statements.push(String(sql));
      throw new Error('driver password=secret detail');
    },
    async end() {
      statements.push('SUPERVISOR_END');
      throw new Error('end secret');
    },
  };
  const adminPool = {
    async end() {
      statements.push('ADMIN_END');
      throw new Error('admin secret');
    },
  };

  await assert.rejects(() => cleanupNativeResources({
    adminPool,
    supervisorPool,
    databaseCreated: true,
    databaseName: 'moaon_test_control_1234_abcd',
    controlRoleCreated: true,
    createdAuxiliaryRoles: ['moaon_test_public_1234'],
  }), error => {
    assert.equal(error instanceof NativeHarnessCleanupError, true);
    assert.equal(error.code, 'NATIVE_HARNESS_CLEANUP_FAILED');
    assert.doesNotMatch(error.message, /secret|password|detail/i);
    assert.deepEqual(error.steps, [
      'admin pool close',
      'database connections terminate',
      'database drop',
      'control role drop',
      'auxiliary role drop',
      'supervisor pool close',
    ]);
    return true;
  });
  assert.equal(statements.some(sql => /pg_terminate_backend/i.test(sql)), true);
  assert.equal(statements.some(sql => /drop database/i.test(sql)), true);
  assert.equal(statements.some(sql => /drop role if exists moaon_control_app/i.test(sql)), true);
  assert.equal(statements.some(sql => /drop role if exists "moaon_test_public_1234"/i.test(sql)), true);
  assert.equal(statements.includes('SUPERVISOR_END'), true);
});

test('native race barrier는 참가자 누락과 명시 실패에서 대기자를 bounded하게 해제한다', async () => {
  const timedBarrier = createBoundedBarrier(2, { timeoutMs: 20 });
  const startedAt = Date.now();
  await assert.rejects(timedBarrier.arrive(), error => {
    assert.equal(error.code, 'NATIVE_BARRIER_FAILED');
    assert.doesNotMatch(error.message, /secret|query|password/i);
    return true;
  });
  assert.equal(Date.now() - startedAt < 500, true);

  const abortedBarrier = createBoundedBarrier(2, { timeoutMs: 500 });
  const waiting = abortedBarrier.arrive();
  abortedBarrier.abort();
  await assert.rejects(waiting, error => error.code === 'NATIVE_BARRIER_FAILED');
});

test('native barrier pool은 backend PID 조회 실패 client를 destroy하고 닫힘을 위임한다', async () => {
  const rawClient = {
    releases: [],
    async query() {
      throw new Error('synthetic pid lookup failure');
    },
    release(destroy) {
      this.releases.push(destroy === true);
    },
  };
  const rawPool = {
    ends: 0,
    on() {},
    async connect() { return rawClient; },
    async end() { this.ends += 1; },
  };
  const pool = createNativeBarrierPool({
    rawPool,
    matcher: () => true,
    evidence: [],
    barrierTimeoutMs: 20,
  });

  await assert.rejects(() => pool.connect(), /synthetic pid lookup failure/);
  assert.deepEqual(rawClient.releases, [true]);
  await pool.end();
  assert.equal(rawPool.ends, 1);
});

test('native setup resource는 invitation 준비가 실패해도 항상 닫힌다', async () => {
  const resource = {
    closes: 0,
    async close() { this.closes += 1; },
  };
  await assert.rejects(
    () => useAndClose(resource, async () => {
      throw new Error('synthetic invitation preparation failure');
    }),
    /synthetic invitation preparation failure/
  );
  assert.equal(resource.closes, 1);
});
