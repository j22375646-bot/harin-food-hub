import supabaseModule from "../../../../lib/cafe24/supabase.js";
import cafe24Config from "../../../../lib/cafe24/config.js";
import cafe24Sync from "../../../../lib/cafe24/sync.js";
import queueModule from "../../../../lib/coupang/request-queue.js";
import operationQueue from "../../../../lib/coupang/operation-queue.js";
import unifiedOrdersModule from "../../../../lib/orders/unified-orders.js";
import trackingQueue from "../../../../lib/shipping/tracking-queue.js";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (
    Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`
  )
    return true;
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const expected = crypto
    .createHash("sha256")
    .update(`harin-hourly-orders\0${serviceKey}`)
    .digest("hex");
  const provided = String(request.headers.get("x-harin-hourly-token") || "");
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return (
    Boolean(serviceKey) && a.length === b.length && crypto.timingSafeEqual(a, b)
  );
}

export async function GET(request) {
  if (!authorized(request))
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const startedAt = new Date();
  const hourKey = startedAt.toISOString().slice(0, 13);
  const db = supabaseModule.getSupabase();
  const latestNaver = await db
    .from("sync_logs")
    .select("metadata")
    .eq("platform", "NAVER")
    .eq("job_type", "COMMERCE_CONNECTION_TEST")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const naverReady =
    !latestNaver.error &&
    Boolean(latestNaver.data?.metadata?.capabilities?.inquiries?.read);
  const [cafe24, coupang, coupangCs, naverCommerce] = await Promise.allSettled([
    cafe24Sync.syncOrdersRealtime(cafe24Config.getConfig(), { days: 31 }),
    queueModule.queueRequest(db, "ORDER_REALTIME", {
      idempotencyKey: `orders-hourly:${hourKey}`,
    }),
    queueModule.queueRequest(db, "CS_REALTIME", {
      idempotencyKey: `cs-hourly:coupang:${hourKey}`,
    }),
    naverReady
      ? operationQueue.queueOperation(db, {
          operationType: "NAVER_COMMERCE_SYNC",
          targetType: "CHANNEL",
          targetId: "SMARTSTORE",
          payload: { requestedAt: startedAt.toISOString() },
          idempotencyKey: `commerce-hourly:naver:${hourKey}`,
        })
      : Promise.resolve({ skipped: true, status: "SETUP_REQUIRED" }),
  ]);
  const tracking = await Promise.resolve()
    .then(async () => {
      const center = await unifiedOrdersModule.loadUnifiedOrders({ db });
      const orders = center.orders.filter(
        (order) => order.stage !== "DELIVERED",
      );
      return trackingQueue.queueTrackingForOrders(db, orders, {
        kind: "hourly",
        at: startedAt,
      });
    })
    .then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason }),
    );
  const jobs = [
    cafe24.status === "fulfilled"
      ? { platform: "CAFE24", ok: true, data: cafe24.value }
      : {
          platform: "CAFE24",
          ok: false,
          error: cafe24.reason?.message || "수집 실패",
        },
    coupang.status === "fulfilled"
      ? { platform: "COUPANG", ok: true, data: coupang.value }
      : {
          platform: "COUPANG",
          ok: false,
          error: coupang.reason?.message || "수집 요청 실패",
        },
    coupangCs.status === "fulfilled"
      ? { platform: "COUPANG_CS", ok: true, data: coupangCs.value }
      : {
          platform: "COUPANG_CS",
          ok: false,
          error: coupangCs.reason?.message || "CS 수집 요청 실패",
        },
    naverCommerce.status === "fulfilled"
      ? {
          platform: "NAVER_COMMERCE",
          ok: !naverCommerce.value.skipped,
          skipped: Boolean(naverCommerce.value.skipped),
          data: naverCommerce.value,
        }
      : {
          platform: "NAVER_COMMERCE",
          ok: false,
          error: naverCommerce.reason?.message || "네이버 커머스 수집 요청 실패",
        },
    tracking.status === "fulfilled"
      ? {
          platform: "EPOST_TRACKING",
          ok: true,
          data: { queued: tracking.value.length },
        }
      : {
          platform: "EPOST_TRACKING",
          ok: false,
          error: tracking.reason?.message || "배송추적 요청 실패",
        },
  ];
  const available = jobs.filter((job) => !job.skipped);
  const ok = available.every((job) => job.ok);
  return Response.json(
    {
      ok,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      schedule: "0 * * * *",
      jobs,
    },
    { status: ok ? 200 : 207 },
  );
}
