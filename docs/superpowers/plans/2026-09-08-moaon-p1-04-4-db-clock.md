# MOAON P1-04-4 DB Session Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. The user approved continued development without repeated planning approval.

**Goal:** Remove app-clock dependency from the optional fenced session issuance expiry without relaxing the SQL lifetime limit.

**Architecture:** A read-only, ticket-scoped candidate RPC returns one DB-derived session window. The existing explicit fenced login consumes it before signing and issuing. Default production login remains unchanged. No new hosted resource or live SQL application.

**Tech Stack:** installed Node24, supabase-js2.55.0, PGlite0.5.8, existing Next16.3; no Next route changes.

**Spec:** ../specs/2026-09-08-moaon-db-session-clock.md and ../specs/2026-09-07-moaon-account-integration-gates.md.

## Global Constraints

- Preserve existing production password/login UI/route/cookie format/operational APIs. Never enter user credentials.
- No paid resources, real emails, production Auth/DB/config mutations, dependency installs or feature activation.
- Work only in existing isolated worktree, branch codex/moaon-p1-04-4, base22f2a0db0d7d5423142c3d06ccf5e10d9d57b91f. Controller owns plans/reports/version/changelog.
- Tickets are not proof of password authentication; all IDs and new dependencies come only from server code, not request/header/env/user_metadata.
- Explicit fenced mode never falls back to legacy direct inserts or app-generated expiry on error. No automatic retries, ticket consumption or writes on timeout callbacks.
- Preserve SQL issue lock order, expected-profile atomic binding, reset generation checks and the maximum 12-hour expiry check. SQL remains a candidate outside migration folders.
- PGlite evidence is local deterministic evidence, not native concurrent PostgreSQL/hosted PostgREST/Auth/SMTP acceptance. Public registration and other business data remain closed.

## Task 1: DB-derived session window in fenced login

**Files:** Modify lib/dashboard-auth.js, lib/tenancy/auth-session-store.js, lib/tenancy/sql/auth-session-fence.sql; tests test/tenant-fenced-login.test.js, test/tenant-auth-session-store.test.js, test/tenant-auth-session-fence.test.js. Test-only clock/SQL fixtures may live in test/helpers; no production test-only hook. Existing unrelated/default tests must not be weakened.

**Interfaces:** Add `sessionFence.getSessionWindow({userId,ticketId}) -> {issuedAt,expiresAt}` and implement it on createAuthSessionStore through RPC `moaon_get_session_window(p_user_id uuid,p_ticket_id uuid) returns jsonb`. Both fields are canonical UTC millisecond strings (`YYYY-MM-DDTHH:mm:ss.sssZ`), finite real timestamps, and `expiresAt - issuedAt === 43200000`. Existing explicit fenced composition now requires this method, absent/null/malformed is error (undefined sessionFence alone remains legacy). Keep existing begin/issue store contracts and prior direct candidate SQL calls compatible. Extend createSessionToken's server optional argument `issuedAt` only if needed to use DB iat in fenced mode; its default and v2 payload shape remain unchanged.

- [ ] Read current issuer/store/SQL/test fixtures. Record root cause and reproduce app +5min expiry exceeding independent DB +12h using existing flow before fixing. Confirm observed DB/app clock separation, not two clocks shifted together. Keep credentials synthetic.
- [ ] Add RED for DB window RPC. Implement read-only security invoker with empty search_path, explicit qualified relations, PUBLIC/anon/authenticated execution revoked and service_role granted. Reject null IDs, missing/wrong-owner/expired/consumed/old-generation tickets, blocked account, inactive/missing profile. Capture one millisecond-truncated `clock_timestamp()` and derive +12h from that single value. No insert/update/delete/extra persistent state. The later issue RPC revalidates races.

```sql
-- After scoped eligibility checks, one captured DB time supplies both fields.
v_now := date_trunc('milliseconds', clock_timestamp());
return jsonb_build_object(
  'issuedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'expiresAt', to_char((v_now + interval '12 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
```

- [ ] Add RED for store response handling, implement exact window validation and safe sanitized errors through bounded RPC. Accept only scalar object with valid string fields and correct lifetime, not arrays/null/true/number/rollover dates/offset strings/infinity/wrong duration. Preserve existing transition rejected/unavailable categories; no provider/SQL secrets in returned errors.
- [ ] Add RED for real fenced login consuming DB window. Order is begin-login -> password-auth -> fresh profile -> get-window -> token sign -> issue. Fenced createDatabaseSession obtains/validates window with existing bounded dependency helper before signing. Use its expiry verbatim for signed exp (existing seconds rounding) and stored expiry, and its issuedAt for iat. Require valid parsed token/session before issue; missing secret/signing failure must not issue. Malformed direct injected windows fail safely even without createAuthSessionStore. Legacy branch still uses local clock with existing behavior.

```js
assert.deepEqual(events, ['begin-login','password-auth','get-window','issue-session']);
assert.equal(issueArgs.expiresAt, '2026-09-09T00:00:00.000Z');
assert.equal(payload.exp - payload.iat, 43200);
assert.equal(directSessionInserts, 0);
```

- [ ] Cover get-window error/false/null/malformed/timeout/late-success; no issue or direct insert and no retries/failure-count increment. Missing new dependency is explicit configuration failure. Request metadata cannot override window. Preserve prior identity/recovery/profile-race coverage while adapting test fences to the added method.
- [ ] Use actual candidate SQL/store/auth flow with independent app clock ±300000ms. Capture DB time before/after and show returned/stored expiry is within those DB bounds +12h, while token validates at normal time. Use scoped test-only clock replacement or isolated fixture; restore in finally; do not change OS clock. Assert each clock is actually different in the test. Test SQL +12h upper bound still rejects excess, expired/consumed/blocked/wrong-user window calls rejected, reset after window before issue still rejects; profile-change race remains rejected. Malformed forged window must not yield a returned token.
- [ ] Run focused RED/GREEN then full suite once. Record exact command/output/counts, source inventory, self-review and limits to task report. Commit code/tests/candidate SQL only. No subagents.

## Controller validation/release

Baseline seven-file authentication group:100/100 pass. Read-only live baseline, task review + bounded fixes, final wholebranch review, final build then full tests sequentially, commit/main push/tag v1.46.0, deploy and verify READY/exact SHA/version and unauthenticated route protections. No production new auth activation. Report original issuance-clock minor resolved only for the new composition; current request-time expiry/identity clock semantics are unchanged. Follow-up: durable request limits, recovery review, live allowed-recipient SMTP and rollout/rollback preflight, P2 isolation, then app UI/EXE.
