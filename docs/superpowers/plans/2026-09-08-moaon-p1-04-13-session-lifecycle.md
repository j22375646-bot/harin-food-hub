# P1-04-13 Login and logout lifecycle integration

Approved continuation of the multi-business desktop plan. Use superpowers:subagent-driven-development. Base 2d6647699085effebd9a3c4c4f68cdaeddb8904e. Existing login and step-up storage are authoritative; no new auth architecture.

## Global Constraints

기존 공개 로그인·비밀번호·UI·업무 API·운영 SQL·환경 설정 변경 금지. 공개 route·실계정 인증·메일·유료 자원·운영 데이터 복사 없음. 새 의존성/SQL/프린터/EXE 작업 없음. 후보 인증 흐름은 운영 비활성 상태 유지. 기존 채널 경계와 오류 비밀값 보호 유지.

### Task 1: Internal logout composition and real local lifecycle coverage

Create lib/tenancy/session-logout.js exporting createSessionLogout and SessionLogoutError. Create test/tenant-session-logout.test.js and test/tenant-session-lifecycle-integration.test.js; optional test/helpers/session-lifecycle-fixture.js. Existing production files must remain unchanged. Parent owns docs/version/full test/build/release.

Contract: createSessionLogout({db,stepUpStorage,timeoutMs}) requires explicit db.from function and stepUpStorage.revoke function; no ambient DB/key/network construction. Options are own enumerable data properties only, exact names, no arrays/symbols/accessors/unknown keys; timeoutMs defaults10000 and accepts integer1..30000. Capture dependency method references at construction, preserve their receiver, reject browser construction/use. Return a frozen object with logout(token). Use existing dashboard-auth.parseSession, tokenHash and revokeSession, not a second token parser or duplicate DB mutation.

logout accepts only a primitive string token (bounded at16384 UTF-8 bytes). Missing/invalid/expired/tampered token returns false without DB or storage I/O. Config/signing infrastructure failures are sanitized, not authentication success. Valid signed session id/userId must be UUID and tokenHash derived from the exact token; accept no caller-supplied identity. First await existing revokeSession(token,explicitDb); only literal true permits stepUpStorage.revoke(frozen {userId,sessionId,tokenHash}). Only literal true from cleanup returns true. Failure or malformed outcome at either stage throws SessionLogoutError with code LOGOUT_UNAVAILABLE,status503, fixed safe message, no cause/raw secrets; no retry or compensation. Use one bounded total deadline: late completion after timeout must not dispatch the next stage. A cleanup failure never reactivates the revoked hub session. The existing SQL accepts already revoked matching sessions, so repeated valid-token logout should safely succeed. No provider signOut/global revocation, no other user's/session's cleanup.

Write failing tests before implementation (TDD). Unit coverage: explicit config validation incl getter nonexecution; no implicit environment connection; invalid tokens no I/O; exact frozen derived identity/order; tampering/cross-session protection; db error/no cleanup; cleanup error/false/throw sanitized and no retry; hanging DB timeout no late cleanup; hanging cleanup timeout no retry; legacy auth functions unaffected. Name realistic mutation each test catches.

Integration must execute actual authenticateAccount with createAuthSessionStore and candidate SQL on local PGlite, actual createStepUpStorage issuance/read/revoke, actual validateSession/revokeSession and new logout. Use parameterized explicit allowlisted test transport (reuse existing fixtures where possible; helpers belong in test only). Synthetic provider password/MFA responses allowed and documented. A successful login issues a signed stored session; stored MFA proof usable; logout revokes that session and clears its sealed_session; validateSession returns null, verifyStepUp rejects, repeat logout safe. Other user's session/proof unaffected; a new same-user login cannot reuse old proof. Cleanup failure after hub revocation: new handler fails safely, token remains unusable, no compensation. Don't call this live Auth or native concurrent DB proof. Avoid broad production refactors to accommodate tests. Raise concrete incompatibilities to parent.

Run focused new tests plus test/tenant-fenced-login.test.js test/tenant-step-up-storage.test.js test/tenant-recovery-step-up-integration.test.js; node --check and git diff --check. Commit owned files only. Report RED/GREEN commands/results, boundaries, files and concerns to task-1-report.md in this plan's SDD workspace. Do not spawn subagents.

## Parent gates

Baseline full2448, task review, whole-branch review, full/build, main re-test, Git v1.56.0 release and protected routes. Actual login route wiring, trusted IP, live provider/key/migration gates remain future. Follow activation checklist and multi-business plan.
