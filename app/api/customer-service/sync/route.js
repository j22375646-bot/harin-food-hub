import authModule from "../../../../lib/dashboard-auth.js";
import supabaseModule from "../../../../lib/cafe24/supabase.js";
import cafe24Config from "../../../../lib/cafe24/config.js";
import cafe24CustomerService from "../../../../lib/cafe24/customer-service.js";
import requestQueue from "../../../../lib/coupang/request-queue.js";
import operationQueue from "../../../../lib/coupang/operation-queue.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cookieValue(request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${authModule.COOKIE_NAME}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

async function naverReady(db) {
  const latest = await db
    .from("sync_logs")
    .select("metadata")
    .eq("platform", "NAVER")
    .eq("job_type", "COMMERCE_CONNECTION_TEST")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw latest.error;
  return Boolean(latest.data?.metadata?.capabilities?.inquiries?.read);
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request)))
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = supabaseModule.getSupabase();
  try {
    const now = new Date();
    const requestKey = now.toISOString().slice(0, 16);
    const canQueueNaver = await naverReady(db);
    const [cafe24, coupang, naver] = await Promise.allSettled([
      cafe24CustomerService.sync(cafe24Config.getConfig(), {
        db,
        period: {
          start: new Date(now.getTime() - 31 * 86400000)
            .toISOString()
            .slice(0, 10),
          end: now.toISOString().slice(0, 10),
        },
      }),
      requestQueue.queueRequest(db, "CS_REALTIME", {
        idempotencyKey: `cs-manual:coupang:${requestKey}`,
      }),
      canQueueNaver
        ? operationQueue.queueOperation(db, {
            operationType: "NAVER_COMMERCE_CS_SYNC",
            targetType: "CHANNEL",
            targetId: "SMARTSTORE",
            payload: { requestedAt: now.toISOString() },
            idempotencyKey: `cs-manual:naver:${requestKey}`,
          })
        : Promise.resolve({ skipped: true, status: "SETUP_REQUIRED" }),
    ]);
    const jobs = [
      cafe24.status === "fulfilled"
        ? {
            platform: "CAFE24",
            ok: ["SUCCESS", "PARTIAL"].includes(cafe24.value.status),
            data: cafe24.value,
            error:
              cafe24.value.status === "FAILED"
                ? "수집할 수 있는 게시판 또는 주문 클레임이 없습니다."
                : undefined,
          }
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
      naver.status === "fulfilled"
        ? {
            platform: "NAVER",
            ok: !naver.value.skipped,
            skipped: Boolean(naver.value.skipped),
            data: naver.value,
          }
        : {
            platform: "NAVER",
            ok: false,
            error: naver.reason?.message || "수집 요청 실패",
          },
    ];
    return Response.json(
      {
        ok: jobs.filter((job) => !job.skipped).every((job) => job.ok),
        jobs,
        refreshRequired: true,
      },
      {
        status: jobs.some((job) => !job.ok && !job.skipped) ? 207 : 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        code: error.code || "CUSTOMER_SERVICE_SYNC_FAILED",
        error: error.message,
      },
      { status: error.status || 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
