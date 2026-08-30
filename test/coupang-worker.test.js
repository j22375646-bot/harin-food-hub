"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const queue = require("../lib/coupang/request-queue.js");
const worker = require("../scripts/coupang-local-worker.js");
const actions = require("../lib/coupang/actions.js");

function chain(terminal, calls) {
  const query = {};
  for (const method of ["select", "eq", "in", "order", "limit", "lt"])
    query[method] = (...args) => {
      calls.push([method, ...args]);
      return query;
    };
  query.insert = (value) => {
    calls.push(["insert", value]);
    return query;
  };
  query.update = (value) => {
    calls.push(["update", value]);
    return query;
  };
  query.maybeSingle = async () => terminal;
  query.single = async () => terminal;
  return query;
}

test("Coupang queue reuses an active request", async () => {
  const calls = [];
  const request = { id: "active", request_type: "FULL", status: "PENDING" };
  const db = { from: () => chain({ data: request, error: null }, calls) };
  const result = await queue.queueRequest(db, "FULL");
  assert.deepEqual(result, { queued: true, existing: true, request });
  assert.equal(
    calls.some(([method]) => method === "insert"),
    false,
  );
});

test("Coupang queue inserts when no active request exists", async () => {
  const calls = [];
  const inserted = { id: "new", request_type: "FULL", status: "PENDING" };
  let tableCalls = 0;
  const db = {
    from: () =>
      ++tableCalls === 1
        ? chain({ data: null, error: null }, calls)
        : chain({ data: inserted, error: null }, calls),
  };
  const result = await queue.queueRequest(db, "FULL");
  assert.deepEqual(result, {
    queued: true,
    existing: false,
    deduplicated: false,
    request: inserted,
  });
  assert.deepEqual(calls.find(([method]) => method === "insert")[1], {
    request_type: "FULL",
    status: "PENDING",
    idempotency_key: null,
    scheduled_for: null,
    kst_execution_date: null,
  });
});

test("Coupang queue expires an abandoned active request before inserting a new manual refresh", async () => {
  const calls = [];
  const stale = {
    id: "stale",
    request_type: "ORDER_REALTIME",
    status: "PENDING",
    requested_at: "2026-08-26T23:00:00.000Z",
  };
  const inserted = {
    id: "new",
    request_type: "ORDER_REALTIME",
    status: "PENDING",
    requested_at: "2026-08-27T00:30:00.000Z",
  };
  const responses = [
    { data: null, error: null },
    { data: stale, error: null },
    { data: stale, error: null },
    { data: inserted, error: null },
  ];
  let tableCalls = 0;
  const db = { from: () => chain(responses[tableCalls++], calls) };

  const result = await queue.queueRequest(db, "ORDER_REALTIME", {
    idempotencyKey: "orders-live:2026-08-27T00:30",
    now: new Date("2026-08-27T00:30:00.000Z"),
    staleAfterMs: 15 * 60 * 1000,
  });

  assert.equal(result.existing, false);
  assert.equal(result.request.id, "new");
  const update = calls.find(([method]) => method === "update")?.[1];
  assert.equal(update?.status, "FAILED");
  assert.match(update?.error_message || "", /대기 시간이 초과/);
});

test("Coupang queue reuses a completed request with the same KST execution key", async () => {
  const calls = [];
  const request = { id: "done", request_type: "FULL", status: "SUCCESS" };
  const db = { from: () => chain({ data: request, error: null }, calls) };
  const result = await queue.queueRequest(db, "FULL", {
    idempotencyKey: "COUPANG_SYNC_REQUEST:KST:2026-08-13",
  });
  assert.deepEqual(result, {
    queued: true,
    existing: true,
    deduplicated: true,
    request,
  });
  assert.equal(
    calls.some(([method]) => method === "insert"),
    false,
  );
});

test("fixed-IP worker refuses an unexpected outbound address", async () => {
  const originalFetch = global.fetch;
  const originalExpected = process.env.COUPANG_ALLOWED_SOURCE_IP;
  process.env.COUPANG_ALLOWED_SOURCE_IP = "13.124.12.17";
  global.fetch = async () =>
    new Response(JSON.stringify({ ip: "203.0.113.10" }), { status: 200 });
  try {
    await assert.rejects(
      () => worker.assertAllowedSourceIp(),
      /source IP mismatch/,
    );
  } finally {
    global.fetch = originalFetch;
    if (originalExpected === undefined)
      delete process.env.COUPANG_ALLOWED_SOURCE_IP;
    else process.env.COUPANG_ALLOWED_SOURCE_IP = originalExpected;
  }
});

test("Coupang product changes remain locked until read verification is explicitly enabled", async () => {
  const original = process.env.COUPANG_PRODUCT_WRITE_ENABLED;
  process.env.COUPANG_PRODUCT_WRITE_ENABLED = "false";
  try {
    await assert.rejects(
      () =>
        actions.executeProductAction("PRODUCT_UPDATE", {
          sellerProductId: "1",
          expectedSnapshotHash: "0".repeat(64),
          product: {},
        }),
      (error) => error.code === "COUPANG_PRODUCT_WRITE_LOCKED",
    );
  } finally {
    if (original === undefined)
      delete process.env.COUPANG_PRODUCT_WRITE_ENABLED;
    else process.env.COUPANG_PRODUCT_WRITE_ENABLED = original;
  }
});

test("fixed-IP operation queue accepts product, Naver and ePost channel probes", () => {
  assert.deepEqual(
    require("../lib/coupang/operation-queue.js").validateRequest({
      operationType: "PRODUCT_DETAIL",
      targetType: "PRODUCT",
      targetId: "123",
    }),
    { operationType: "PRODUCT_DETAIL", targetType: "PRODUCT", targetId: "123" },
  );
  assert.deepEqual(
    require("../lib/coupang/operation-queue.js").validateRequest({
      operationType: "NAVER_COMMERCE_PROBE",
      targetType: "CHANNEL",
      targetId: "SMARTSTORE",
    }),
    {
      operationType: "NAVER_COMMERCE_PROBE",
      targetType: "CHANNEL",
      targetId: "SMARTSTORE",
    },
  );
  assert.deepEqual(
    require("../lib/coupang/operation-queue.js").validateRequest({
      operationType: "NAVER_COMMERCE_CS_SYNC",
      targetType: "CHANNEL",
      targetId: "SMARTSTORE",
    }),
    {
      operationType: "NAVER_COMMERCE_CS_SYNC",
      targetType: "CHANNEL",
      targetId: "SMARTSTORE",
    },
  );
  assert.deepEqual(
    require("../lib/coupang/operation-queue.js").validateRequest({
      operationType: "EPOST_CONFIG_PROBE",
      targetType: "CHANNEL",
      targetId: "EPOST",
    }),
    {
      operationType: "EPOST_CONFIG_PROBE",
      targetType: "CHANNEL",
      targetId: "EPOST",
    },
  );
});

test("hourly order cron schedules all available order and CS collectors every hour", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../app/api/cron/hourly-orders/route.js"),
    "utf8",
  );
  const vercel = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8"),
  );
  const timer = fs.readFileSync(
    path.resolve(__dirname, "../ops/systemd/harin-orders-hourly.timer"),
    "utf8",
  );
  const migration = fs.readFileSync(
    path.resolve(
      __dirname,
      "../supabase/migrations/20260813204436_allow_customer_service_sync_request.sql",
    ),
    "utf8",
  );
  assert.match(source, /queueRequest\(db, "CS_REALTIME"/);
  assert.match(source, /NAVER_COMMERCE_SYNC/);
  assert.equal(
    vercel.crons.some((item) => item.path === "/api/cron/hourly-orders"),
    false,
  );
  assert.match(timer, /OnCalendar=hourly/);
  assert.match(migration, /CS_REALTIME/);
});

test("이미 등록된 쿠팡 송장번호를 주문과 옵션 행에서 찾아 중복 전송을 막는다", () => {
  assert.equal(
    actions.orderHasInvoice(
      { invoiceNumber: "1234567890123" },
      "1234567890123",
    ),
    true,
  );
  assert.equal(
    actions.orderHasInvoice(
      { orderItems: [{ invoiceNumber: "9876543210987" }] },
      "9876543210987",
    ),
    true,
  );
  assert.equal(
    actions.orderHasInvoice(
      { orderItems: [{ invoiceNumber: "9876543210987" }] },
      "1234567890123",
    ),
    false,
  );
});

test("daily cron uses the connected-provider collector and production data source is no longer HOME_PC", () => {
  const root = path.resolve(__dirname, "..");
  const cron = fs.readFileSync(
    path.join(root, "app/api/cron/daily-sync/route.js"),
    "utf8",
  );
  const page = fs.readFileSync(path.join(root, "app/dashboard-route.js"), "utf8");
  const workerSource = fs.readFileSync(
    path.join(root, "scripts/coupang-local-worker.js"),
    "utf8",
  );
  const connectedSync = fs.readFileSync(
    path.join(root, "lib/automation/sync-all.js"),
    "utf8",
  );
  assert.match(cron, /syncAllPlatforms/);
  assert.match(connectedSync, /queueRequest\(db, 'FULL', runOptions\)/);
  assert.match(connectedSync, /coupangWorkerReady/);
  assert.match(page, /FIXED_IP_WORKER/);
  assert.doesNotMatch(`${page}\n${workerSource}`, /HOME_PC/);
});
