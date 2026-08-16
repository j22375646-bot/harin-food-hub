"use strict";

const client = require("./client.js");
const store = require("../customer-service/store.js");
const { kstIso } = require("./probe.js");

const text = (value) => (value == null ? "" : String(value).trim());
const stripHtml = (value) =>
  text(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

function collection(payload) {
  for (const value of [
    payload,
    payload?.contents,
    payload?.content,
    payload?.data,
    payload?.data?.contents,
    payload?.data?.content,
    payload?.data?.lastChangeStatuses,
  ]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function mapQna(item) {
  const sourceId = text(
    item.questionId ?? item.id ?? item.qnaId ?? item.inquiryId,
  );
  if (!sourceId) return null;
  const answered = Boolean(
    item.answer ||
      item.answerContent ||
      item.answered === true ||
      /ANSWER|COMPLETE/i.test(text(item.status || item.answerStatus)),
  );
  return {
    platform: "NAVER",
    kind: "INQUIRY",
    sourceId,
    sourceSubtype: "COMMERCE_QNA",
    status:
      text(item.answerStatus || item.status) ||
      (answered ? "ANSWERED" : "WAITING"),
    completed: answered,
    answered,
    orderId: item.orderId || item.productOrderId,
    productId: item.productNo || item.productId || item.originProductNo,
    occurredAt:
      item.createDate ||
      item.createdDate ||
      item.questionDate ||
      item.inquiryDate,
    sourceUpdatedAt: item.modifyDate || item.updatedDate || item.answerDate,
    title: stripHtml(item.title || item.questionTitle) || "네이버 상품 문의",
    content:
      stripHtml(item.question || item.content || item.questionContent) ||
      "문의 내용 확인 필요",
    rawSummary: {
      category: item.category || item.type || null,
      status: item.status || item.answerStatus || null,
    },
  };
}

function claimKind(item) {
  const value = text(
    item.lastChangedType || item.claimType || item.type,
  ).toUpperCase();
  if (value.includes("EXCHANGE")) return "EXCHANGE";
  if (value.includes("RETURN")) return "RETURN";
  if (value.includes("CANCEL")) return "CANCEL";
  return null;
}

function mapClaim(item) {
  const kind = claimKind(item);
  if (!kind) return null;
  const sourceId = text(item.claimId || item.productOrderId || item.orderId);
  if (!sourceId) return null;
  const status = text(
    item.claimStatus || item.lastChangedType || item.productOrderStatus,
  );
  const completed =
    /(COMPLETE|COMPLETED|DONE|REJECT|WITHDRAW|CANCEL_DONE|RETURN_DONE|EXCHANGE_DONE)/i.test(
      status,
    );
  return {
    platform: "NAVER",
    kind,
    sourceId,
    sourceSubtype: "LAST_CHANGED_STATUS",
    status: status || "REQUESTED",
    completed,
    answered: false,
    orderId: item.orderId || item.productOrderId,
    productId: item.productId || item.productNo,
    occurredAt:
      item.lastChangedDate || item.claimRequestDate || item.paymentDate,
    sourceUpdatedAt: item.lastChangedDate,
    title: `네이버 ${kind === "CANCEL" ? "취소" : kind === "RETURN" ? "반품" : "교환"} 요청`,
    content:
      stripHtml(item.claimReason || item.reason) ||
      "요청 사유는 네이버 판매자센터에서 확인하세요.",
    rawSummary: {
      lastChangedType: item.lastChangedType || null,
      claimStatus: item.claimStatus || null,
      productOrderStatus: item.productOrderStatus || null,
    },
  };
}

async function fetchQnas(config, now = new Date(), maxPages = 10) {
  const rows = [];
  const from = new Date(now.getTime() - 31 * 86400000);
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await client.request("GET", "/v1/contents/qnas", {
      config,
      query: {
        page,
        size: 100,
        fromDate: from.toISOString(),
        toDate: now.toISOString(),
      },
    });
    const batch = collection(result.data);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

async function fetchClaims(config, now = new Date()) {
  const from = new Date(now.getTime() - 7 * 86400000);
  const rows = [];
  const seen = new Set();
  const day = 24 * 60 * 60 * 1000;

  // Naver only accepts a maximum 24-hour window for this endpoint. The old
  // seven-day request was rejected as an invalid date range every hour.
  for (let cursor = from.getTime(); cursor <= now.getTime(); cursor += day) {
    const windowEnd = Math.min(cursor + day - 1, now.getTime());
    let moreFrom = null;
    let moreSequence = null;
    do {
      const query = {
        lastChangedFrom: moreFrom || kstIso(new Date(cursor)),
        lastChangedTo: kstIso(new Date(windowEnd)),
        limitCount: 300,
      };
      if (moreSequence) query.moreSequence = moreSequence;
      const result = await client.request(
        "GET",
        "/v1/pay-order/seller/product-orders/last-changed-statuses",
        { config, query },
      );
      for (const item of collection(result.data)) {
        const key = `${text(item.productOrderId || item.claimId || item.orderId)}:${text(item.lastChangedDate || item.claimRequestDate)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(item);
      }
      const more = result.data?.data?.more || result.data?.more || null;
      moreFrom = text(more?.moreFrom) || null;
      moreSequence = text(more?.moreSequence) || null;
    } while (moreFrom && moreSequence);
  }
  return rows;
}

async function sync({ db, now = new Date() } = {}) {
  const config = client.getConfig();
  const started = await db
    .from("sync_logs")
    .insert({
      platform: "NAVER",
      job_type: "CUSTOMER_SERVICE",
      status: "RUNNING",
    })
    .select("id")
    .single();
  if (started.error) throw started.error;
  const errors = [];
  let qnas = [];
  let changes = [];
  try {
    try {
      qnas = await fetchQnas(config, now);
    } catch (error) {
      errors.push({
        dataset: "qnas",
        message: error.message,
        status: error.status || null,
      });
    }
    try {
      changes = await fetchClaims(config, now);
    } catch (error) {
      errors.push({
        dataset: "claims",
        message: error.message,
        status: error.status || null,
      });
    }
    const rows = [...qnas.map(mapQna), ...changes.map(mapClaim)].filter(
      Boolean,
    );
    const stored = await store.upsertItems(db, rows);
    const status = errors.length
      ? rows.length
        ? "PARTIAL"
        : "FAILED"
      : "SUCCESS";
    const metadata = {
      counts: {
        inquiries: rows.filter((item) => item.kind === "INQUIRY").length,
        claims: rows.filter((item) => item.kind !== "INQUIRY").length,
        stored,
      },
      errors,
      fixedIp: true,
    };
    const finishedAt = new Date().toISOString();
    const saved = await db
      .from("sync_logs")
      .update({
        status,
        finished_at: finishedAt,
        rows_received: stored,
        error_message: errors.length ? JSON.stringify(errors) : null,
        metadata,
      })
      .eq("id", started.data.id);
    if (saved.error) throw saved.error;
    return { syncLogId: started.data.id, status, ...metadata };
  } catch (error) {
    await db
      .from("sync_logs")
      .update({
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_message: error.message,
        metadata: { errors },
      })
      .eq("id", started.data.id);
    throw error;
  }
}

module.exports = {
  collection,
  mapQna,
  claimKind,
  mapClaim,
  fetchQnas,
  fetchClaims,
  sync,
};
