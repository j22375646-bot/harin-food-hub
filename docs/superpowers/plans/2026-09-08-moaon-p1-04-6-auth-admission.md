# MOAON P1-04-6 — IP and service auth admission

Status: implementation, independent review, final build and 2217-test regression complete. Deployment evidence is recorded separately in the development report; production auth remains inactive. Base: 6f28e017c4afe47764da9519ab720b56d3d1eb5a.

## Goal and global constraints

Extend P1-04-5's inactive authentication foundation with shared abuse budgets before the existing subject quota. Preserve all production login, UI, business APIs, credentials and deployment configuration. No production SQL, Auth activation, real email, paid resources or production-data copies. SQL stays a candidate outside migrations. No EXE release is claimed.

## Preflight

| Boundary | Decision |
| --- | --- |
| Existing subject producer/consumer | Reuse createAuthRequestLimit and existing login/recovery requestLimit seam |
| Network identity | Explicit server-trusted literal IP; no request headers or body inference |
| Shared SQL state | Global lock before IP lock; fixed DB policies; service role only |
| Existing paths | No routes or production composition changed |
| Verification | Synthetic PGlite plus native loopback PostgreSQL; full regression and build |

## Task 1: Implement and verify the admission foundation

Read the global constraints above as binding: preserve production login/UI/APIs; no cloud resources, credentials, production SQL or activation. Work only in this isolated worktree. Do not spawn subagents. Commit only task files, not scratch reports or version metadata.

Implement with RED/GREEN evidence:

1. Add `lib/tenancy/auth-request-admission.js`, exporting `createAuthRequestAdmission({rpcClient,hmacKey,trustedClientIp,timeoutMs=10000})`. It returns the existing async `requestLimit({kind,subject})` contract. Validate supported kind and bounded subject before consuming any quota. Share the existing validation through a small export/refactor if necessary, preserving existing behavior and tests. Reuse bounded-auth-rpc and createAuthRequestLimit, not copies of their transport logic.
2. Require explicit trustedClientIp at construction. Accept only valid literal IPv4/IPv6 strings: reject whitespace, hostnames, ports, brackets, zone IDs and lists. Canonicalize equivalent IPv6 forms; map IPv4-mapped IPv6 to IPv4 so they share identity. A focused `auth-client-ip.js` helper is permitted. Hash with HMAC-SHA256, domain-separated JSON `['CLIENT_IP',canonicalIp]`; key bounds match existing subject limiter. Raw IP/subject/key must never reach SQL or error messages. No metadata supplied to returned function can override fixed IP or policy.
3. Call new `moaon_consume_auth_admission({p_ip_hash})` first; only literal true permits the existing subject limiter to run. False returns frozen `{allowed:false}`; malformed/transport/timeout failure throws sanitized AuthRequestLimitError. No retries or continuation after timeout. Global/IP budget remains consumed if subject quota later denies or fails: two RPCs are conservative sequential admission, NOT a three-budget atomic transaction. Existing login/recovery consumers must deny before provider/profile work when composed with this adapter.
4. Add candidate `lib/tenancy/sql/auth-request-admission.sql`: private `moaon_auth.admission_limits` with scope GLOBAL/IP, bounded hex64 hash, started_at and used. Fixed GLOBAL key is 64 zeroes. Aggregate across all auth kinds, GLOBAL 500 attempts/300 seconds; IP 30 attempts/300 seconds. SQL accepts only p_ip_hash; no policy/clock arguments. SECURITY INVOKER, empty search_path, RLS, only service_role required privileges, revoke public/anon/authenticated table/schema/function access following existing candidates. Apply repeatedly safely.
5. SQL validates before DML, locks GLOBAL then IP, samples DB time after locks for each decision. Global budget is charged for each valid attempt until exhausted, even when IP then denies. Exhausted global returns false without creating a new IP row. IP charged only when under its own cap. Reset a bucket to 1 only after full elapsed window; clock regression cannot reset. Ordinary false decisions commit charges; transaction rollback restores them. No unbounded counters, raw identifiers or caller-controlled scopes.
6. Tests: literal IPv4/IPv6/mapped identity fixtures, rejection cases, HMAC/domain/key validation, four kinds, invalid input no RPC, ordering, frozen result, deny/error/timeout stops downstream, late completion no retry. PGlite real SQL quotas exact 30/31 and 500/501, shared global across IPs, reset, invalid input, rollback, privileges/RLS, repeated apply. Exercise actual login and recovery seams with composed adapter and synthetic dependencies to prove early denial. Native separate backend tests prove same-IP concurrency and cross-IP global concurrency exact caps, lock wait and rollback; reuse local test harness safety pattern, own disposable DB cleanup, no production connection. Tests must use independent expected fixtures rather than deriving expected values using production helpers.
7. Run focused tests while iterating, full pnpm test once before commit. Parent runs native tests (unless supplied safe local environment) and final build. Report RED/GREEN commands/output, actual results, changed files, concerns and commit. Ask parent if a design choice exceeds this brief.

## Activation gates and remaining work

These are candidate limits, not tuned production policy. Shared-office/NAT users share IP quota; the global breaker can deny legitimate traffic during abuse. Before activation: trusted proxy/IP attribution, measured policy tuning, outer HTTP/WAF controls, DB statement timeout/operational monitoring, retention cleanup, alias/account unification, operator recovery review, Auth/SMTP/CSRF/session checks. IP rotation and HMAC key rotation affect identity; raw IP absence is data minimization, not a claim of anonymity. No automatic cleanup/scheduler is enabled here.

## Parent release gate

Independent task and whole-branch review, full tests/build, v1.48.0 report/version metadata, existing authorized commit/push/deploy workflow, verify production version and protected routes. Report source deployment separately from inactive auth foundation.
