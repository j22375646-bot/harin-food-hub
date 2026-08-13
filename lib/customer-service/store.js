"use strict";

const operationQueue = require("../coupang/operation-queue.js");

const ALLOWED_PLATFORMS = new Set(["NAVER", "CAFE24"]);
const ALLOWED_KINDS = new Set(["INQUIRY", "CANCEL", "RETURN", "EXCHANGE"]);
const text = (value) => (value == null ? "" : String(value).trim());
const chunks = (items, size = 300) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

function envelope(value, secret) {
  return operationQueue.seal({ value: text(value).slice(0, 10000) }, secret);
}

function reveal(value, secret) {
  if (!value || !Object.keys(value).length) return "";
  try {
    return text(operationQueue.open(value, secret)?.value);
  } catch {
    return "내용 복호화 확인 필요";
  }
}

function normalize(input, secret) {
  const platform = text(input.platform).toUpperCase();
  const kind = text(input.kind).toUpperCase();
  const sourceId = text(input.sourceId || input.source_id);
  if (!ALLOWED_PLATFORMS.has(platform))
    throw new Error(`지원하지 않는 CS 플랫폼입니다: ${platform}`);
  if (!ALLOWED_KINDS.has(kind))
    throw new Error(`지원하지 않는 CS 유형입니다: ${kind}`);
  if (!sourceId) throw new Error("CS 원본 번호가 필요합니다.");
  return {
    source_key: `${platform}:${kind}:${sourceId}`,
    platform,
    kind,
    source_id: sourceId,
    source_subtype: text(input.sourceSubtype || input.source_subtype) || null,
    status: text(input.status) || null,
    completed: Boolean(input.completed),
    answered: Boolean(input.answered),
    order_id: text(input.orderId || input.order_id) || null,
    product_id: text(input.productId || input.product_id) || null,
    occurred_at: input.occurredAt || input.occurred_at || null,
    title_envelope: envelope(input.title, secret),
    content_envelope: envelope(input.content, secret),
    raw_summary: input.rawSummary || input.raw_summary || {},
    source_updated_at: input.sourceUpdatedAt || input.source_updated_at || null,
    collected_at: new Date().toISOString(),
  };
}

async function upsertItems(db, items, options = {}) {
  const rows = items.map((item) => normalize(item, options.secret));
  for (const batch of chunks(rows)) {
    const result = await db
      .from("customer_service_items")
      .upsert(batch, { onConflict: "source_key" });
    if (result.error) throw result.error;
  }
  return rows.length;
}

function hydrateRows(rows = [], options = {}) {
  return rows.map((row) => ({
    ...row,
    title: reveal(row.title_envelope, options.secret),
    content: reveal(row.content_envelope, options.secret),
  }));
}

module.exports = { envelope, reveal, normalize, upsertItems, hydrateRows };
