# MOAON P1-04-3 Fenced Login Composition

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax. User already approved continued development; no repeated plan approval is needed.

**Goal:** Connect the existing account authentication flow to P1-04-1's one-use login ticket/session fence through explicit server dependencies, while preserving the deployed legacy login until activation gates are satisfied.

**Architecture:** The production route remains unchanged. An explicitly supplied server `sessionFence` switches the existing `authenticateAccount` and session persistence seam to begin-before-auth and RPC-only issue. The default remains the current legacy flow. Synthetic integration tests use the actual candidate SQL and RPC store; no production schema or Auth changes occur.

**Tech Stack:** Node 24, installed supabase-js 2.55.0/auth-js 2.71.1, PGlite 0.5.8, existing Next 16.3.

**Spec:** ../specs/2026-09-07-moaon-account-integration-gates.md and the P1 authentication section of 2026-09-07-multi-business-desktop-master-plan.md. This is an incremental composition slice, not all P1/P2/SMTP/public recovery completion.

## Global Constraints

- Preserve the existing production password, login route/UI, cookies, operational APIs and owner access. Never enter user credentials.
- No paid branches/services, real emails, production Auth/DB mutations, new dependency installs or production feature activation.
- Operate only in the existing isolated worktree on codex/moaon-p1-04-3, base 146b9103f6f242415987686fd599e05add012748.
- Session tickets are not proof of password authentication. Generate them on the server before password authentication, never accept them from the HTTP request or user metadata.
- Once explicitly opted into the fence, any invalid dependency, timeout, rejection or unknown result must fail closed; never fall back to direct dashboard_sessions inserts.
- Do not apply or alter candidate SQL or add public signup/recovery routes in this slice. P2 business-data isolation and hosted SMTP/HTTP acceptance remain closed gates.
- Keep secrets/provider tokens/passwords out of errors, logs and response metadata. Return the existing signed dashboard cookie only after a confirmed session write.

## Task 1: Compose fenced login and complete the deferred refresh assertion

**Files:** Modify lib/dashboard-auth.js; add a focused helper under lib/tenancy/ only if needed to keep fenced logic clear; create test/tenant-fenced-login.test.js; modify test/tenant-recovery-provider.test.js. Existing test/dashboard-auth.test.js may gain behavioral coverage without weakening legacy tests. Test helpers belong under test/helpers. Controller owns version/changelog/plans/report.

**Interfaces:** Extend `authenticateAccount(input, db, {authClient, sessionFence, fenceTimeoutMs}={})` and `createDatabaseSession(profile, requestMeta, db, {sessionFence, ticketId, fenceTimeoutMs}={})` with optional server-only arguments. `sessionFence` implements `beginLogin({userId,ticketId})` and `issueSession({userId,ticketId,sessionId,tokenHash,expiresAt})`, both confirming `true`, exactly as `createAuthSessionStore` does. Undefined means legacy; explicitly null, incomplete or malformed dependency is an error, never legacy fallback. `fenceTimeoutMs` defaults to 10000 and must be an integer 1..30000 when provided. Never derive these options from env/header/form input.

- [ ] Read the current authentication code, auth-session-store.js, candidate auth-session-fence.sql, provider identity validation and the installed SDK signInWithPassword contract before changing code. Inventory actual non-test/non-doc issuers and callers in a report. Current search found the login route -> authenticateAccount -> createDatabaseSession direct insert, plus the candidate SQL issue function; verify this rather than assume.
- [ ] First repair the deferred P1-04-2 refresh assertion: inspect recorded URL/query `grant_type=refresh_token`, not only request body. Make a narrow regression/mutation check proving removing the transport refresh blocker is caught; restore production code immediately and record expected failure then final pass. Keep mutations confined to local task-owned code and never commit a weakened version.
- [ ] Write failing behavioral tests for explicit fenced mode. The minimum ordering contract is:

```js
assert.deepEqual(events, ['begin-login', 'password-auth', 'issue-session']);
assert.equal(directSessionInserts, 0);
assert.equal(auth.parseSession(result.token).userId, USER_A);
```

- [ ] Implement server ticket creation after validated active profile/rate-limit checks and before signInWithPassword. Missing/inactive profiles must not receive tickets or sessions. Preserve the existing unknown-account/invalid-password behavior and legacy input/password rules. Do not let requestMeta/input/user_metadata supply the ticket, user ID or role.
- [ ] In fenced mode require an error-free authoritative password-auth result whose user ID and normalized email match the active profile, whose confirmed-email timestamp is a valid real calendar time not in the future, and whose user is nonanonymous, not deleted and not currently banned. Re-read the active DB profile by the bound user ID before signing so changes to email, role, username or active state cannot use the stale pre-auth profile. Invalid/malformed identity must not issue a session. Keep these stricter checks isolated from legacy mode. Provider service errors remain safe unavailable, not falsely invalid-password.
- [ ] Compose the existing v2 token/hash/12-hour expiry with `issueSession` using the server ticket. Await confirmed `true` before returning the token/session. The fenced branch does not perform direct session inserts or bypass RPC on failure. The direct createDatabaseSession seam also rejects missing/invalid ticket in fenced mode. Use canonical UTC expiry; verify existing signed cookie/validateSession compatibility with SQL-produced profile fields. Signing failure must precede the write. Unknown issue result must not return the token or auto-retry.
- [ ] Bound every newly introduced fenced dependency wait, including begin, fresh profile read and issue. If begin or authentication times out and resolves late, do not issue. No timeout callback may trigger another write. Translate raw dependency errors to safe existing login error categories. Return no token on ambiguous writes. Do not auto-unblock password changes.
- [ ] Cover valid username/email login, active=false, email mismatch, unconfirmed/invalid/future dates, anonymous/banned/deleted user, role/profile changes during auth, dependency missing/null/false/error/timeout, missing ticket, no direct-write fallback, concurrent independent accounts and late auth/issue outcomes. Existing default login tests must still pass unmodified in meaning.
- [ ] Use actual P1-04-1 candidate SQL plus createAuthSessionStore via PGlite and the real authenticateAccount flow for deterministic interleavings: (a) A login gets ticket, password reset begins/completes, delayed A auth returns -> old ticket rejected/no new usable session; (b) session issued before reset -> reset revokes it; (c) B remains usable; (d) fresh post-reset login can issue. Use synthetic users/provider responses only. This does not claim native multi-connection Postgres or hosted Auth proof.

```js
await fence.beginPasswordChange({ userId: USER_A, operationId: RESET });
await fence.completePasswordChange({ userId: USER_A, operationId: RESET });
releasePasswordAuth();
await assert.rejects(pendingLogin);
assert.equal(await countUsableSessions(USER_A), 0);
assert.equal(await countUsableSessions(USER_B), 1);
```

- [ ] Run focused tests RED then GREEN, then full suite once. Append exact commands/counts, current issuer inventory, self-review, and any activation limitations to assigned task report. Commit only task implementation/tests. Do not dispatch subagents.

## Controller validation and release

Baseline focused authentication/recovery tests: 45/45 pass. Reuse existing dependencies/worktree; no new hosted branch. Perform task review, bounded fixes and final whole-branch review. Run build then full suite (not concurrently, because three pre-existing tests inspect build artifacts), commit release documentation, push/tag and verify deployment exact SHA/version plus unauthenticated route protections. Remaining work includes runtime SQL/config cutover of all issuers, durable atomic request limiting, operator recovery review, real allowed-recipient SMTP/link validation, HTTP/CSRF and P2 isolation. Clearly say this optional composition is not production activation.
