"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
require("dotenv").config({
  path: path.join(root, ".env.coupang.local"),
  override: false,
  quiet: true,
});
require("dotenv").config({
  path: path.join(root, ".env.local"),
  override: false,
  quiet: true,
});

const { getSupabase } = require("../lib/cafe24/supabase.js");
const { syncCoupang } = require("../lib/automation/sync-all.js");
const {
  syncRocketGrowthInventoryOnly,
  syncRocketGrowthRealtime,
  syncSellerOrdersRealtime,
  syncCustomerServiceRealtime,
} = require("../lib/coupang/sync.js");
const operationQueue = require("../lib/coupang/operation-queue.js");
const coupangActions = require("../lib/coupang/actions.js");
const naverCommerceProbe = require("../lib/naver-commerce/probe.js");
const naverCommerceSync = require("../lib/naver-commerce/sync.js");
const naverCustomerService = require("../lib/naver-commerce/customer-service.js");
const epostConfig = require("../lib/epost/config.js");
const epostClient = require("../lib/epost/client.js");
const epostTracking = require("../lib/epost/tracking.js");

const logPath = path.join(root, "tmp", "coupang-local-worker.log");
const watchMode = process.argv.includes("--watch");
const quietMode = process.argv.includes("--quiet");
const collectorId = String(
  process.env.COUPANG_COLLECTOR_ID || "FIXED_IP_WORKER",
).trim();
const workerStartedAt = new Date().toISOString();
const OPERATION_RECOVERY_INTERVAL_MS = 2 * 1000;
const SYNC_RECOVERY_INTERVAL_MS = 2 * 1000;
let verifiedSourceIp = null;
fs.mkdirSync(path.dirname(logPath), { recursive: true });

function createSingleFlight(work) {
  let active = null;
  return (...args) => {
    if (active) return active;
    active = Promise.resolve()
      .then(() => work(...args))
      .finally(() => {
        active = null;
      });
    return active;
  };
}

function safeMessage(error) {
  const secrets = [
    process.env.COUPANG_ACCESS_KEY,
    process.env.COUPANG_SECRET_KEY,
    process.env.NAVER_COMMERCE_CLIENT_ID,
    process.env.NAVER_COMMERCE_CLIENT_SECRET,
    process.env.EPOST_API_KEY,
    process.env.EPOST_OPEN_API_KEY,
    process.env.EPOST_SECURITY_KEY,
    process.env.EPOST_SEED_KEY,
    process.env.EPOST_TRACKING_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean);
  return secrets.reduce(
    (message, secret) => message.split(secret).join("[REDACTED]"),
    String(error?.message || error || "Unknown error"),
  );
}

function operationFailureDisposition(request, error, now = Date.now()) {
  const message = safeMessage(error);
  const executedAt = new Date(now).toISOString();
  const attemptCount = Number(request?.attempt_count || 0);
  const cancelledOrderDetail = request?.operation_type === "ORDER_DETAIL"
    && /order has been cance(?:lled|led) or returned/i.test(message);
  if (cancelledOrderDetail) {
    return {
      status:"CANCELLED", error_message:message, executed_at:executedAt,
      dead_lettered_at:null, next_attempt_at:null,
      terminalExpected:true, retry:false
    };
  }
  const epostMaintenance = error?.code === "EPOST_MAINTENANCE";
  const retryableEpost = request?.operation_type === "EPOST_LIVE_ISSUE"
    && error?.retryable === true
    && attemptCount < (epostMaintenance ? 72 : 5);
  if (retryableEpost) {
    return {
      status:"PENDING", error_message:message, started_at:null,
      executed_at:null, dead_lettered_at:null, collector:null,
      next_attempt_at:new Date(now + (epostMaintenance ? 10 : 1) * 60 * 1000).toISOString(),
      terminalExpected:false, retry:true
    };
  }
  return {
    status:"FAILED", error_message:message, executed_at:executedAt,
    dead_lettered_at:executedAt, next_attempt_at:null,
    terminalExpected:false, retry:false
  };
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  fs.appendFileSync(logPath, `${line}\n`, "utf8");
  if (!quietMode) process.stdout.write(`${line}\n`);
}

async function publicIp() {
  const response = await fetch("https://api.ipify.org?format=json", {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(`Public IP check failed: HTTP ${response.status}`);
  const ip = String((await response.json()).ip || "").trim();
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip))
    throw new Error("Public IP check returned an invalid IPv4 address.");
  return ip;
}

async function assertAllowedSourceIp() {
  const expected = String(process.env.COUPANG_ALLOWED_SOURCE_IP || "").trim();
  if (!expected)
    throw new Error(
      "COUPANG_ALLOWED_SOURCE_IP is required for the fixed-IP worker.",
    );
  const actual = await publicIp();
  if (actual !== expected)
    throw new Error(
      `Coupang source IP mismatch: actual=${actual} expected=${expected}`,
    );
  log(`SOURCE_IP_VERIFIED ip=${actual} collector=${collectorId}`);
  verifiedSourceIp = actual;
  return actual;
}

async function writeHeartbeat(db, values = {}) {
  const now = new Date().toISOString();
  const row = {
    worker_id: collectorId,
    service_name: "harin-coupang-worker",
    collector: collectorId,
    status: values.status || "ONLINE",
    source_ip: verifiedSourceIp,
    current_job_type: values.currentJobType || null,
    current_job_id: values.currentJobId || null,
    started_at: workerStartedAt,
    last_seen_at: now,
    last_success_at: values.success ? now : undefined,
    last_error: values.error ? safeMessage(values.error) : null,
    metadata: {
      watch_mode: watchMode,
      node: process.version,
      operation_recovery_interval_ms: OPERATION_RECOVERY_INTERVAL_MS,
      sync_recovery_interval_ms: SYNC_RECOVERY_INTERVAL_MS,
    },
    updated_at: now,
  };
  if (row.last_success_at === undefined) delete row.last_success_at;
  try {
    const result = await db.from("worker_heartbeats").upsert(row, { onConflict: "worker_id" });
    if (result.error) throw result.error;
  } catch (error) {
    log(`HEARTBEAT_FAILED ${safeMessage(error)}`);
  }
}

async function claimNext(db) {
  const now = new Date().toISOString();
  const pending = await db
    .from("coupang_sync_requests")
    .select("id,request_type,attempt_count")
    .eq("status", "PENDING")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("requested_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pending.error) throw pending.error;
  if (!pending.data) return null;
  const claimed = await db
    .from("coupang_sync_requests")
    .update({
      status: "RUNNING",
      started_at: now,
      collector: collectorId,
      attempt_count: Number(pending.data.attempt_count || 0) + 1,
    })
    .eq("id", pending.data.id)
    .eq("status", "PENDING")
    .select("id,request_type,attempt_count")
    .maybeSingle();
  if (claimed.error) throw claimed.error;
  return claimed.data || null;
}

async function processRequest(db, request) {
  log(`START ${request.request_type} ${request.id}`);
  await writeHeartbeat(db, { status: "BUSY", currentJobType: request.request_type, currentJobId: request.id });
  try {
    const result =
      request.request_type === "RG_INVENTORY"
        ? await syncRocketGrowthInventoryOnly()
        : request.request_type === "RG_REALTIME"
          ? await syncRocketGrowthRealtime()
          : request.request_type === "ORDER_REALTIME"
            ? await syncSellerOrdersRealtime()
            : request.request_type === "CS_REALTIME"
              ? await syncCustomerServiceRealtime()
              : await syncCoupang("MANUAL");
    const saved = await db
      .from("coupang_sync_requests")
      .update({
        status: "SUCCESS",
        finished_at: new Date().toISOString(),
        result_json: result,
        error_message: null,
      })
      .eq("id", request.id);
    if (saved.error) throw saved.error;
    await writeHeartbeat(db, { status: "ONLINE", success: true });
    log(`SUCCESS ${request.request_type} ${request.id}`);
  } catch (error) {
    const message = safeMessage(error);
    const retryable =
      /not allowed|403|429|timeout|fetch failed/i.test(message) &&
      request.attempt_count < 8;
    const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await db
      .from("coupang_sync_requests")
      .update(
        retryable
          ? {
              status: "PENDING",
              next_attempt_at: retryAt,
              error_message: message,
            }
          : {
              status: "FAILED",
              finished_at: new Date().toISOString(),
              dead_lettered_at: new Date().toISOString(),
              error_message: message,
            },
      )
      .eq("id", request.id);
    if (retryable) {
      await writeHeartbeat(db, { status: "ONLINE", error: message });
      return log(`RETRY ${request.request_type} ${request.id} at=${retryAt}`);
    }
    await writeHeartbeat(db, { status: "ERROR", error: message });
    throw error;
  }
}

async function processPending(db) {
  let processed = 0;
  while (true) {
    const request = await claimNext(db);
    if (!request) break;
    await processRequest(db, request);
    processed += 1;
  }
  return processed;
}

async function claimNextOperation(db) {
  const now = new Date().toISOString();
  const pending = await db
    .from("coupang_operation_requests")
    .select("id,operation_type,target_type,target_id,payload,attempt_count")
    .eq("status", "PENDING")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pending.error) throw pending.error;
  if (!pending.data) return null;
  const claimed = await db
    .from("coupang_operation_requests")
    .update({
      status: "RUNNING",
      started_at: now,
      collector: collectorId,
      attempt_count: Number(pending.data.attempt_count || 0) + 1,
    })
    .eq("id", pending.data.id)
    .eq("status", "PENDING")
    .select("id,operation_type,target_type,target_id,payload,attempt_count")
    .maybeSingle();
  if (claimed.error) throw claimed.error;
  return claimed.data || null;
}

async function expirePendingOperations(db) {
  const now = new Date().toISOString();
  const expired = await db
    .from("coupang_operation_requests")
    .update({
      status: "FAILED",
      executed_at: now,
      dead_lettered_at: now,
      error_message:
        "고정 IP 서버 처리 기한이 지나 안전을 위해 실행하지 않았습니다. 다시 요청해주세요.",
    })
    .eq("status", "PENDING")
    .lt("expires_at", now);
  if (expired.error) throw expired.error;
}

async function dispatchOperation(
  request,
  payload,
  handlers = coupangActions,
  db = getSupabase(),
) {
  if (request.operation_type === "NAVER_COMMERCE_PROBE")
    return { naverCommerce: await naverCommerceProbe.probeReadAccess({ db }) };
  if (request.operation_type === "NAVER_COMMERCE_SYNC")
    return { naverCommerceSync: await naverCommerceSync.sync({ db }) };
  if (request.operation_type === "NAVER_COMMERCE_CS_SYNC")
    return { naverCustomerService: await naverCustomerService.sync({ db }) };
  if (request.operation_type === "EPOST_CONFIG_PROBE") {
    const actualIp = await publicIp();
    return { epost: epostConfig.readiness({ actualIp }) };
  }
  if (request.operation_type === "EPOST_TEST_ISSUE") {
    if (payload.testOnly !== true)
      throw Object.assign(new Error("우체국 테스트 전용 요청이 아닙니다."), {
        code: "EPOST_TEST_ONLY",
      });
    const actualIp = await publicIp();
    const readiness = epostConfig.readiness({ actualIp });
    if (!readiness.readyForTest)
      throw Object.assign(
        new Error(
          "우체국 테스트 접수에 필요한 서버 설정이 완료되지 않았습니다.",
        ),
        { code: "EPOST_SETUP_REQUIRED" },
      );
    let order = payload.order || {};
    if (order.platform === "COUPANG") {
      const detail = await handlers.getOrderDetail(order.shipmentId);
      order = {
        ...order,
        receiver: detail.receiver,
        goodsName: (detail.items || [])
          .map((item) => item.name)
          .filter(Boolean)
          .join(" 외 "),
        quantity: (detail.items || []).reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0,
        ),
      };
    }
    return { epostTest: await epostClient.issueTestShipment(order) };
  }
  if (request.operation_type === "EPOST_LIVE_ISSUE") {
    if (payload.live !== true)
      throw Object.assign(new Error("우체국 실제 접수 확인값이 없습니다."), {
        code: "EPOST_LIVE_CONFIRMATION_REQUIRED",
      });
    const actualIp = await publicIp();
    const readiness = epostConfig.readiness({ actualIp });
    if (!readiness.readyForLive)
      throw Object.assign(
        new Error("우체국 실제 송장 자동발급에 필요한 서버 설정이 완료되지 않았습니다."),
        { code: "EPOST_LIVE_SETUP_REQUIRED" },
      );
    let order = payload.order || {};
    if (order.platform === "COUPANG") {
      const detail = await handlers.getOrderDetail(order.shipmentId);
      order = {
        ...order,
        receiver: detail.receiver,
        goodsName: (detail.items || [])
          .map((item) => item.name)
          .filter(Boolean)
          .join(" 외 "),
        quantity: (detail.items || []).reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0,
        ),
      };
    }
    return { epostLive: await epostClient.issueShipment(order) };
  }
  if (request.operation_type === "EPOST_TRACKING") {
    if (
      request.target_type !== "TRACKING" ||
      payload.trackingNo !== request.target_id
    ) {
      throw Object.assign(
        new Error("우체국 배송추적 요청 정보가 일치하지 않습니다."),
        { code: "EPOST_TRACKING_TARGET_MISMATCH" },
      );
    }
    return { epostTracking: await epostTracking.trace(payload.trackingNo) };
  }
  if (request.operation_type === "ORDER_DETAIL")
    return { order: await handlers.getOrderDetail(request.target_id) };
  if (request.operation_type === "PRODUCT_DETAIL")
    return { product: await handlers.getProductDetail(request.target_id) };
  const options = { audit: { db, id: request.id } };
  if (request.target_type === "PRODUCT")
    return handlers.executeProductAction(
      request.operation_type,
      payload,
      options,
    );
  if (request.target_type === "ORDER")
    return handlers.executeOrderAction(
      request.operation_type,
      payload,
      options,
    );
  if (request.target_type === "INQUIRY")
    return handlers.executeCsAction(request.operation_type, payload, options);
  if (["RETURN", "EXCHANGE"].includes(request.target_type))
    return handlers.executeCaseAction(request.operation_type, payload, options);
  throw new Error(
    `Unsupported Coupang operation target: ${request.target_type}`,
  );
}

async function processOperationRequest(db, request) {
  log(`OPERATION_START ${request.operation_type} ${request.id}`);
  await writeHeartbeat(db, { status: "BUSY", currentJobType: request.operation_type, currentJobId: request.id });
  try {
    const payload = operationQueue.open(request.payload);
    const result = await dispatchOperation(
      request,
      payload,
      coupangActions,
      db,
    );
    const saved = await db
      .from("coupang_operation_requests")
      .update({
        status: "SUCCESS",
        result_json: operationQueue.seal(result),
        error_message: null,
        executed_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("status", "RUNNING");
    if (saved.error) throw saved.error;
    await writeHeartbeat(db, { status: "ONLINE", success: true });
    log(`OPERATION_SUCCESS ${request.operation_type} ${request.id}`);
  } catch (error) {
    const message = safeMessage(error);
    const disposition = operationFailureDisposition(request, error);
    const { retry, terminalExpected, ...update } = disposition;
    await db
      .from("coupang_operation_requests")
      .update(update)
      .eq("id", request.id)
      .eq("status", "RUNNING");
    if (retry) {
      log(`OPERATION_RETRY ${request.operation_type} ${request.id} ${message}`);
      await writeHeartbeat(db, { status: "ONLINE", error: message });
    } else if (terminalExpected) {
      log(`OPERATION_CANCELLED ${request.operation_type} ${request.id} ${message}`);
      await writeHeartbeat(db, { status: "ONLINE" });
    } else {
      log(`OPERATION_FAILED ${request.operation_type} ${request.id} ${message}`);
      await writeHeartbeat(db, { status: "ERROR", error: message });
    }
  }
}

async function processPendingOperations(db) {
  let processed = 0;
  await expirePendingOperations(db);
  while (true) {
    const request = await claimNextOperation(db);
    if (!request) break;
    await processOperationRequest(db, request);
    processed += 1;
  }
  return processed;
}

async function processAllPending(db) {
  const syncRequests = await processPending(db);
  const operationRequests = await processPendingOperations(db);
  return syncRequests + operationRequests;
}

async function runOnce(db = getSupabase()) {
  const processed = await processAllPending(db);
  if (!processed) log("IDLE_NO_MANUAL_REQUEST");
  return processed;
}

async function watch(db = getSupabase()) {
  await writeHeartbeat(db, { status: "ONLINE" });
  await processAllPending(db);
  const drainSyncRequests = createSingleFlight(() => processPending(db));
  const drainOperations = createSingleFlight(() => processPendingOperations(db));
  // Realtime is the fast path. This quiet recovery pass only drains explicitly
  // queued requests if a WebSocket event was missed; it never starts a
  // collection unless a user or the daily scheduler already queued one.
  const keepAlive = setInterval(() => {
    writeHeartbeat(db, { status: "ONLINE" })
      .then(async () => {
        await drainSyncRequests();
        await drainOperations();
      })
      .catch((error) => log(`RECOVERY_FAILED ${safeMessage(error)}`));
  }, 60 * 1000);
  const syncRecovery = setInterval(() => {
    drainSyncRequests().catch((error) =>
      log(`SYNC_RECOVERY_FAILED ${safeMessage(error)}`),
    );
  }, SYNC_RECOVERY_INTERVAL_MS);
  const operationRecovery = setInterval(() => {
    drainOperations().catch((error) =>
      log(`OPERATION_RECOVERY_FAILED ${safeMessage(error)}`),
    );
  }, OPERATION_RECOVERY_INTERVAL_MS);
  const channel = db
    .channel("harin-coupang-manual-requests")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "coupang_sync_requests" },
      () => {
        drainSyncRequests().catch((error) =>
          log(`EVENT_FAILED ${safeMessage(error)}`),
        );
      },
    )
    .subscribe((status, error) => {
      log(`REALTIME_${status}${error ? ` ${safeMessage(error)}` : ""}`);
      if (status === "SUBSCRIBED") {
        drainSyncRequests()
          .then(() => drainOperations())
          .catch((nextError) =>
            log(`RECOVERY_FAILED ${safeMessage(nextError)}`),
          );
      }
    });
  const operationChannel = db
    .channel("harin-coupang-operation-requests")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "coupang_operation_requests",
      },
      () => {
        drainOperations().catch((error) =>
          log(`OPERATION_EVENT_FAILED ${safeMessage(error)}`),
        );
      },
    )
    .subscribe((status, error) =>
      log(
        `OPERATION_REALTIME_${status}${error ? ` ${safeMessage(error)}` : ""}`,
      ),
    );
  const shutdown = async (signal) => {
    log(`STOP ${signal}`);
    clearInterval(keepAlive);
    clearInterval(syncRecovery);
    clearInterval(operationRecovery);
    await writeHeartbeat(db, { status: "STOPPING" });
    await db.removeChannel(channel).catch(() => {});
    await db.removeChannel(operationChannel).catch(() => {});
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  log("WATCHING_FIXED_IP_REQUESTS");
  return channel;
}

async function main() {
  await assertAllowedSourceIp();
  const db = getSupabase();
  await writeHeartbeat(db, { status: "ONLINE" });
  const result = watchMode ? await watch(db) : await runOnce(db);
  if (!watchMode) await writeHeartbeat(db, { status: "STOPPING" });
  return result;
}

if (require.main === module)
  main().catch((error) => {
    log(`FAILED ${safeMessage(error)}`);
    process.exitCode = 1;
  });

module.exports = {
  OPERATION_RECOVERY_INTERVAL_MS,
  SYNC_RECOVERY_INTERVAL_MS,
  assertAllowedSourceIp,
  claimNext,
  claimNextOperation,
  createSingleFlight,
  dispatchOperation,
  expirePendingOperations,
  operationFailureDisposition,
  processRequest,
  processOperationRequest,
  processPending,
  processPendingOperations,
  processAllPending,
  publicIp,
  runOnce,
  watch,
  writeHeartbeat,
};
