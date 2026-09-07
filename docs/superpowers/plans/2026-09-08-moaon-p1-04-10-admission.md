# P1-04-10 Recovery Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. User approved next development; no repeat approval prompt.

**Goal:** Enforce recent session-bound additional authentication evidence and DB-shared recovery review quotas before existing recovery RPCs.
**Architecture:** Mandatory trusted proof resolver in the inactive Web Request handler, a dedicated bounded admission adapter, and candidate quota SQL. No public route or production activation.
**Tech Stack:** Existing Node24, PGlite, pg/PostgreSQL17, Next16.3; no dependency install.
**Spec:** `../specs/2026-09-08-moaon-recovery-admission.md` (read fully).

**Execution:** Task 1 implemented in `9ef017d`, review correction in `d461196`; all six implementation checks below completed with recorded RED/GREEN evidence. Focused53/full2310/native4 pass; isolated-output build pass. Final review/release evidence is maintained in `2026-09-08-moaon-p1-04-10-development-report.md`. Candidate activation remains excluded.

## Global Constraints

- 운영 로그인·비밀번호·UI·업무 API·환경 설정과 기존 SQL은 변경하지 않는다. 새 공개 route, 운영 migration/계정/메일/유료 자원, 운영 자료 복사 금지.
- 후보 SQL은 lib/tenancy/sql에만 추가한다. 기존 로컬 PGlite/PostgreSQL의 합성 자료로 검증한다.
- 요청 취소/시간 초과 이후 미발송 RPC를 시작하지 않는다. 이미 발송한 RPC의 원자적 취소나 quota 반환은 보장하지 않으며 재시도하지 않는다.

### Task 1: Complete inactive recovery admission gate

**Files:** create `lib/tenancy/recovery-review-admission.js`, `lib/tenancy/sql/recovery-review-admission.sql`, optional small `lib/tenancy/recovery-step-up.js`; modify `lib/tenancy/recovery-review-request.js`; create `test/tenant-recovery-review-admission.test.js`, `test/integration/tenant-recovery-admission.native-test.js`; modify existing `test/tenant-recovery-review-request.test.js`, `test/tenant-recovery-review-request-integration.test.js`, `test/helpers/recovery-request-fixture.js`. Optional dedicated test helper for quota/native fixtures. No changes outside these task files without concrete parent discussion.

**Interfaces:** exact factory/proof/RPC contract in spec. Existing `createBoundedAuthRpc`, `createDashboardIdentityVerifier`, `createRecoveryReviewResolver` and SQL allowlist authority remain unchanged. Native harness uses existing local-only URL guard/safety cleanup; parent supplies runtime environment privately, never log credentials.

- [ ] RED on existing handler accepting request without verifyStepUp: assert.throws(() => createRecoveryReviewRequestHandler({verifySession,rpcClient,allowedOrigin}),TypeError). Add negative proof assertion `assert.equal(response.status,403); assert.equal(resolutionCalls,0)` before implementation.
- [ ] Implement mandatory proof dependency and exact snapshot policy with tests for missing/crosssession/stale/future/malformed/extra keys/getters. Keep existing guard/abort regression cases.
- [ ] Create SQL quota table/function with fixed policy and authority/session checks. Test actual SQL boundary30/31inspect,10/11resolve,GLOBAL sharedlimit, reset/futureclock, failedhalfquota noincrement, role denial and preservedauthstate. Adapter uses the existing bounded transport and literalboolean contract.
- [ ] Connect identity→proof→admission→identity recheck→resolution with one whole deadline. Check actual bound RPC dispatch immediately, retaining P1-04-9 microtask regression; verify identity/proof expiry cannot extend during waits. Test429/retryafter60, gate failuresandabortpreventresolution.
- [ ] Extend synthetic real signed-cookie/PGlite integration with admission SQL. Only external Auth and additional-auth evidence authority are doubles; never claim real MFA implemented. Add native multi-connection actual counter races using current safe harness; parent starts/stops existing local cluster, no installers/cloud/resources.
- [ ] Run focused node --test covering changed unit/integration files while iterating, native opt-in after parent readiness, one full pnpm test at final. Record RED/GREEN commands/counts, self-review, commit only owned code/tests (not ignored scratch report). Full report in task-1-report.md with final short status/commit/results/concerns.

## Parent gates

- Task review, covering fixes, final whole-branch review; no open Important findings.
- Full/build/diff check; version1.52.0, changelog/master/report and concrete activation checklist separating code readiness from blocked external gates.
- Merge/test/push/tag/deploy existing approved project, verify READY/exactSHA/liveversion and existing unauthenticated routes. No candidate activation.

## Next

P1-04-11: actual additional-auth evidence issuer/verification integration and revocation policy, prior to activation. P2 isolation precedes public multi-business onboarding; P3 connections/P4 desktop UI/P5 EXE remain later.
