# P1-04-12 Recovery review and stored proof integration

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. User authorized continuation and implementation without repeated approval prompts.

**Goal:** Connect the existing recovery review request to real stored MFA evidence, preserve authentication error meaning, and reject evidence revoked while request admission is pending.
**Architecture:** Modify the existing inactive request handler, not a new public route. Reuse createStepUpStorage.verifyStepUp and its fixed errors. Recheck evidence after admission and fresh hub identity, before resolver dispatch.
**Tech Stack:** Existing Node24, PGlite and Supabase-related adapters. No dependencies or SQL changes.
**Spec:** Binding contract below plus existing ../specs/2026-09-08-moaon-step-up-storage.md and ../specs/2026-09-08-moaon-recovery-activation-checklist.md. This bounded task does not change the wider authentication design.

## Global Constraints

기존 로그인·비밀번호·UI·업무 API·운영 SQL·환경 설정 변경 금지. 공개 route·실계정 인증·메일·유료 자원·운영 데이터 복사 없음. 새 의존성/SQL/프린터/EXE 작업 없음. 기존 API 형식·채널 경계 유지. 후보 인증 흐름은 운영 비활성 상태를 유지한다.

### Task 1: Stored proof integration and revocation regression coverage

**Binding contract:**

- Preserve createRecoveryReviewRequestHandler(options), Request/Response formats, original source/cookie/body limits, admission limits, operator authorization and error sanitization.
- Only actual StepUpStorageError with code STEP_UP_REQUIRED becomes HTTP403 `{ok:false,code:'STEP_UP_REQUIRED'}`. Storage unavailable, forged code/status objects and arbitrary errors remain HTTP503 RECOVERY_REVIEW_UNAVAILABLE. Never expose cause/raw error/token/OTP/ciphertext.
- Call verifyStepUp with exact frozen `{userId: trusted.userId,sessionId: trusted.id}` initially and again after successful admission and fresh verifySession, before resolver execution. Revalidate fresh proof using the existing exact shape, method, identity and recent-five-minute rules. Invalid/absent/revoked proof prevents inspection and resolution RPCs; consumed admission counters are not undone.
- The initial request's proof deadline may not be extended by the second proof. Keep both initial and fresh expiry/freshness gates until actual resolver RPC dispatch. Fresh identity must still match the initial identity as before. A newer valid proof may be accepted for the same identity but cannot lengthen the initial authorization window.
- One request deadline/abort governs all stages. Fix the existing request clock's partial rollback gap by tracking the last observed clock, not just start. No new verification/resolver I/O after a failed checkpoint; late pending read can finish but cannot trigger a later business RPC. Do not add retries or compensate an ambiguous operation.
- Fresh reads are point-in-time checks, not atomic cancellation of a dispatched operation or simultaneous external Auth deletion. Document this limit; do not enlarge privileges.

**Implementation steps:**

**Files:** Modify lib/tenancy/recovery-review-request.js, test/tenant-recovery-review-request.test.js. Create test/tenant-recovery-step-up-integration.test.js. Optional test/helpers/recovery-step-up-integration-fixture.js. Parent owns docs/version. Do not edit storage/provider/SQL or existing shared fixtures without raising a concrete need.

**Interfaces:** Existing createStepUpStorage({rpcClient,provider,encryptionKey,keyId,...}).verifyStepUp({userId,sessionId}) and StepUpStorageError from lib/tenancy/step-up-storage.js. Use test/helpers/step-up-storage-fixture.js for real PGlite and stored proof issuance; test/helpers/recovery-request-fixture.js and current recovery SQL/tests for exact resolver/admission wiring if needed. A synthetic provider is allowed for this integration test because existing real SDK/ES256 coverage is unchanged; storage/SQL proof reads and actual handler must be real. Route unrelated admission/resolver transport to deterministic literal fixtures if full schema would obscure the proof boundary, but assert actual handler refusal/success and invocation counts rather than mock-only expectations.

- [ ] Write RED for actual storage missing-proof -> expected403 (currently503). Add real PGlite issue->handler success, revoke before request->403 and no admission/resolver call, revoke during admission->403 and no resolver call for inspect/resolve. Assert `response.status === 403`, `await response.json()` exact, and resolver calls0. Storage unavailable/forged-error objects remain503 with no secrets. Run `node --test test/tenant-recovery-step-up-integration.test.js` and record exact failure.
- [ ] Implement fixed error translation with actual imported class and a small reusable read/validate helper. Insert second proof read after fresh session validation, preserving original expiry bounds and no counter rollback. Keep source/config validation intact. Rerun new suite.
- [ ] Write RED for partial clock rollback and invalid/changed/expired second proof; delayed second verification after abort/deadline cannot dispatch resolver. Validate call order and exact frozen identity both times, fresh longer expiry cannot extend initial, unexpected getter/errors sanitized. Implement last-observed checkpoint without a new shared abstraction. Test cookie/source rejection performs no extra proof read.
- [ ] Update existing request tests only where the intentional second verification changes expectations; keep every original safety assertion. Run `node --test test/tenant-recovery-review-request.test.js test/tenant-recovery-step-up-integration.test.js test/tenant-step-up-storage.test.js`. Run syntax/diff checks and self-review. Commit owned code/tests only.
- [ ] Report to task-1-report.md with RED/GREEN command/output, real-vs-synthetic boundaries, preserved gates, timing/ambiguity limits and commit. No subagents; no force-add scratch. Parent owns full test/build/review/release.

## Parent gates

Isolated worktree baseline, task review/fix, whole-branch review, full tests/build, fast-forward main and retest, v1.55.0 Git deployment verification. No hosted DB test branch or operational data. Update activation checklist to reflect P1-04-11-2 storage code complete but real activation pending.
