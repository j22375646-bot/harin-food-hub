# P1-04-8 복구 검토 이력의 안전한 해결

> Execute with superpowers:subagent-driven-development. This is the previously approved P1-04-8 continuation, not permission to activate new authentication.

## 목적과 범위

복구 중 연결이 끊긴 기록을 운영자가 확인할 수 있는 비활성 서버 기반을 만든다. 비밀번호 변경을 다시 실행하거나 계정 잠금을 푸는 기능이 아니다. DB에 이미 완료된 근거가 있으면 검토 이력만 완료로 정리하고, 시작되지 않은 근거가 있으면 이력만 종료한다. 불명확한 기록은 보류한다.

## Global Constraints

- Candidate code only: no production SQL, Auth, email, routes, UI, scheduler, provider writes, paid resources or operational-data copies.
- Never modify account_state, password_changes, dashboard_sessions, passwords or provider state in the resolution path. Only recovery_reviews and the new append-only resolution audit may change.
- Internal recovery operators are an explicit, initially empty allowlist, not business OWNER roles. Validate allowlisting and active profile on every SQL inspection/resolution. No self-grant RPC or automatic operator seed.
- Preserve existing production authentication and marketplace boundaries. All tests use synthetic local data.
- Resolve only from locked authoritative evidence; stale views, wrong accounts, ambiguous evidence and conflicting idempotency requests fail closed. No force-unlock option.
- No credentials, email, free-text notes or raw provider details in review results, audit or public error messages.

## 固定 contract

Authorization requires transaction_isolation = read committed and rejects other levels before reading authorization. A transaction retaining an old REPEATABLE READ snapshot must not retain a revoked operator grant; this fail-closed constraint avoids adding write privileges. Native regression required.

Private SQL candidate depends on account migration, auth-session-fence.sql and recovery-review.sql. It is deliberately outside supabase/migrations.

`moaon_auth.recovery_operators(user_id uuid PRIMARY KEY REFERENCES public.dashboard_users(user_id))`: empty, RLS, service_role SELECT only. Provisioning is a separate privileged activation task.

Authorization locking refinement: PostgreSQL row-locking SELECT would require UPDATE privilege. Preserve SELECT-only operators grants with a dedicated shared transaction advisory lock for authorization and an exclusive advisory lock in a BEFORE INSERT/UPDATE/DELETE/TRUNCATE statement trigger for privileged allowlist changes. Acquire authorization lock before reading allowlist/profile. Document a dedicated lock key; no wider account flow change. Profile can use FOR SHARE with its existing privilege. Operator membership mutations serialize across reviewers; no public provisioning function.

`moaon_auth.recovery_resolutions`: resolution_id UUID primary key, operation_id UUID UNIQUE, user_id UUID, operator_id UUID, action (CONFIRM_COMPLETED or CLOSE_NOT_STARTED), expected_version lower-case 64-character SHA256 hex, result_status (COMPLETED or REJECTED), resolved_at DB timestamp. Append only, service_role SELECT/INSERT, no UPDATE/DELETE; no cascading deletion of audit. Store identifiers, not personal details.

`public.moaon_inspect_recovery_review(p_operator_id uuid, p_user_id uuid, p_operation_id uuid)` returns exactly `{userId,operationId,status,stage,version,decision}`. stage is existing stage enum or null; status is existing journal status; version is deterministic SHA256 of coherent locked evidence. Include journal identity/status/stage/timestamps, account-state existence/generation/blocked/operation, target active state and matching password-change status/timestamps. Canonicalize timestamps in UTC with microseconds. Use built-in sha256, no new extension.

Decisions, in order: terminal journal => ALREADY_CLOSED; missing account state or inactive/missing target => CHECK_REQUIRED; blocked state or matching PENDING change => KEEP_BLOCKED; matching COMPLETED change with unblocked state => CONFIRM_COMPLETED; no matching change and unblocked state => CLOSE_NOT_STARTED; otherwise CHECK_REQUIRED. Only the latter two matching action decisions permit journal resolution.

`public.moaon_resolve_recovery_review(p_operator_id uuid,p_user_id uuid,p_operation_id uuid,p_resolution_id uuid,p_expected_version text,p_action text)` returns exactly `{userId,operationId,resolutionId,status}`. Fresh authorization first, then exact same-id replay returns original result only when operator, target, operation, action and expected version all match. Conflicting same ID or a second ID for a resolved operation fails closed. Lock target account before journal, as existing fence flow does; re-read evidence and compare version inside the transaction. Atomically close journal and insert audit. No mutation if any assertion fails. Use common private locked snapshot helper to avoid duplicating policy. SQL SECURITY INVOKER, empty search_path, explicitly revoked public/anon/authenticated execution; service_role only. Allowlist/profile locks must serialize revocation; preserve account-before-journal lock ordering. Reapplying candidate must be safe.

Adapter `createRecoveryReviewResolver({rpcClient,operatorId,timeoutMs=10000})` from `lib/tenancy/recovery-review-resolver.js`: operatorId is bound by trusted server context, never accepted in action inputs. Methods `inspect({userId,operationId})` and `resolve({userId,operationId,resolutionId,expectedVersion,action})`. Strict exact own input/output keys, UUID versions 1–8 normalized lowercase, one read per returned field, finite bounded timeout via existing bounded RPC transport. Validate response identity, enums and decision/status compatibility, freeze copied results. Input/config mistakes reject before RPC. RPC rejection/malformed/timeout errors become sanitized `RecoveryReviewResolutionError`, code `RECOVERY_REVIEW_RESOLUTION_UNAVAILABLE`, status 503; never leak causes. No retry or late continuation. This adapter is not an HTTP authentication boundary; future routes must validate a fresh operator session.

### Task 1: Authoritative SQL reconciliation and concurrency coverage

Read this plan's Global Constraints and 固定 contract as binding requirements (included here by reference; controller includes the exact text in task brief). Files: add `lib/tenancy/sql/recovery-review-resolution.sql`, `test/tenant-recovery-resolution-sql.test.js`, `test/integration/tenant-recovery-resolution.native-test.js`. A focused shared synthetic fixture may be added under `test/helpers` if useful; no unrelated refactoring.

Implement the SQL contract above using TDD. First demonstrate missing-feature test failures, then implement and verify on PGlite and real local PostgreSQL. Cover all decisions, unauthorized/inactive operator and ordinary OWNER rejection, target/operation mismatch, stale snapshot, invalid actions, exact replay and conflicts, unchanged auth/account/session/password state, atomic audit rollback and repeat installation/grants. Test evidence-driven closure of REVIEW_REQUIRED as well as PENDING journals.

Native tests use existing loopback-only random synthetic DB harness, never cloud resources. Cover beginPasswordChange versus CLOSE_NOT_STARTED both lock orders; concurrent same-ID resolutions produce one audit; conflicting resolutions cannot partially mutate; authorization revocation is serialized. Coordinate contention with explicit transactions/locks, not arbitrary long sleeps. Parent starts existing PostgreSQL 17 on port 55437; credentials remain local. Reuse established admin environment contract MOAON_AUTH_TEST_POSTGRES_URL. Clean only each test's synthetic DB/roles.

Run focused tests while iterating, full suite once before committing. Report RED/GREEN commands/results, native results, changed files and concerns; commit only task files. No subagents, deployments, version changes or plan edits.

### Task 2: Trusted-context resolver adapter and integration coverage

Implement the fixed adapter contract above in `lib/tenancy/recovery-review-resolver.js` and `test/tenant-recovery-review-resolver.test.js`, using TDD and existing bounded RPC patterns. Reuse Task 1 synthetic fixture if available. Test real adapter against installed local PGlite SQL, not only mocks: inspection, both valid closures, stale version, unprivileged operator, cross-user mismatch and exact replay.

Unit cases include invalid config/input before RPC, actor injection, unknown/symbol/extra keys, uppercase UUID normalization, malformed response identity/status/decision, response getters read once, timeout/late completion and sanitized error. Ensure the adapter accepts no operator identity through request bodies and never reaches provider password operations. No routes or production activation.

Run focused tests then full suite before task commit. Report RED/GREEN commands/results, files, concerns and commit. No subagents or version/deployment edits.

## Parent validation and release

Independent task reviews, final whole-branch review; native PostgreSQL proof; full tests, build and diff check; update version/report/master-plan status from actual evidence. Merge/push/tag and Vercel deployment only after passing gates. Verify READY, exact commit, version and unauthenticated route protection; do not claim real login from those checks. No operational SQL activation. Stop own local PostgreSQL after tests and verify synthetic DB cleanup.

## Afterwards

P1-04-9 should address authenticated HTTP/operator session trust and explicit activation readiness, with real Auth/email validation kept separately gated. P2 business isolation, P3 platform connections, P4 app UI and P5 Windows EXE/printing remain later phases.
