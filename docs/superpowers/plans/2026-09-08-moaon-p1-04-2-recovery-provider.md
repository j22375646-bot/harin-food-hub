# P1-04-2 인증 공급자 복구 연결 (운영 미개방)

## Spec and Global Constraints

Authority: `2026-09-08-moaon-p1-04-1-development-report.md` next-stage conditions and the user's no-additional-paid-test-resource constraint.

- No paid branches/services, real emails, production Auth or DB mutations, credential changes, dependency installs, or UI/legacy login activation in this slice.
- Keep legacy UI/password/session behavior unchanged. No public recovery HTTP route until every issuer uses the fence and SMTP/real-link/security acceptance are verified.
- Implement a real Supabase SDK server adapter and orchestrator, not a claim that local simulated responses prove hosted Auth/SMTP delivery.
- Explicit server dependencies only. Never expose keys, passwords, recovery hashes, or access/refresh tokens in returned values/errors/logs. Client-supplied user IDs/metadata are not authorization.
- Preserve account boundaries; failure or uncertain writes must not unlock accounts automatically or retry password writes.

## Task 1: SDK recovery adapter and fenced recovery coordinator

Read global constraints above as binding. Work in `.worktrees/moaon-foundation`, branch `codex/moaon-p1-04-2`, base cd751d499eae6597bf2ab7d63e1766d0f1d101f4.

### Files and interfaces

Create server-only modules under `lib/tenancy/` (suggested `supabase-recovery-provider.js`, `account-recovery.js`) with focused tests `test/tenant-account-recovery.test.js`, `test/tenant-recovery-provider.test.js`. Additional test helpers under `test/helpers/` are allowed. Do not change production routes, legacy dashboard-auth, candidate SQL, package version, or the master plan. Controller handles release documentation/version.

Use installed @supabase/supabase-js 2.55.0. Verify its source/docs before relying on signatures. Adapter creates a fresh nonpersistent, non-auto-refresh Auth client per verification/recovery operation; never a shared mutable user session or browser storage. Configuration must be explicit; no ambient production environment fallbacks. Keep admin operations on an explicit separate server admin client. No network tests outside loopback/injected fetch.

Provide recovery request, confirmation, and password-reset orchestration with narrow public return values. APIs may be chosen consistently and documented in the report:

1. Recovery mail request: bounded validated email, fixed configured HTTPS callback URL (loopback HTTP only explicitly test-enabled), no redirect accepted from callers. Require a server request-limit dependency before provider work. Return the same accepted response for absent/inactive account and handled provider mail failure; send only for active DB profile. Sanitized internal diagnostic event may distinguish mail failure without email/token content. Do not silently make actual mail delivery claims. General limiter/storage failure can be unavailable, without revealing account existence. Provider uses resetPasswordForEmail with fixed redirect.
2. Email confirmation: verifyOtp with fixed confirmation type (`signup`; do not accept caller-supplied type), verify fresh authoritative provider user and DB profile binding, email confirmation timestamp and active/nonanonymous/nondeleted/nonbanned state. Do not create a dashboard login/session or expose provider tokens. A local confirmation success is not business membership creation. Clean up the temporary provider session conservatively.
3. Complete recovery: validate new password (12–128 characters, no trimming; legacy password unchanged) and bounded token_hash, request-limit gate, verifyOtp with fixed `recovery` type. Check token-bound returned user against authoritative admin.getUserById and active DB profile (ID/email/current confirmed state; never user_metadata). Use a fresh operation UUID on the server, not an operation ID/user ID from the caller.
4. After validation: `beginPasswordChange` from P1-04-1 → provider `updateUser({password})` on this isolated verified recovery session → verify returned identity → admin.signOut(verified access token, 'global') → recheck current active authoritative identity/profile → `completePasswordChange`. Complete only after every previous step is confirmed successful. No admin updateUserById password bypass. Never issue a dashboard session on recovery success; require fresh login.
5. All external steps bounded. If timeout/error occurs after the fence starts, leave it blocked and report a safe review-required result/error; no automatic replay/compensating unlock. Late promises must never continue to the next write after timeout. Do not mistake an SDK error-bearing response, invalid dates, NaN clock, missing/expired session, changed user/email, disabled account, or client metadata for success.
6. Use strict timestamp validation consistent with P1-03; if sharing its pure validator is warranted, make a minimal backwards-compatible export/refactor with covering tests and report it. Session tokens stay closure-scoped and do not escape through diagnostics/errors/results. Stop auto-refresh and release temporary state without global sign-out of unrelated users.

### Tests / acceptance

TDD: run failing behavioral tests before implementation. Real SDK wire-contract tests must use a local HTTP fixture or injected fetch beneath the installed SDK, with hand-authored realistic responses; label it simulation, not actual Supabase Auth. Verify exact recovery vs signup type, fixed callback, update then global-signout order, separate per-operation client sessions, secrets not returned, and no stale continuation after timeout.

Coordinator tests should exercise the real module with external boundaries simulated; include the actual P1-04-1 SQL store via PGlite in at least one integration flow to prove previous sessions are revoked, old login tickets cannot issue afterward, and another account remains intact. Cover invalid/reused/expired tokens as provider error responses, email/ID mismatch, active/banned/deleted/unverified identity, request limit, mail error, password rejection, provider update/signout timeout/failure, fence errors, no accidental unlock, concurrent isolated recovery accounts, and success requiring fresh login.

Read installed Next guide if editing any Next-bound files. Do not dispatch subagents. Commit only task-owned implementation/tests and write TDD evidence, exact test commands/results, self-review, and remaining hosted/SMTP/UI gates to the assigned report file. Run focused tests while iterating and full suite once before reporting. Report any missing contract decision instead of quietly weakening security.

## Controller validation and release

Task review plus whole-branch integration/security review; local full test/build; check production release version and protected-route boundaries after deployment. Do not report actual email delivery, hosted recovery, all issuer cutover, or P1-04 full completion. Next activation requires real allowed test recipient/SMTP, persisted rate limiting and recovery review workflow, full fenced login composition, CSRF/link handling and HTTP acceptance. Keep P2 data isolation gate closed.
