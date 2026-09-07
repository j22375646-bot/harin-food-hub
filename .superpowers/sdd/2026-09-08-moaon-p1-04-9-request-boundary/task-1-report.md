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
