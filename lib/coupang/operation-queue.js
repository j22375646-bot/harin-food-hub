"use strict";

const crypto = require("node:crypto");

const ACTIVE_STATUSES = ["PENDING", "RUNNING"];
const text = (value) => (value == null ? "" : String(value).trim());

function encryptionKey(secret = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (!secret)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for Coupang operation encryption.",
    );
  return crypto
    .createHash("sha256")
    .update(`harin-coupang-operation-v1\0${secret}`)
    .digest();
}

function seal(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    iv,
  );
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url"),
  };
}

function open(envelope, secret) {
  if (
    envelope?.v !== 1 ||
    envelope?.alg !== "A256GCM" ||
    !envelope.iv ||
    !envelope.tag ||
    !envelope.data
  ) {
    throw new Error(
      "쿠팡 고정 IP 작업의 암호화 데이터 형식이 올바르지 않습니다.",
    );
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

function validateRequest(input = {}) {
  const operationType = text(input.operationType).toUpperCase();
  const targetType = text(input.targetType).toUpperCase();
  const targetId = text(input.targetId);
  if (!/^[A-Z][A-Z0-9_]{1,60}$/.test(operationType))
    throw Object.assign(new Error("쿠팡 작업 종류가 올바르지 않습니다."), {
      status: 400,
    });
  if (
    ![
      "ORDER",
      "RETURN",
      "EXCHANGE",
      "INQUIRY",
      "PRODUCT",
      "CHANNEL",
      "HUB_ORDER",
      "TRACKING",
    ].includes(targetType)
  )
    throw Object.assign(new Error("고정 IP 작업 대상이 올바르지 않습니다."), {
      status: 400,
    });
  const validTargetId =
    targetType === "CHANNEL"
      ? /^[A-Z0-9_-]{2,40}$/.test(targetId)
      : targetType === "HUB_ORDER"
        ? /^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/.test(targetId)
        : targetType === "TRACKING"
          ? /^\d{13}$/.test(targetId)
          : /^\d+$/.test(targetId);
  if (!validTargetId)
    throw Object.assign(
      new Error("고정 IP 작업 대상 번호가 올바르지 않습니다."),
      { status: 400 },
    );
  return { operationType, targetType, targetId };
}

async function findActive(db, request) {
  return db
    .from("coupang_operation_requests")
    .select("id,operation_type,target_type,target_id,status,created_at,expires_at")
    .eq("operation_type", request.operationType)
    .eq("target_type", request.targetType)
    .eq("target_id", request.targetId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function findByIdempotencyKey(db, idempotencyKey) {
  if (!idempotencyKey) return { data: null, error: null };
  return db
    .from("coupang_operation_requests")
    .select(
      "id,operation_type,target_type,target_id,status,attempt_count,created_at,executed_at",
    )
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
}

async function queueOperation(db, input = {}) {
  const request = validateRequest(input);
  const suppliedNow = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const now = Number.isNaN(suppliedNow.getTime()) ? new Date() : suppliedNow;
  const expiresInMs = [
    "ORDER_DETAIL",
    "PRODUCT_DETAIL",
    "NAVER_COMMERCE_PROBE",
    "NAVER_COMMERCE_SYNC",
    "NAVER_COMMERCE_CS_SYNC",
    "EPOST_CONFIG_PROBE",
    "EPOST_LIVE_ISSUE",
    "EPOST_TEST_ISSUE",
    "EPOST_TRACKING",
  ].includes(request.operationType)
    ? 10 * 60 * 1000
    : 90 * 1000;
  const idempotencyKey = text(input.idempotencyKey) || null;
  const existing = await findActive(db, request);
  if (existing.error) throw existing.error;
  const existingExpiresAt = existing.data?.expires_at ? new Date(existing.data.expires_at) : null;
  const existingExpired = Boolean(existingExpiresAt && !Number.isNaN(existingExpiresAt.getTime()) && existingExpiresAt.getTime() <= now.getTime());
  if (existing.data && !existingExpired)
    return { queued: true, existing: true, request: existing.data };
  if (existing.data) {
    const expired = await db
      .from("coupang_operation_requests")
      .update({
        status: "FAILED",
        executed_at: now.toISOString(),
        dead_lettered_at: now.toISOString(),
        error_message: "고정 IP 작업의 처리 기한이 지나 새 요청으로 교체했습니다.",
      })
      .eq("id", existing.data.id)
      .in("status", ACTIVE_STATUSES)
      .select("id,operation_type,target_type,target_id,status,created_at,expires_at")
      .maybeSingle();
    if (expired.error) throw expired.error;
  }

  const prior = await findByIdempotencyKey(db, idempotencyKey);
  if (prior.error) throw prior.error;
  if (prior.data?.status === "SUCCESS") {
    return {
      queued: false,
      existing: true,
      completed: true,
      request: prior.data,
    };
  }
  if (
    prior.data &&
    ["FAILED", "CANCELLED"].includes(prior.data.status) &&
    input.retryFailed === false
  ) {
    return {
      queued: false,
      existing: true,
      reusedTerminal: true,
      request: prior.data,
    };
  }
  if (prior.data && ["FAILED", "CANCELLED"].includes(prior.data.status)) {
    const retried = await db
      .from("coupang_operation_requests")
      .update({
        status: "PENDING",
        payload: seal(input.payload || {}),
        result_json: seal({}),
        error_message: null,
        confirmed_at: now.toISOString(),
        started_at: null,
        executed_at: null,
        collector: null,
        next_attempt_at: null,
        expires_at: new Date(now.getTime() + expiresInMs).toISOString(),
      })
      .eq("id", prior.data.id)
      .in("status", ["FAILED", "CANCELLED"])
      .select(
        "id,operation_type,target_type,target_id,status,attempt_count,created_at",
      )
      .maybeSingle();
    if (retried.error) throw retried.error;
    if (retried.data)
      return {
        queued: true,
        existing: true,
        retried: true,
        request: retried.data,
      };
    const winner = await findActive(db, request);
    if (winner.error) throw winner.error;
    if (winner.data)
      return { queued: true, existing: true, request: winner.data };
  }

  const queued = await db
    .from("coupang_operation_requests")
    .insert({
      operation_type: request.operationType,
      target_type: request.targetType,
      target_id: request.targetId,
      status: "PENDING",
      payload: seal(input.payload || {}),
      result_json: {},
      confirmed_at: now.toISOString(),
      expires_at: new Date(now.getTime() + expiresInMs).toISOString(),
      idempotency_key: idempotencyKey,
    })
    .select("id,operation_type,target_type,target_id,status,created_at")
    .single();

  // The partial unique index closes the small race between the lookup above
  // and concurrent inserts. Return the winner so the caller can poll it.
  if (queued.error?.code === "23505") {
    const active = await findActive(db, request);
    if (active.error) throw active.error;
    if (active.data)
      return { queued: true, existing: true, request: active.data };
  }
  if (queued.error) throw queued.error;
  return { queued: true, existing: false, request: queued.data };
}

module.exports = {
  ACTIVE_STATUSES,
  encryptionKey,
  seal,
  open,
  validateRequest,
  findByIdempotencyKey,
  queueOperation,
};
