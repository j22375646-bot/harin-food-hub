# Task 1 report: durable auth request limits

## Status

DONE. Task 1 is implemented locally on `codex/moaon-p1-04-5`. No production database, route, UI, environment file, credential, dependency, or provider configuration was changed.

## Implementation

- Added `createBoundedAuthRpc({rpcClient,timeoutMs,errorFactory})`, a server-only, single-call transport with a 1..30000 ms integer timeout, bound RPC method, response/error validation, sanitized failures, no retry, and timer cleanup.
- Added `createAuthRequestLimit({rpcClient,hmacKey,timeoutMs})`. It accepts only the four fixed kinds, a 1..4096 character subject, and an explicit 32..1024 UTF-8 byte key. It sends only `p_kind` and `HMAC-SHA256(key, JSON.stringify([kind,subject]))` as lowercase hex.
- Added candidate SQL for the private `moaon_auth.request_limits` table and `public.moaon_consume_auth_request(text,text)`. Policies are fixed at LOGIN 10/900 s, RECOVERY_MAIL 3/3600 s, RECOVERY_COMPLETE 5/900 s, and EMAIL_CONFIRM 5/900 s. Invalid input precedes DML; row locking precedes the database-time comparison; ordinary denial returns false without rolling back the exhausted counter.
- Added the optional login limiter before all profile/fence/provider/session work. Undefined preserves the legacy path; explicit invalid dependencies fail configuration; exact denial maps to the existing 429 and ambiguous results map to sanitized 503.
- Tightened recovery limiter results to the exact `{allowed:true}` shape and added EMAIL_CONFIRM consumption using SHA-256 of the token before provider verification.
- Added unit, PGlite, file-reopen, privilege, and native PostgreSQL contention coverage.

## TDD evidence

### RED

Command:

```text
C:\Program Files\nodejs\node.exe --test test/tenant-auth-request-limit.test.js test/tenant-fenced-login.test.js test/tenant-account-recovery.test.js
```

Observed before implementation:

```text
tests 41
pass 33
fail 8
Error: Cannot find module '../lib/tenancy/auth-request-limit.js'
confirmation limiter ... expected EMAIL_CONFIRM, actual undefined
optional durable request limit ... expected limit:LOGIN before profile
Missing expected rejection for denial, unavailable, timeout, and invalid explicit configuration
```

These failures were expected because the new adapter/transport/SQL did not exist, login ignored the optional limiter, and email confirmation did not consume or strictly validate a limit result.

### GREEN focused

Command:

```text
C:\Program Files\nodejs\node.exe --test test/tenant-auth-request-limit.test.js test/tenant-fenced-login.test.js test/tenant-account-recovery.test.js
```

Final output:

```text
tests 49
pass 49
fail 0
duration_ms 13909.1512
```

### Native PostgreSQL

The controller-provided loopback credential was read into a task-specific PowerShell variable, injected only into the child process environment, never printed, and removed in `finally`. The test created and dropped only its guarded random database.

Final command (credential bootstrap intentionally omitted):

```text
C:\Program Files\nodejs\node.exe --test test/integration/tenant-auth-request-limit.native-test.js
```

Final output:

```text
tests 2
pass 2
fail 0
observed backend lock wait first_pid=16988 waiting_pid=36212
rollback waiter first_pid=36212 waiting_pid=16988
```

The first native attempt exposed a test-harness connection-pool over-allocation (`53300 sorry, too many clients already`, 1/2 passed). Reducing the test pool to four connections preserved 20 queued calls and produced the clean final result above; product SQL was unchanged by that correction.

### Whole suite (run once)

Command:

```text
C:\Users\a\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd test
```

Output:

```text
[ui:guard] 통과: 새 디자인 금지 패턴 없음 (현재 부채 518건)
tests 2182
pass 2182
fail 0
duration_ms 42712.3336
```

The full suite retained its existing `MODULE_TYPELESS_PACKAGE_JSON` and controlled Supabase recovery-error diagnostics; focused and native outputs had no new warnings.

## Source inventory

Created:

- `lib/tenancy/bounded-auth-rpc.js`
- `lib/tenancy/auth-request-limit.js`
- `lib/tenancy/sql/auth-request-limit.sql`
- `test/tenant-auth-request-limit.test.js`
- `test/integration/tenant-auth-request-limit.native-test.js`
- `.superpowers/sdd/2026-09-08-moaon-p1-04-5-request-controls/task-1-report.md`

Modified:

- `lib/dashboard-auth.js`
- `lib/tenancy/account-recovery.js`
- `test/tenant-fenced-login.test.js`
- `test/tenant-account-recovery.test.js`

Intentionally untouched: `lib/tenancy/auth-session-store.js`, production migrations, routes, UI, environment files, package/dependency files, and Task 2 review-store work.

## Self-review

- Completeness: all Task 1 consumer, adapter, SQL, durability, privilege, and contention requirements are covered. Existing password-failure limiting, fresh-profile revalidation, provider boundaries, and legacy undefined behavior remain intact.
- Mutation check: tests fail for wrong RPC kind/hash, leaked raw identifiers, permissive malformed booleans, wrong quota constants, missing counter updates, early clock capture, missing locks/rollback, public grants, missing consumer-first ordering, or late downstream execution.
- Scope/YAGNI: no retry, abort compensation, arbitrary SQL route, counter reset after success, IP-wide limiter, alias unification, cleanup policy, or unrelated session-store refactor was added.
- Security: adapter errors are fixed and sanitized; DB stores only kind and HMAC; confirmation passes a token SHA-256 to the limiter; SQL policy/time remain server-owned.

## Limits and follow-up gates

- The SQL is a candidate file only and was not applied to production or any remote database.
- A timed-out RPC may already have consumed quota; the caller fails closed and never starts later auth/provider/session work. There is deliberately no retry or compensating decrement.
- This is per-kind/per-subject control, not an IP-wide or service-wide distributed-attack control. Account alias unification, retention cleanup, support workflow, and production activation remain later gates from the approved spec.
- Existing production login remains unchanged until a server composition explicitly supplies `requestLimit`.
