"use strict";

const { adminGet } = require("./client.js");
const store = require("../customer-service/store.js");

const text = (value) => (value == null ? "" : String(value).trim());
const stripHtml = (value) =>
  text(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
const array = (value) =>
  Array.isArray(value)
    ? value
    : value && typeof value === "object" && Object.keys(value).length
      ? [value]
      : [];
const kindLabel = { CANCEL: "취소", RETURN: "반품", EXCHANGE: "교환" };

function selectedBoards(boards = []) {
  const matched = boards.filter((board) =>
    /문의|질문|상담|q\s*&?\s*a/i.test(`${board.board_name || ""}`),
  );
  return (
    matched.length
      ? matched
      : boards.filter((board) => [6, 9].includes(Number(board.board_no)))
  )
    .filter((board) => board.use_board !== "F")
    .map((board) => ({
      boardNo: Number(board.board_no),
      name: text(board.board_name),
    }))
    .filter((board) => Number.isInteger(board.boardNo));
}

async function fetchPages(config, path, key, params = {}, maxPages = 10) {
  const rows = [];
  for (let offset = 0, page = 0; page < maxPages; page += 1, offset += 100) {
    const result = await adminGet(config, path, {
      ...params,
      limit: 100,
      offset,
    });
    const batch = result.payload?.[key] || [];
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

function mapArticles(articles = [], board) {
  const replies = new Set(
    articles
      .filter((item) => Number(item.parent_article_no) > 0)
      .map((item) => String(item.parent_article_no)),
  );
  return articles
    .filter((item) => !Number(item.parent_article_no) && item.deleted !== "T")
    .map((item) => {
      const sourceId = `${board.boardNo}:${item.article_no}`;
      const answered =
        item.reply === "T" ||
        item.reply_status === "C" ||
        replies.has(String(item.article_no));
      return {
        platform: "CAFE24",
        kind: "INQUIRY",
        sourceId,
        sourceSubtype: `BOARD_${board.boardNo}`,
        status: answered ? "ANSWERED" : "WAITING",
        completed: answered,
        answered,
        orderId: item.order_id,
        productId: item.product_no,
        occurredAt: item.created_date,
        sourceUpdatedAt: item.display_time || item.created_date,
        title: stripHtml(item.title) || `${board.name} 문의`,
        content: stripHtml(item.content) || "문의 내용 확인 필요",
        rawSummary: {
          boardNo: board.boardNo,
          boardName: board.name,
          articleNo: item.article_no,
          replyStatus: item.reply_status || null,
          secret: item.secret === "T",
          inputChannel: item.input_channel || null,
        },
      };
    });
}

function meaningfulClaim(value) {
  return Boolean(
    text(value?.claim_code) ||
      text(value?.claim_reason) ||
      text(value?.refund_reason) ||
      array(value?.items).length,
  );
}

function claimCompleted(order, claim) {
  const statuses = array(claim?.items)
    .map((item) => text(item.order_status || item.status))
    .filter(Boolean);
  if (!statuses.length)
    statuses.push(
      ...array(order?.items)
        .map((item) => text(item.order_status || item.status))
        .filter(Boolean),
    );
  if (claim?.undone === "T") return true;
  return (
    statuses.length > 0 &&
    statuses.every((status) =>
      /^(?:C40|R40|E40|CANCEL_COMPLETE|RETURN_COMPLETE|EXCHANGE_COMPLETE)$/i.test(
        status,
      ),
    )
  );
}

function mapClaims(orders = []) {
  const rows = [];
  for (const order of orders) {
    for (const [sourceField, kind] of [
      ["cancellation", "CANCEL"],
      ["return", "RETURN"],
      ["exchange", "EXCHANGE"],
    ]) {
      array(order[sourceField])
        .filter(meaningfulClaim)
        .forEach((claim, index) => {
          const sourceId =
            text(claim.claim_code) ||
            `${order.order_id}:${sourceField}:${index}`;
          const completed = claimCompleted(order, claim);
          const statuses = [
            ...new Set(
              [...array(claim.items), ...array(order.items)]
                .map((item) => text(item.order_status || item.status))
                .filter(Boolean),
            ),
          ];
          rows.push({
            platform: "CAFE24",
            kind,
            sourceId,
            sourceSubtype: "ORDER_CLAIM",
            status:
              statuses.join(",") || (completed ? "COMPLETED" : "REQUESTED"),
            completed,
            answered: false,
            orderId: claim.order_id || order.order_id,
            productId:
              array(claim.items)[0]?.product_no ||
              array(order.items)[0]?.product_no,
            occurredAt:
              claim.request_date ||
              claim.created_date ||
              claim.claim_due_date ||
              order.order_date,
            sourceUpdatedAt:
              claim.updated_date || order.updated_date || order.order_date,
            title: `Cafe24 ${kindLabel[kind]} 요청`,
            content:
              stripHtml(
                claim.claim_reason ||
                  claim.refund_reason ||
                  claim.undone_reason,
              ) || `${kindLabel[kind]} 사유 확인 필요`,
            rawSummary: {
              claimCode: text(claim.claim_code) || null,
              statuses,
              pickupState: claim.pickup_request_state || null,
              returnInvoiceSuccess: claim.return_invoice_success || null,
            },
          });
        });
    }
  }
  return rows;
}

async function collect(config, { orders = [], period = {} } = {}) {
  let claimOrders = orders;
  if (!claimOrders.length && period.start && period.end) {
    claimOrders = await fetchPages(
      config,
      "/orders",
      "orders",
      {
        start_date: period.start,
        end_date: period.end,
        embed: "items,cancellation,return,exchange",
      },
      1,
    );
  }
  const boardResult = await adminGet(config, "/boards", { limit: 100 });
  const boards = selectedBoards(boardResult.payload?.boards || []);
  const inquiries = [];
  const errors = [];
  for (const board of boards) {
    try {
      const articles = await fetchPages(
        config,
        `/boards/${board.boardNo}/articles`,
        "articles",
      );
      inquiries.push(...mapArticles(articles, board));
    } catch (error) {
      errors.push({
        dataset: `board_${board.boardNo}`,
        message: error.message,
        status: error.status || null,
      });
    }
  }
  const cutoff = Date.parse(period.start || "") || Date.now() - 90 * 86400000;
  const recentInquiries = inquiries.filter((item) => {
    const occurredAt = Date.parse(item.occurredAt || "");
    return Number.isFinite(occurredAt) && occurredAt >= cutoff;
  });
  return {
    rows: [...recentInquiries, ...mapClaims(claimOrders)],
    boards,
    errors,
  };
}

async function sync(config, { db, orders = [], period = {} } = {}) {
  const started = await db
    .from("sync_logs")
    .insert({
      platform: "CAFE24",
      job_type: "CUSTOMER_SERVICE",
      status: "RUNNING",
    })
    .select("id")
    .single();
  if (started.error) throw started.error;
  try {
    const collected = await collect(config, { orders, period });
    const stored = await store.upsertItems(db, collected.rows);
    const status = collected.errors.length
      ? collected.rows.length
        ? "PARTIAL"
        : "FAILED"
      : "SUCCESS";
    const metadata = {
      counts: {
        stored,
        inquiries: collected.rows.filter((item) => item.kind === "INQUIRY")
          .length,
        claims: collected.rows.filter((item) => item.kind !== "INQUIRY").length,
      },
      boards: collected.boards,
      errors: collected.errors,
    };
    const saved = await db
      .from("sync_logs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        rows_received: stored,
        error_message: collected.errors.length
          ? JSON.stringify(collected.errors)
          : null,
        metadata,
      })
      .eq("id", started.data.id);
    if (saved.error) throw saved.error;
    return {
      syncLogId: started.data.id,
      status,
      stored,
      ...metadata.counts,
      boards: collected.boards,
      errors: collected.errors,
    };
  } catch (error) {
    await db
      .from("sync_logs")
      .update({
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_message: error.message,
      })
      .eq("id", started.data.id);
    throw error;
  }
}

module.exports = {
  selectedBoards,
  mapArticles,
  mapClaims,
  collect,
  sync,
  claimCompleted,
};
