# P1-04-14 Logout request boundary

Approved continuation; superpowers:subagent-driven-development. Base9fa0a2930da9129fa9cff716261ad1d12c392c02. Bounded adapter of existing createSessionLogout, not a public auth migration. Existing request controls/IP adapters remain inactive pending deployment trust verification.

## Global Constraints

기존 공개 로그인·로그아웃·비밀번호·UI·업무 API·SQL·환경 설정 변경 금지. 공개 route·실계정 인증·메일·유료 자원·운영 데이터 복사 없음. 새 의존성/EXE 작업 없음. 신규 인증 흐름은 운영 비활성. 오류·응답·로그에 자격 증명이나 개인정보 비노출.

### Task 1: HTTP logout boundary with failure truthfulness

Create lib/tenancy/session-logout-request.js exporting createSessionLogoutRequestHandler. Create test/tenant-session-logout-request.test.js and test/tenant-session-logout-request-integration.test.js; optional test-only helper if needed. Existing production functions remain unchanged; reuse real createSessionLogout for integration. Parent owns docs/version/full/build/release.

Factory exact configuration {allowedOrigins,logout,timeoutMs}: own enumerable data properties only, no getters/symbols/unknown keys. logout is explicit function captured at construction (caller binds existing object's method); no ambient DB. allowedOrigins is a dense primitive-string array1..16, unique canonical HTTPS origins (URL.origin exactly equals value, no credentials/path/query/fragment/port normalization aliases), each at most2048 chars; no env/request-derived widening. Copy/freeze at construction; reject getter slots and malformed config with fixed safe TypeError. timeoutMs optional default10000 integer1..30000. Server-only construction and calls.

Return an async function taking native Request and returning native Response. No registered public route. Only POST: otherwise405 {ok:false,code:'METHOD_NOT_ALLOWED'}, Allow:POST. Non-Request400 INVALID_REQUEST. Before any logout I/O, validate request URL origin in configured list, declared Origin exact canonical HTTPS allowed origin matching request URL origin, Sec-Fetch-Site absent or same-origin only. Missing/null/foreign/malformed origin, cross-site/same-site/none contradictory metadata rejected403 SOURCE_NOT_ALLOWED; ignore Referer and all forwarded/host/IP headers as trust evidence. This new strict protocol intentionally does not replace legacy login fallback behavior.

Body-less protocol: request.body must be null; Content-Length absent or literal0, Transfer-Encoding and Content-Encoding absent. Reject other bodies/metadata400 INVALID_REQUEST without reading stream or calling logout. Credentials only one harin_dashboard_session cookie, raw token unchanged. Cookie header total <=16384 UTF8 bytes. Reject Authorization, missing/duplicate/empty target cookie, comma-folded cookies, malformed cookie pair, control/quoted/percent-encoded target token as401 AUTH_REQUIRED before I/O. Accept normal unrelated cookies; no decoding/trimming token itself. A signed dashboard token uses base64url dot signature. Don't parse user/session IDs here; actual logout remains authority.

Call logout(rawToken) once. Literal true =>200 {ok:true} and delete only harin_dashboard_session cookie with Path=/, Max-Age=0, HttpOnly, Secure, SameSite=Lax. Literal false=>401 AUTH_REQUIRED; all other outcomes/throws/getters/forged statuses=>503 LOGOUT_UNAVAILABLE. Never treat failure as success, never clear cookie on non-success, never log raw error or reflect user data. All responses JSON with Cache-Control:no-store, Pragma:no-cache, X-Content-Type-Options:nosniff, Referrer-Policy:no-referrer. No redirects, CORS grants, extra cookies or dynamic message details.

One monotonic total timeout and Request abort. Pre-abort/no budget =>503 and zero logout calls; abort/timeout while pending returns sanitized503 without cookie deletion. Late successful remote work cannot change response or cause retry; no compensating operations. Document remote work may have completed even after caller503. Don't assume browser abort proves server rollback.

TDD first: focused behavior RED then minimal implementation. Cover trusted and forged origins, forwarded header spoofing, mutated config, duplicate/oversize/bad cookies/Authorization, body stream not read, all literal outcomes/error sanitization, pre-abort/late abort/hang/timeout/monotonic time, exact headers and cookie deletion only200, no I/O for invalid requests. Invalid requests must explicitly assert logout call count0. Native Request tests, no source-string snapshots.

Integration: actual local PGlite login via authenticateAccount+createAuthSessionStore, actual MFA storage/createSessionLogout and new native HTTP adapter; reuse test/helpers/session-lifecycle-fixture.js. Assert200+cookie deletion -> DB session revoked, cipher null, old token invalid, other account remains valid; rejected source->original session/proof unchanged; cleanup failure after actual session revoke ->503 with no cookie deletion, token unusable (do not claim rollback). Password/MFA provider is synthetic; DB and functions real. No hosted/native concurrency claims. Keep fixtures parameterized and exact allowlisted; don't modify production to simplify tests.

Run new focused tests and test/tenant-session-logout.test.js test/tenant-session-lifecycle-integration.test.js test/tenant-recovery-review-request.test.js. Syntax/diff checks; self-review; commit owned source/tests only. Report RED/GREEN commands/results, real-vs-synthetic limits and concerns to task-1-report.md in own SDD workspace (never force-add). No subagents.

## Parent gates

Baseline clarification: two pre-implementation full runs failed the existing backward-clock logout test at line320 (cleanup0 instead of1). Include a separate test-only stabilization of tenant-session-logout.test.js, with controlled monotonic timing and a Date.now regression mutant that fails. Do not change production deadline behavior. This narrow addition is independently reviewed with Task1.

Baseline full2462, task review/fix, whole-branch review, full/build, main re-test, Git v1.57.0 READY/version/protected route check. Public wiring remains off until trusted proxy/IP, actual key/DB/provider and UX failure integration validated.
