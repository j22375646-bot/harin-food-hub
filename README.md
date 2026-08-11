# 하린식품 광고·매출 진단 허브

이 저장소가 하린식품 허브의 기준 소스입니다. Cafe24·네이버·쿠팡 데이터 수집, Supabase 저장, 광고·매출 분석, 플랫폼별 보고서와 인사이트 자동화를 포함합니다. 다른 Codex/ChatGPT 작업에서도 이 저장소를 작업폴더로 연결해 같은 개발 이력을 이어갑니다.

This server keeps Cafe24 OAuth, automatic access-token refresh, Admin API and Analytics API calls on the server and persists products, orders, order items, traffic, referrers and raw responses to Supabase.

## Run

1. Use Node.js 22 or newer.
2. Copy `.env.example` to `.env` and fill the server-only values.
3. Run `npm install`, then `npm start`.
4. Open `/oauth/cafe24/start`, approve the app, then call `/api/cafe24/test` and `/api/cafe24/fetch-all`.

The sync response contains `syncLogId`, status, period, saved counts and per-dataset errors. `sync_logs` is written as `RUNNING`, then `SUCCESS`, `PARTIAL`, or `FAILED`.

## Next.js migration

The files under `lib/cafe24/` have no Express dependency. They can move into a Next.js project unchanged. Route Handlers should call `exchangeCode`, `adminGet`, and `syncAll`; keep `SUPABASE_SERVICE_ROLE_KEY` in server runtime variables only and never use a `NEXT_PUBLIC_` prefix.

## Production transition

Local execution retains `/tmp/cafe24-token.json` for compatibility. Vercel (or `CAFE24_TOKEN_STORE=supabase`) stores tokens in the RLS-enabled, service-role-only `cafe24_oauth_tokens` table. For a larger multi-instance deployment, add a distributed refresh lock and consider application-level token encryption or a secrets manager.

## 쿠팡 수집 방식

- 전체 자동수집: 집 PC 예약작업으로 매일 오전 8시 10분 1회
- 수동수집: 허브 쿠팡 상단의 `쿠팡 데이터 수동 수집` 버튼
- 수동 요청 확인: 숨김 워커가 5분 간격으로 요청 여부만 확인하며, 요청이 없으면 API를 호출하지 않음
- Vercel 자동수집: 매일 오전 5시 30분(KST)에 전체 플랫폼 동기화를 시도하지만, 쿠팡 고정 IP 제한 시 집 PC 수집기가 실제 쿠팡 API 수집을 담당

비밀키는 `.env`, `.env.local`, `.env.coupang.local`에만 저장하고 GitHub에는 올리지 않습니다. 필요한 변수 이름은 `.env.example`을 참고합니다.
