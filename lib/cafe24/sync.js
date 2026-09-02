"use strict";

const { adminGet, analyticsGet } = require("./client");
const { db, insertRaw, startSync, finishSync } = require("./supabase");
const map = require("./mappers");
const customerService = require("./customer-service.js");
const cafe24Catalog = require("../products/cafe24-catalog.js");
const financeAdvertising = require("./finance-advertising.js");
const financeCapability = require("./finance-capability.js");
const tokenStore = require("./token-store.js");

const isoDate = (d) => d.toISOString().slice(0, 10);
const koreaDate = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const chunks = (items, size = 500) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

function dateRanges(start, end, maximumDays = 31) {
  const ranges = [];
  let cursor = new Date(start);
  const last = new Date(end);
  while (cursor <= last) {
    const rangeEnd = new Date(cursor);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + maximumDays - 1);
    if (rangeEnd > last) rangeEnd.setTime(last.getTime());
    ranges.push({ start_date: isoDate(cursor), end_date: isoDate(rangeEnd) });
    cursor = new Date(rangeEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ranges;
}

function orderRangesForSync({
  end = new Date(),
  syncDays = 7,
  historyDays = 90,
  earliestOrderDate = null,
} = {}) {
  const targetStart = new Date(end);
  targetStart.setUTCDate(targetStart.getUTCDate() - historyDays + 1);
  const currentStart = new Date(end);
  currentStart.setUTCDate(currentStart.getUTCDate() - syncDays + 1);
  const ranges = [
    {
      start_date: isoDate(currentStart),
      end_date: isoDate(end),
      mode: "CURRENT",
    },
  ];
  const earliest = earliestOrderDate ? new Date(earliestOrderDate) : null;
  if (!earliest || earliest > targetStart) {
    const backfillEnd = earliest
      ? new Date(earliest.getTime() - 86400000)
      : new Date(currentStart.getTime() - 86400000);
    if (backfillEnd >= targetStart) {
      const backfillStart = new Date(backfillEnd);
      backfillStart.setUTCDate(backfillStart.getUTCDate() - 30);
      if (backfillStart < targetStart)
        backfillStart.setTime(targetStart.getTime());
      ranges.push({
        start_date: isoDate(backfillStart),
        end_date: isoDate(backfillEnd),
        mode: "BACKFILL",
      });
    }
  }
  return ranges;
}

async function saveRaw(endpoint, result, period = {}) {
  await insertRaw({
    platform: "CAFE24",
    endpoint,
    http_status: result.status,
    response_json: result.payload,
    ...period,
  });
}

async function upsertMany(table, records, onConflict) {
  if (!records.length) return 0;
  for (const batch of chunks(records))
    await db(table, (q) => q.upsert(batch, { onConflict, count: "exact" }));
  return records.length;
}

async function fetchAdminCollection(config, path, key, params = {}) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const result = await adminGet(config, path, {
      ...params,
      limit: 100,
      offset,
    });
    await saveRaw(`${path}?offset=${offset}`, result);
    const page = result.payload?.[key] || [];
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}

function analyticsTotal(payload, candidates) {
  const data = map.rows(payload);
  if (!data.length) return null;
  for (const key of candidates) {
    const values = data
      .map((row) => map.number(row[key]))
      .filter(Number.isFinite);
    if (values.length) return values.reduce((a, b) => a + b, 0);
  }
  return null;
}

function analyticsByDate(payload, candidates, fallbackDate) {
  const result = new Map();
  for (const row of map.rows(payload)) {
    const date = String(
      row.date || row.day || row.stat_date || fallbackDate,
    ).slice(0, 10);
    let value = null;
    for (const key of candidates) {
      const parsed = map.number(row[key]);
      if (Number.isFinite(parsed)) {
        value = parsed;
        break;
      }
    }
    if (value != null) result.set(date, (result.get(date) || 0) + value);
  }
  return result;
}

function mergeProductVariants(product, payload) {
  const variants = Array.isArray(payload?.variants) ? payload.variants : [];
  return { ...product, variants };
}

async function fetchProductInventories(config, products, errors) {
  const enriched = [];
  for (const batch of chunks(products, 5)) {
    const results = await Promise.all(batch.map(async product => {
      try {
        const path = `/products/${encodeURIComponent(product.product_no)}/variants`;
        const result = await adminGet(config, path, { embed: 'inventories' });
        await saveRaw(`${path}?embed=inventories`, result);
        return mergeProductVariants(product, result.payload);
      } catch (error) {
        errors.push({ dataset:'productInventory', productNo:product.product_no, message:error.message });
        return product;
      }
    }));
    enriched.push(...results);
  }
  return enriched;
}

async function syncAll(config) {
  const logId = await startSync();
  const counts = {
    products: 0,
    productVariants: 0,
    orders: 0,
    orderItems: 0,
    inquiries: 0,
    claims: 0,
    traffic: 0,
    referrers: 0,
    salesDaily: 0,
    adAttribution: 0,
    rawResponses: 0,
  };
  const errors = [];
  let catalogSummary = null;
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - config.syncDays + 1);
  const historyStart = new Date(end);
  historyStart.setUTCDate(
    historyStart.getUTCDate() - (config.orderHistoryDays || 90) + 1,
  );
  const period = { start_date: isoDate(start), end_date: isoDate(end) };
  let orderPeriod = { start_date: isoDate(start), end_date: isoDate(end) };

  try {
    const productCatalog = await fetchAdminCollection(
      config,
      "/products",
      "products",
    );
    const products = await fetchProductInventories(config, productCatalog, errors);
    counts.productVariants = products.reduce((sum, product) => sum + (Array.isArray(product.variants) ? product.variants.length : 0), 0);
    counts.products = await upsertMany(
      "cafe24_products",
      products.map(map.product),
      "external_product_no",
    );
    catalogSummary = await cafe24Catalog.reconcileCafe24Catalog({
      db:require("./supabase.js").getSupabase(),
      products:products.map(map.product),
    });

    const earliestResult = await db("cafe24_orders", (q) =>
      q
        .select("order_date")
        .order("order_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    );
    const orderRanges = orderRangesForSync({
      end,
      syncDays: config.syncDays,
      historyDays: config.orderHistoryDays || 90,
      earliestOrderDate: earliestResult.data?.order_date,
    });
    const coverageStarts = [
      earliestResult.data?.order_date,
      ...orderRanges.map((range) => range.start_date),
    ]
      .filter(Boolean)
      .map((value) => isoDate(new Date(value)))
      .sort();
    orderPeriod = {
      start_date:
        coverageStarts[0] && coverageStarts[0] < isoDate(historyStart)
          ? isoDate(historyStart)
          : coverageStarts[0] || isoDate(start),
      end_date: isoDate(end),
    };
    const orderMap = new Map();
    for (const range of orderRanges) {
      const rangeOrders = await fetchAdminCollection(
        config,
        "/orders",
        "orders",
        { start_date: range.start_date, end_date: range.end_date },
      );
      for (const order of rangeOrders)
        orderMap.set(String(order.order_id), order);
    }
    const orders = [...orderMap.values()];
    counts.orders = await upsertMany(
      "cafe24_orders",
      orders.map(map.order),
      "order_id",
    );
    const existingItemOrders = new Set();
    const orderIds = orders
      .map((order) => String(order.order_id))
      .filter(Boolean);
    for (const batch of chunks(orderIds, 200)) {
      if (!batch.length) continue;
      const existing = await db("cafe24_order_items", (q) =>
        q.select("order_id").in("order_id", batch),
      );
      for (const row of existing.data || [])
        existingItemOrders.add(String(row.order_id));
    }
    const items = [];
    for (const order of orders.filter(
      (order) => !existingItemOrders.has(String(order.order_id)),
    )) {
      try {
        const result = await adminGet(
          config,
          `/orders/${encodeURIComponent(order.order_id)}/items`,
        );
        await saveRaw(`/orders/${order.order_id}/items`, result);
        items.push(
          ...(result.payload?.items || []).map((value, index) =>
            map.item(order.order_id, value, index),
          ),
        );
      } catch (error) {
        errors.push({
          dataset: "orderItems",
          orderId: order.order_id,
          message: error.message,
        });
      }
    }
    counts.orderItems = await upsertMany(
      "cafe24_order_items",
      items,
      "order_id,external_item_id",
    );

    try {
      const cs = await customerService.sync(config, {
        db: require("./supabase.js").getSupabase(),
        period: { start: period.start_date, end: period.end_date },
      });
      counts.inquiries = cs.inquiries;
      counts.claims = cs.claims;
      if (cs.errors.length)
        errors.push(
          ...cs.errors.map((error) => ({
            dataset: `customerService:${error.dataset}`,
            ...error,
          })),
        );
    } catch (error) {
      errors.push({
        dataset: "customerService",
        message: error.message,
        status: error.status || null,
      });
    }

    const analytics = {};
    for (const [name, path] of Object.entries(config.analyticsPaths)) {
      try {
        analytics[name] = await analyticsGet(config, path, period);
        await saveRaw(path, analytics[name], {
          period_start: period.start_date,
          period_end: period.end_date,
        });
      } catch (error) {
        errors.push({ dataset: name, message: error.message });
      }
    }
    try {
      const capability=financeCapability.assessFinanceCapability(await tokenStore.readToken());
      if(!capability.shouldCollect){
        errors.push({
          dataset:"salesDaily",
          status:null,
          code:capability.status,
          scope:capability.scope,
          message:capability.action,
          docs_url:capability.docsUrl
        });
      } else {
        const dailySales=await adminGet(config,"/financials/dailysales",period);
        await saveRaw("/financials/dailysales",dailySales,{period_start:period.start_date,period_end:period.end_date});
        counts.salesDaily=await upsertMany(
          "cafe24_sales_daily",
          financeAdvertising.mapDailySales(dailySales.payload,{shopNo:config.shopNo}),
          "date,shop_no"
        );
      }
    } catch(error) {
      errors.push({
        dataset:"salesDaily",
        status:error.status || null,
        code:error.status===403?'APPROVAL_REQUIRED':'COLLECTION_FAILED',
        message:error.status===403
          ? financeCapability.APPROVAL_ACTION
          : error.message,
        scope:error.status===403?financeCapability.SALES_REPORT_SCOPE:null,
        docs_url:error.status===403?financeCapability.DOCS_URL:null
      });
    }
    const adAttribution=financeAdvertising.mapAdAttribution({
      adDetails:analytics.adDetails?.payload,
      adKeywordSales:analytics.adKeywordSales?.payload,
      adSales:analytics.adSales?.payload,
      adVisits:analytics.adVisits?.payload
    },{shopNo:config.shopNo,period});
    counts.adAttribution=await upsertMany(
      "cafe24_ad_attribution",
      adAttribution,
      "period_start,period_end,shop_no,dimension_type,ad,keyword_key"
    );
    const visitorsByDate = analytics.visitors
      ? analyticsByDate(
          analytics.visitors.payload,
          ["visitors", "visit_count", "visitor_count", "count", "value"],
          period.end_date,
        )
      : new Map();
    const pageviewsByDate = analytics.pageviews
      ? analyticsByDate(
          analytics.pageviews.payload,
          ["pageviews", "page_view", "count", "value"],
          period.end_date,
        )
      : new Map();
    if (analytics.visitors || analytics.pageviews) {
      const dates = [
        ...new Set([...visitorsByDate.keys(), ...pageviewsByDate.keys()]),
      ];
      const traffic = dates.length
        ? dates.map((date) => ({
            date,
            shop_no: config.shopNo,
            visitors: visitorsByDate.get(date) ?? null,
            pageviews: pageviewsByDate.get(date) ?? null,
            source_status: "OK",
            raw_data: {
              visitors: analytics.visitors?.payload,
              pageviews: analytics.pageviews?.payload,
            },
          }))
        : [
            {
              date: period.end_date,
              shop_no: config.shopNo,
              visitors: null,
              pageviews: null,
              source_status: "PARSE_ERROR",
              raw_data: {
                visitors: analytics.visitors?.payload,
                pageviews: analytics.pageviews?.payload,
              },
            },
          ];
      counts.traffic = await upsertMany(
        "cafe24_traffic_daily",
        traffic,
        "date,shop_no",
      );
    }
    if (analytics.referrers) {
      const refs = map.rows(analytics.referrers.payload).map((r, i) => ({
        date: r.date || period.end_date,
        shop_no: config.shopNo,
        source: String(
          r.source ||
            r.referrer ||
            r.channel ||
            r.domain ||
            r.url ||
            `unknown-${i}`,
        ),
        visitors: map.number(r.visitors ?? r.visit_count ?? r.count),
        orders: map.number(r.orders ?? r.order_count),
        revenue: map.number(r.revenue ?? r.sales ?? r.order_amount),
        raw_data: r,
      }));
      counts.referrers = await upsertMany(
        "cafe24_referrers_daily",
        refs,
        "date,shop_no,source",
      );
    }
    const rawCount = await db("raw_api_responses", (q) =>
      q
        .select("*", { count: "exact", head: true })
        .eq("platform", "CAFE24")
        .gte(
          "requested_at",
          new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        ),
    );
    counts.rawResponses = rawCount.count || 0;
    const status = errors.length ? "PARTIAL" : "SUCCESS";
    await finishSync(logId, {
      status,
      rows_received: Object.values(counts).reduce((a, b) => a + b, 0),
      error_message: errors.length ? JSON.stringify(errors) : null,
      metadata: {
        counts,
        catalog:catalogSummary,
        errors,
        period,
        order_period: orderPeriod,
        order_ranges: orderRanges,
        capabilities:{
          settlement:errors.find(error=>error.dataset==='salesDaily')?.code||'READY',
          advertising:errors.some(error=>String(error.dataset).startsWith('ad'))?'VERIFY_REQUIRED':'READY'
        }
      },
    });
    return {
      syncLogId: logId,
      status,
      period,
      orderPeriod,
      orderRanges,
      counts,
      errors,
    };
  } catch (error) {
    errors.push({ dataset: "sync", message: error.message });
    await finishSync(logId, {
      status: "FAILED",
      rows_received: Object.values(counts).reduce((a, b) => a + b, 0),
      error_message: error.message,
      metadata: { counts, errors, period },
    }).catch(() => {});
    throw Object.assign(error, {
      syncResult: {
        syncLogId: logId,
        status: "FAILED",
        period,
        counts,
        errors,
      },
    });
  }
}

async function syncOrdersRealtime(config, { days = 90, includeCustomerService = true, jobType = "ORDERS_REALTIME" } = {}) {
  const logId = await startSync(jobType);
  const end = new Date();
  const endDate = koreaDate(end);
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(
    start.getUTCDate() - Math.max(1, Math.min(Number(days) || 31, 90)) + 1,
  );
  const ranges = dateRanges(start, new Date(`${endDate}T00:00:00Z`), 31);
  const orderMap = new Map();
  try {
    for (const range of ranges) {
      for (let offset = 0; ; offset += 100) {
        const result = await adminGet(config, "/orders", {
          start_date: range.start_date,
          end_date: range.end_date,
          embed: "items,cancellation,return,exchange",
          limit: 100,
          offset,
        });
        const page = result.payload?.orders || [];
        for (const order of page) orderMap.set(String(order.order_id), order);
        if (page.length < 100) break;
      }
    }
    const orders = [...orderMap.values()];
    const orderRows = orders.map((order) => {
      const {
        items,
        cancellation,
        return: returned,
        exchange,
        ...orderOnly
      } = order;
      return map.order(orderOnly);
    });
    const itemRows = orders.flatMap((order) =>
      (Array.isArray(order.items) ? order.items : []).map((item, index) =>
        map.item(order.order_id, item, index),
      ),
    );
    const counts = {
      orders: await upsertMany("cafe24_orders", orderRows, "order_id"),
      orderItems: await upsertMany(
        "cafe24_order_items",
        itemRows,
        "order_id,external_item_id",
      ),
    };
    if (includeCustomerService) {
      try {
        const cs = await customerService.sync(config, {
          db: require("./supabase.js").getSupabase(),
          orders,
          period: { start: isoDate(start), end: endDate },
        });
        counts.inquiries = cs.inquiries;
        counts.claims = cs.claims;
        if (cs.errors.length) counts.customerServiceWarnings = cs.errors;
      } catch (error) {
        counts.customerServiceWarning = error.message;
      }
    }
    const finishedAt = new Date().toISOString();
    await finishSync(logId, {
      status:
        counts.customerServiceWarning || counts.customerServiceWarnings
          ? "PARTIAL"
          : "SUCCESS",
      rows_received:
        counts.orders +
        counts.orderItems +
        Number(counts.inquiries || 0) +
        Number(counts.claims || 0),
      error_message:
        counts.customerServiceWarning || counts.customerServiceWarnings
          ? JSON.stringify(
              counts.customerServiceWarnings || [
                { message: counts.customerServiceWarning },
              ],
            )
          : null,
      metadata: {
        counts,
        period: { start: isoDate(start), end: endDate },
        realtime: true,
        embeddedItems: true,
        customerService: includeCustomerService,
        jobType,
        businessTimezone: "Asia/Seoul",
      },
    });
    return {
      syncLogId: logId,
      status:
        counts.customerServiceWarning || counts.customerServiceWarnings
          ? "PARTIAL"
          : "SUCCESS",
      counts,
      finishedAt,
      period: { start: isoDate(start), end: endDate },
    };
  } catch (error) {
    await finishSync(logId, {
      status: "FAILED",
      rows_received: 0,
      error_message: error.message,
      metadata: { realtime: true, customerService:includeCustomerService, jobType },
    }).catch(() => {});
    throw error;
  }
}

module.exports = {
  syncAll,
  syncOrdersRealtime,
  analyticsTotal,
  analyticsByDate,
  dateRanges,
  orderRangesForSync,
  mergeProductVariants,
  mapAdAttribution:financeAdvertising.mapAdAttribution,
};
