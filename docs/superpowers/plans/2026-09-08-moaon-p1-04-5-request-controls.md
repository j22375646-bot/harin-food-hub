# MOAON P1-04-5 Auth Request Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. User approved continued development and verified release without repeated plan approval.

**Goal:** Persist atomic authentication-request budgets and recovery review records across server restarts without changing current production login.

**Architecture:** Two candidate SQL modules and explicit server adapters; optional login limiter and recovery review dependencies connect them to existing orchestrators. The current recovery requestLimit seam is reused. Server-only review listing, no new HTTP/UI or production migration.

**Tech Stack:** Installed Node24, supabase-js2.55.0, pg, PGlite0.5.8, existing local PostgreSQL17.11. No dependencies installed. Next routes unchanged.

**Spec:** ../specs/2026-09-08-moaon-auth-request-controls.md and ../specs/2026-09-07-moaon-account-integration-gates.md.

## Global Constraints

- Preserve existing production password/login UI/route/cookie format/operational APIs. Never enter user credentials.
- No paid resources, real emails, production Auth/DB/config mutations, dependency installs or feature activation. Candidate SQL remains outside migration folders.
- Work in existing isolated worktree codex/moaon-p1-04-5, base71ee7c0c91dd91370e17d1a731a7fd7016e7df05. Controller owns plan/spec/report/version/changelog. No subagents inside implementers/reviewers.
- Explicit controls fail closed; no retries, compensating unlocks, or late continuations. Legacy omitted login dependency remains unchanged. IDs/keys/config come only from trusted server composition.
- SQL SECURITY INVOKER, empty search_path, schema-qualified relations, RLS defense in depth, revoke PUBLIC/anon/authenticated and grant only service_role. No user_metadata authorization.
- Native tests may only use the existing disposable loopback cluster at127.0.0.1:55437. Controller starts/stops it. No external DB access. Existing native test safety guards and own-random-database cleanup are the pattern.
- PGlite is local single-connection evidence, never native concurrency/hosted/Auth/SMTP proof. Public registration and other business data remain closed.

## Task 1: Durable request limiter and actual login/recovery consumers

**Files:** Create lib/tenancy/auth-request-limit.js, lib/tenancy/bounded-auth-rpc.js, lib/tenancy/sql/auth-request-limit.sql, test/tenant-auth-request-limit.test.js, test/integration/tenant-auth-request-limit.native-test.js. Modify lib/dashboard-auth.js, lib/tenancy/account-recovery.js (confirmation limit only), test/tenant-fenced-login.test.js and test/tenant-account-recovery.test.js as needed. Test helpers may be added under test/helpers for actual DB setup, not production hooks.

**Interfaces:** `createAuthRequestLimit({rpcClient,hmacKey,timeoutMs=10000}) -> async requestLimit({kind,subject}) -> {allowed:boolean}`; key explicit UTF-8 string minimum32bytes maximum1024bytes, subject nonempty bounded4096 chars. No key/env defaults. Hash `HMAC-SHA256(key, JSON.stringify([kind,subject]))` to lowercase64hex. RPC `public.moaon_consume_auth_request(p_kind text,p_subject_hash text) returns boolean`. Kinds LOGIN 10/900s, RECOVERY_MAIL3/3600s, RECOVERY_COMPLETE5/900s, EMAIL_CONFIRM5/900s; values fixed in SQL, not RPC arguments. Unknownkind/invalidhash reject without writing. Adapter accepts only literal boolean data and no error; fixed sanitized AuthRequestLimitError AUTH_REQUEST_LIMIT_UNAVAILABLE on transport/malformed/timeout. Constructor checks server-only and bounded integer timeout1..30000.

Shared new-adapter transport: `createBoundedAuthRpc({rpcClient,timeoutMs,errorFactory}) -> call(name,args) -> data`. It validates explicit server dependencies and timeout1..30000, binds rpc, races one call against timeout, checks response/error, sanitizes every transport exception through errorFactory, and always clears timers. Domain adapters validate returned data. Task2 reuses this; do not refactor prior auth-session-store as unrelated work. No retry/abort compensation or public arbitrary SQL route.

- [ ] Add behavior RED tests that the adapter produces scoped HMAC, raw subject/key absent from RPC args/errors, malformed values/unknownkind/shortkey are rejected, false remains denied, timeout/late success never retries. Two kinds or two subjects produce distinct keys; exact expected hash is hand-derived through node crypto at test boundary, not production helper.
- [ ] Implement minimal private `moaon_auth.request_limits` table keyed(kind,subject_hash), started_at timestamptz and used integer bounded by configured policy, with no customer/profile FK. After INSERT ON CONFLICT DO NOTHING, SELECT FOR UPDATE, capture one DB time; reset only if full window elapsed; otherwise deny when used>=limit, else increment. No caller time/policy input, no exception for ordinary quota denial (counter must remain committed). Backward clock movement never resets budget early.

```sql
-- Fixed policy lookup precedes DML. Lock before capturing elapsed time.
select * into v_bucket from moaon_auth.request_limits
 where kind=p_kind and subject_hash=p_subject_hash for update;
v_now := clock_timestamp();
-- If elapsed >= policy window set used=1/start=v_now;
-- else if exhausted return false; else increment and return true.
```

- [ ] Test actual candidate SQL counts: firstN true,N+1false, kind/subject independence, seeded expired window resets, rollback does not commit attempted quota, invalid requests no rows, anonymous/authenticated permission denied, service_role permitted. File-backed PGlite close/reopen must retain exhausted budget; temp path scoped and cleaned finally.
- [ ] Add optional `requestLimit` to authenticateAccount third server dependency object; undefined alone preserves legacy. Null/nonfunction is explicit config error. After account/password shape validation and before any profile query/ticket/provider request call bounded requestLimit({kind:'LOGIN',subject:normalizedAccount}). Only exact `{allowed:true}` permits work; `{allowed:false}` gives existing LOGIN_RATE_LIMITED429; malformed/error/timeout gives LOGIN_AUTH_UNAVAILABLE503. Use existing fence timeout bound/default; don't swallow rate429 in bounded helper. Do not reset limiter on success or replace existing password failure checks. Request input metadata cannot override dependency, kind, subject or key. Tested legacy default remains unchanged.
- [ ] Existing recovery mail/complete consume requestLimit; add EMAIL_CONFIRM with SHA256(tokenHash) before provider verification. Test denied/failed/late limit causes no profile/provider/fence/session work on each consumer; preserve enumeration-safe recovery mail response when allowed. Existing malformed result semantics tighten to literal allowed boolean where needed without accepting arrays.

```js
assert.deepEqual(events,['limit:LOGIN','profile','begin','password','window','issue']);
assert.equal(providerCalls,0); // denied/error/timeout variants
assert.equal(result.allowed,false); // real DB exhausted budget remains denied after reopen
```

- [ ] Native test using separate pg connections: prove different backend PIDs and lock wait, first transaction consumes then competing calls queue; after commit exactlyN allowed across20 calls, denied count preserved. Rollback first consumption allows waiting transaction; timestamp evaluated after lock. Use known isolated guards from existing native test. Controller injects local test URL via process env, never report credentials.
- [ ] Run focused RED/GREEN; affected tests and whole suite once; append precise output/limits/source inventory/selfreview to task report, commit only task files. Full suite must not overlap root build.

## Task 2: Write-ahead recovery review journal and trusted listing

**Files:** Create lib/tenancy/recovery-review-store.js, lib/tenancy/sql/recovery-review.sql, test/tenant-recovery-review.test.js. Modify lib/tenancy/account-recovery.js, test/tenant-account-recovery.test.js. Native test can be new test/integration/tenant-recovery-review.native-test.js using same isolated-cluster guards if needed for competing terminal updates. Do not modify Task1 limiter contract or production routes.

**Interfaces:** `createRecoveryReviewStore({rpcClient,timeoutMs=10000}) -> {start,markRequired,complete,reject,list}`. Mutation args `{userId,operationId}`, markRequired additionally `stage`. RPCs `moaon_start_recovery_review`, `moaon_require_recovery_review`, `moaon_complete_recovery_review`, `moaon_reject_recovery_review` (UUID user/op, require adds stage text) return true or failclosed; `moaon_list_recovery_reviews(p_limit integer)` returns JSON array. list({limit=50}) with1..100. Stage allowlist FENCE_BEGIN,PASSWORD_UPDATE,PROVIDER_SIGNOUT,IDENTITY_RECHECK,FENCE_COMPLETE. States PENDING,REVIEW_REQUIRED,COMPLETED,REJECTED. Exact list rows camelCase {userId,operationId,status,stage,createdAt,updatedAt}, canonical millisecond UTC timestamps. Reuse Task1 createBoundedAuthRpc({rpcClient,timeoutMs,errorFactory}) and validate returned data; no raw details returned.

- [ ] RED actual SQL tests for write-ahead PENDING, idempotent exact start, cross-user operation ID reuse rejection (operation_id global unique), monotonic terminal state, no automatic unlock. Table `moaon_auth.recovery_reviews` with profile FK user_id, operation_id unique, enum checks, DB timestamps. start must require existing active profile; no other mutation requires active profile (disabled user still needs review). markRequired fromPENDING sets required and stage; repeated same status/stage succeeds without changing original evidence; COMPLETED/REJECTED cannot be downgraded. start repeat only exact existingPENDING succeeds; terminal cannot reopen.
- [ ] `complete` may change PENDING or REVIEW_REQUIRED to COMPLETED only when matching existing moaon_auth.password_changes statusCOMPLETED proves fence completion. `reject` only PENDING and only when matching password-change row does not exist; repeated same terminal update idempotent. Reject vs begin race must be prevented with existing account_state lock order before journal lock when applicable; status cannot sayREJECTED for an actually started same operation. Mutations never change account_state,password_changes,dashboard_sessions. No resolution/unlock method.

For reject, lock existing account_state FOR UPDATE first (same ordering as begin); if state absent fail safely and retain PENDING, never create state solely for journal classification. Then lock journal and check password_changes. A concurrently uncommitted state insertion may be invisible; missing state must fail rather than declare rejection. complete similarly requires the authoritative completed operation, with account-before-journal ordering. Review-required marking doesn't inspect or modify fence state and locks only journal.
- [ ] list returns only unresolved PENDING/REVIEW_REQUIRED ordered oldest(createdAt,operationId), bound1..100, no arbitrary filter/query/role or customer-global route. Returned rows exact fields/canonical dates/UUID/status/stage; malformed provider response safely errors, no partial list leakage. Test grants for public roles and service role, absent cross-user transition cannot mutate, invalid stage can't carry provider errors/secrets, blocked account unchanged after all review transitions, file-backed reopen preserves pending review.

```js
assert.deepEqual(order,['limit','open','profile','review:start','fence:begin','password','signout','current','profile','fence:complete','review:complete','dispose']);
assert.equal((await review.list()).length,1); // process restart before completion
assert.equal(blocked,true); // marking required never unlocks
```

- [ ] Optional explicit `reviewStore` on createAccountRecovery; undefined preserves old server contract; null/incomplete methods error at construction. After verified handle/current profile and serveroperationUUID, persist start returning exacttrue BEFORE setting fenceRisk and calling begin. Failed/start timeout givesRECOVERY_UNAVAILABLE with no fence/providerwrites; delayed start may leave PENDING but cannot continue. Track fixed stage only in memory before each risky phase; on failure after fenceRisk markRequired with that stage using an independent bounded attempt even when original state cancelled. Failure to record emits only fixed diagnostic event and returns REVIEW_REQUIRED, leaving PENDING fallback; never claim persisted from return alone. start record is durable before risk, so crash doesn't erase operation.
- [ ] Authoritative begin AUTH_TRANSITION_REJECTED invokes reject best-effort, preserves rejection result and no provider writes; if journal reject fails leave unresolved and fixed diagnostic. Any nonliteraltrue start/begin/complete/store mutation result in explicit review mode is unavailable/reviewrequired, not success. Successful actual fence completion then journal complete; journal failure returnsREVIEW_REQUIRED, never fakeCOMPLETED/unlock/retry. Same completed journal cannot be downgraded by late markRequired. Disposal still bounded and secret-free; no operation ID/user ID/token leakage in public return.
- [ ] Tests actual coordinator+SQL/store for successful recovery, provider failure after fencebegin, record-failure fallback, start failure/timeout/late success, crashed PENDING reopen, terminal write ambiguity and blocked-state preservation. Keep provider simulated and SQL real. Prior recovery tests must stay green without weakening existing protection assertions. Test no metadata-suppliedoperation ID/status and no rawpassword/token/error text in persisted journal/diagnostics.
- [ ] Run focused RED/GREEN, affected tests and full once, append report with exact commands/results and limits, commit only task files. Root does final build/full/release.

## Controller completion

Baseline2167/2167 on71ee7c0. Task reviews with bounded fixes, one broad final review, final build then full suite sequential, optional native local tests with cleanup/stop. Version1.47.0/P1-04-5, changelog/master/report. Verified main merge/push/tag and production READY/SHA/login200/orders307/API401/version. New controls remain inactive in production until explicit complete-auth composition gate. Next: request-wide IP/global/alias limits and cleanup policy, supported operator review/resolve, Auth/SMTP/HTTP rollout acceptance, then P2 isolation/UI/EXE.
