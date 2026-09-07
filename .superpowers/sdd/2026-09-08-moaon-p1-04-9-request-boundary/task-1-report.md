# Task 1 report: bounded authenticated recovery request handler

## Status

DONE_WITH_CONCERNS. The inactive server-only `createRecoveryReviewRequestHandler` Web Request/Response boundary is implemented and covered by focused unit and real local PGlite integration tests. No route, SQL, authentication, identity verifier, resolver, environment configuration, version, release document, or deployment code was changed by this task.

## TDD evidence

### RED

Command:

`C:\Program Files\nodejs\node.exe --test test/tenant-recovery-review-request.test.js`

Result before the handler existed: exit 1, 0 passed / 1 failed. The observable failure was `Error: Cannot find module '../lib/tenancy/recovery-review-request.js'`; therefore the real POST Request test could not reach any verifier or SQL call.

### First GREEN slice

Same command after the minimal factory/401 boundary: exit 0, 1 passed / 0 failed. A missing `harin_dashboard_session` returned `{ok:false,code:'AUTH_REQUIRED'}` and SQL dispatch remained zero.

### Focused GREEN

Command:

`C:\Program Files\nodejs\node.exe --test test/tenant-recovery-review-request.test.js test/tenant-recovery-review-request-integration.test.js`

Result: exit 0, 26 passed / 0 failed / 0 cancelled / 0 skipped.

Coverage includes exact factory keys and canonical HTTPS origin; POST/source/fetch-site guards; ignored proxy identity headers; JSON media/identity encoding and declared/streamed 4096-byte bounds; fatal UTF-8 and exact body shapes; one raw unambiguous cookie without Authorization mixing; response cache/CORS/cookie/redirect constraints; copied identity getters; narrow real `DashboardIdentityError` mapping; one whole deadline; abort before dispatch and during verification; pending body/identity/RPC; reader cancellation that does not hang; no late RPC after an unfinished earlier stage; and one already-dispatched RPC without retry.

The integration seam uses a temporary synthetic signing secret (restored after each test), `dashboardAuth.createSessionToken`, `dashboardAuth.validateSession`, `dashboardAuth.tokenHash`, `createDashboardIdentityVerifier`, `createRecoveryReviewResolver`, and the installed candidate SQL in local PGlite. External Auth alone is a bound synthetic `getUserById` response with current identity fields. It covers inspect, both resolution actions, ordinary OWNER absent from the allowlist, tampering, revocation, expiry, inactive profile, provider ban, email mismatch/unconfirmed identity, and revocation during Auth lookup before the second real session read. Successful resolution changes only the recovery journal/audit; authentication state is preserved.

### Full GREEN

Command with Node-prefixed PATH:

`C:\Users\a\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd test`

Result: exit 0. UI design guard passed; Node tests 2283 passed / 0 failed / 0 cancelled / 0 skipped (the provided 2257 baseline plus 26 new tests), duration 51.8 seconds. Existing intentional Supabase `Recovery session refresh is disabled` diagnostic output appeared, but no test failed.

## Changed task files

- `lib/tenancy/recovery-review-request.js`
- `test/tenant-recovery-review-request.test.js`
- `test/tenant-recovery-review-request-integration.test.js`
- `test/helpers/recovery-request-fixture.js`
- `.superpowers/sdd/2026-09-08-moaon-p1-04-9-request-boundary/task-1-report.md`

`git diff --no-index --check` reported no whitespace errors for the four code/test files (only the repository's LF-to-CRLF checkout warning).

## Self-review and concerns

- The handler directly constructs the existing resolver with only the freshly verified identity `userId`; caller body and proxy role/user headers cannot supply `operatorId`.
- Input values and the exact identity record are copied before later awaits. Unknown string or symbol keys fail closed.
- Every response is sanitized JSON with `Cache-Control: no-store`, `Vary: Cookie`, `X-Content-Type-Options: nosniff`; no CORS allow header, redirect, or `Set-Cookie` is emitted.
- The timeout/abort result is deliberately not evidence of database rollback. Once RPC dispatch has happened, the handler cannot atomically cancel the database operation. It performs no retry and no activation; callers must inspect or repeat with the same `resolutionId` to establish the durable result.
- The Auth provider response is a test fixture, not proof of a production provider, proxy/TLS, MFA/step-up, distributed admission, or deployment configuration. Those remain parent/next-boundary activation gates.
- No production Auth/mail/database/customer data or paid/cloud resource was used.

## Review fix round 1

Two Important findings were reproduced and fixed without widening the task scope.

RED command:

`C:\Program Files\nodejs\node.exe --test test/tenant-recovery-review-request.test.js`

RED result: exit 1, 12 passed / 2 failed. A coercible non-number clock reached a 200 response instead of sanitized 503, and malformed `emailVerified` reached 401 instead of sanitized 503.

Fixes:

- `readClock` now requires the dependency return value itself to be a finite primitive number; it no longer applies `Number(...)` coercion. Focused values cover `null`, empty string, booleans, a numeric string, and a boxed Number in addition to `NaN`.
- `identitySnapshot` now requires `emailVerified` to be a primitive boolean before authentication classification. Only literal `false` maps to 401; string, number, and `undefined` values map to sanitized 503.

Final GREEN command:

`C:\Program Files\nodejs\node.exe --test test/tenant-recovery-review-request.test.js test/tenant-recovery-review-request-integration.test.js`

Final GREEN result: exit 0, 26 passed / 0 failed / 0 cancelled / 0 skipped, duration 15.5 seconds.

## Final whole-branch fix wave

The remaining Important review finding was reproduced at the real resolve seam. The handler's outer deadline queued the resolver, and the resolver's bounded transport queued the underlying RPC again. An abort in that second microtask gap returned 503 but still dispatched a new RPC after cancellation.

The fix passes a request-scoped RPC wrapper to the unchanged existing resolver. That wrapper performs `deadline.checkpoint()` and invokes the factory-bound underlying `rpcClient.rpc` synchronously in the same call frame, with no await or microtask between the check and dispatch. The prior test still confirms that an RPC already dispatched before timeout is not cancelled and is never retried automatically.

RED command:

`C:\Program Files\nodejs\node.exe --test test/tenant-recovery-review-request.test.js`

Full RED output:

```text
✔ missing dashboard cookie returns AUTH_REQUIRED without dispatching recovery SQL (19.2228ms)
✔ factory requires exact trusted server dependencies and a canonical HTTPS origin (0.8681ms)
✔ method and same-origin source guards run before authentication and never emit CORS or redirects (3.5334ms)
✔ proxy identity headers are ignored and cannot replace the single opaque cookie (4.0748ms)
✔ media, encoding and declared/body byte limits reject before identity or SQL (3.2561ms)
✔ cookie parsing rejects duplication, mixing and ambiguous values while passing the raw cookie octets (2.6917ms)
✔ fatal UTF-8, JSON shape, identifiers and unknown fields are rejected before identity and SQL (4.2937ms)
✔ the last duplicate JSON key is validated and copied values alone reach fresh identity and resolver (0.8234ms)
✔ resolve uses only the freshly verified userId and preserves the existing resolver result (0.849ms)
✔ identity authentication failures map narrowly to 401; malformed and general failures map to sanitized 503 (4.069ms)
✔ one deadline bounds pending identity and late verification cannot start SQL (41.9174ms)
✔ abort before dispatch and during verification prevents SQL; RPC timeout dispatches once without retry (60.9226ms)
✖ abort in the resolver microtask gap cannot dispatch a new resolve RPC (2.6939ms)
✔ pending body read times out, cancels its reader without hanging, and never verifies identity (28ms)
✔ invalid clock is sanitized before identity and SQL (1.9104ms)
ℹ tests 15
ℹ suites 0
ℹ pass 14
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 425.7361

✖ failing tests:

test at test\tenant-recovery-review-request.test.js:371:1
✖ abort in the resolver microtask gap cannot dispatch a new resolve RPC (2.6939ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    [
      'abort',
  +   'rpc-after-abort:true'
    ]
      at TestContext.<anonymous> (C:\Users\a\OneDrive\사진\문서\ChatGPT\하린식품 허브 개발\.worktrees\moaon-foundation\test\tenant-recovery-review-request.test.js:406:12)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ 'abort', 'rpc-after-abort:true' ],
    expected: [ 'abort' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

RED exit code: 1.

Final GREEN command:

`C:\Program Files\nodejs\node.exe --test test/tenant-recovery-review-request.test.js test/tenant-recovery-review-request-integration.test.js`

Full GREEN output:

```text
✔ real signed cookie traverses current identity verifier, resolver and PGlite SQL for inspect and CLOSE_NOT_STARTED (1901.4137ms)
✔ real PGlite evidence supports CONFIRM_COMPLETED while preserving all authentication state (1336.9767ms)
▶ tampered, revoked, expired, inactive and provider-invalid identities never mutate journal or audit
  ✔ tampered token (1323.8388ms)
  ✔ revoked session (1410.9337ms)
  ✔ expired signed session (1303.1155ms)
  ✔ inactive profile (1268.5187ms)
  ✔ provider ban (1221.4481ms)
  ✔ provider email mismatch (1270.0445ms)
  ✔ provider email unconfirmed (1274.6971ms)
✔ tampered, revoked, expired, inactive and provider-invalid identities never mutate journal or audit (9082.523ms)
✔ an ordinary OWNER absent from the recovery allowlist is rejected by real SQL without mutation (1363.0908ms)
✔ revoking the session during the external Auth lookup is caught by the second real validateSession read (1221.1677ms)
✔ missing dashboard cookie returns AUTH_REQUIRED without dispatching recovery SQL (26.2885ms)
✔ factory requires exact trusted server dependencies and a canonical HTTPS origin (0.6174ms)
✔ method and same-origin source guards run before authentication and never emit CORS or redirects (3.543ms)
✔ proxy identity headers are ignored and cannot replace the single opaque cookie (5.0662ms)
✔ media, encoding and declared/body byte limits reject before identity or SQL (5.2122ms)
✔ cookie parsing rejects duplication, mixing and ambiguous values while passing the raw cookie octets (3.2741ms)
✔ fatal UTF-8, JSON shape, identifiers and unknown fields are rejected before identity and SQL (4.4512ms)
✔ the last duplicate JSON key is validated and copied values alone reach fresh identity and resolver (0.8026ms)
✔ resolve uses only the freshly verified userId and preserves the existing resolver result (0.8957ms)
✔ identity authentication failures map narrowly to 401; malformed and general failures map to sanitized 503 (5.7217ms)
✔ one deadline bounds pending identity and late verification cannot start SQL (37.6051ms)
✔ abort before dispatch and during verification prevents SQL; RPC timeout dispatches once without retry (46.1904ms)
✔ abort in the resolver microtask gap cannot dispatch a new resolve RPC (2.227ms)
✔ pending body read times out, cancels its reader without hanging, and never verifies identity (30.6068ms)
✔ invalid clock is sanitized before identity and SQL (2.5343ms)
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 15264.3437
```

GREEN exit code: 0.
