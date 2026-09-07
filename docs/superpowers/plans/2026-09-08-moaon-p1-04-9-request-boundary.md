# P1-04-9 Recovery Request Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. This continues the user-approved plan without another approval prompt.

**Goal:** Connect fresh trusted dashboard identities to recovery review RPCs through a bounded, private Web Request handler.
**Architecture:** Reuse dashboard-identity and recovery-review-resolver. No mounted route, database mutation of auth state, or production activation. Two small production units separate HTTP validation from orchestration if needed.
**Tech Stack:** Existing Node24, Web Request/Response, Next16.3, PGlite, existing Supabase SDK; no new dependency.
**Spec:** `../specs/2026-09-08-moaon-recovery-request-boundary.md` (read fully).

## Global Constraints

- Candidate handler only. No new public route, UI/login/password/business API/env/SQL changes, production Auth/email calls, operator provisioning, paid resources or operational-data copies.
- Actor comes only from freshly verified signed-cookie identity, never body/proxy role headers. Existing SQL operator allowlist remains authoritative.
- Timeout/abort stops later dispatch, never promises rollback of an already-sent RPC. No automatic retries.
- No credentials, emails, raw errors or SQL details in responses/logs. All requests/tests use synthetic local data.

### Task 1: Bounded authenticated recovery request handler

**Files:** create `lib/tenancy/recovery-review-request.js`; optionally separate HTTP-only validators into `lib/tenancy/recovery-review-request-input.js` (no generic framework); create `test/tenant-recovery-review-request.test.js` and `test/tenant-recovery-review-request-integration.test.js`. Test-only PGlite PostgREST-shaped reader may go in `test/helpers/recovery-request-fixture.js`. Do not modify existing SQL/auth/verifier/resolver code without reporting a concrete blocking reason.

**Interfaces:** implement the exact factory and Web Request/Response contract from the spec. Reuse `createRecoveryReviewResolver` and `createDashboardIdentityVerifier`; integration uses `dashboardAuth.createSessionToken`, `validateSession` and `tokenHash` with a temporary synthetic process secret restored after test. The DB reader only supports the exact needed fixed selects/filters on synthetic sessions/profiles; RPC adapter calls actual local candidate SQL. External authAdmin.getUserById fixture must bind the queried operator ID and complete current Auth identity fields.

- [ ] Write a minimal observable failure before implementation, e.g. real POST Request with missing cookie produces AUTH_REQUIRED and no SQL call; command `node --test test/tenant-recovery-review-request.test.js` must fail before handler exists.
- [ ] Implement fixed HTTP guards, byte-bounded stream and copied validated body. Test cross-origin/missing Origin, forged proxy headers, duplicate cookies, credential mixing, malformed UTF8/JSON/IDs/fields, oversized declared/streamed bodies, non-POST, response no-store/CORS absence.
- [ ] Add orchestration tests: only freshly verified userId reaches real resolver/RPC; identity false/expired/malformed/general errors, changing getter snapshots, body/identity/RPC pending timeout, abort before dispatch and during verification, late completion cannot issue RPC, one dispatch only. Ensure pending stream reader cleanup does not hang the response.
- [ ] Add real signed-cookie integration: valid internal operator inspect and each resolution; ordinary OWNER absent allowlist denied; token tampering/revoked/expired/profile inactive/provider banned/email mismatch/email unconfirmed cause no journal/audit mutation; revoke session during Auth lookup catches second real validateSession read. Use Date.now-relative expiry so real validateSession clocks align. After success verify only journal/audit change; preserved auth state.
- [ ] Run focused tests while iterating, full `pnpm test` once before commit. Self-review against spec, report RED/GREEN outputs and concerns, commit only task-owned implementation/tests.

## Parent gates

- [ ] Independent task review then whole-branch review, fix findings and rerun covering tests.
- [ ] Full test/build/diff check; confirm no app routes/SQL/env changed. Update version1.51.0, changelog, master and human-readable report with exact verified boundaries.
- [ ] Fast-forward/push/tag/deploy using existing approved Vercel project, check READY/exact SHA/version and existing unauthenticated routes. Preserve unrelated files and no live-password submission.

## Next boundary

Execution record: Task 1 and parent review/test/build/release gates completed in v1.51.0, source0141e1c. Focused27/27, full2284/2284, buildPASS, all Important review findings fixed and scoped re-reviewed, VercelREADY/exactSHA and four existing unauthenticated endpoints verified. Detailed evidence: [development report](./2026-09-08-moaon-p1-04-9-development-report.md). No candidate activation. Reused worktree/scratch preserved; no forced cleanup or paid test resources.

P1-04-10: operator step-up/distributed admission and concrete activation checklist, including in-flight session revocation semantics. Public onboarding remains blocked until P2 business isolation. P3 connections/P4 app UI/P5 Windows EXE remain later.
