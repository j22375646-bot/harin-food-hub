# MOAON P1-02 — 사업장 회원·초대 저장 기반

Spec: `docs/superpowers/specs/2026-09-07-multi-business-desktop-hub-design.md`.
이 문서는 승인된 P1을 실행 가능한 한 단위로 나눈다. P1 전체 완료나 다사업장 개방을 뜻하지 않는다.

## Global Constraints

- 기존 로그인, proxy, UI, 플랫폼 연결, 운영 데이터는 변경하지 않는다.
- 신규 공개 API/가입/초대 이메일 전송/실사업장 생성은 하지 않는다.
- SQL은 운영 migration이 아닌 검증용 후보 스키마로 보관한다. 운영 DB에는 실행하지 않는다.
- 서버 전용 제어 저장소다. 클라이언트가 넘긴 role/email/userId를 인증 증거로 삼지 않는다.
- 실제 업무 RLS/P2 및 실제 PostgreSQL 다중 연결 검증은 다음 단계이며 이번 로컬 시험으로 대체하지 않는다.
- 새 패키지는 @electric-sql/pglite 0.5.8 개발 의존성 하나만, lockfile 고정. 앱/브라우저에서 import하지 않는다.
- 기존 service-role singleton 및 환경변수는 사용하지 않는다.

### Task 1: Transactional membership and invitation control store

Work in the existing isolated worktree. Follow TDD with real PGlite SQL; use one DB instance sequentially to avoid WASM memory overhead. Read the existing context/permissions modules and preserve their API.

Files allowed:
- `lib/tenancy/sql/control-plane.sql` (candidate schema, not auto-applied migration)
- `lib/tenancy/control-store.js` (fixed parameterized SQL repository and business invariants)
- `test/tenant-control-store.test.js` (real SQL behavior tests)
- `package.json`, `pnpm-lock.yaml` (controller added pinned dev dependency; bump release to 1.41.0)
- `CHANGELOG.md` (accurately distinguish internal tested foundation from enabled production feature)
- report under this plan's ignored SDD directory.

Implement a narrow server-only `createTenantControlStore({database, verifySession})` factory. database provides query(sql, params) and transaction(callback), where callback receives a transaction-bound query client. It is dependency-injected for a future production adapter, never constructed from request data. verifySession is trusted server code, called with an opaque session credential supplied to each operation; returns verified `{id,userId,email,emailVerified,expiresAt}`. Do not create a password system. Validate identity and expiry both before and after asynchronous verification/locking; use database clock for authoritative mutation timing. Deny malformed identities, sessions and unknown roles with stable sanitized errors (no raw SQL/token/email).

Candidate private schema `moaon_control`:
- tenants: UUID id, display_name, ACTIVE/SUSPENDED status.
- memberships: compound tenant_id/user_id PK, UUID user_id, role OWNER/OPERATOR/VIEWER, ACTIVE/SUSPENDED/REMOVED status, positive integer version.
- invitations: UUID id, tenant FK, normalized invite email, OPERATOR/VIEWER role only in this slice (OWNER transfers deferred), unique SHA256 token_hash, expiry, PENDING/ACCEPTED/REVOKED status, accepted_by, created_by; database consistency constraints.
- audit_events: UUID, tenant FK, actor UUID, action, target UUID, created_at. Never include token/email in audit payload. Do not grant anon/authenticated/PUBLIC access. Revoke PUBLIC schema/table access; enable RLS default deny (no public policies). SQL candidate is intentionally not runtime-exposed; bootstrap test data directly via test fixtures only, no bootstrap production API.

Operations (return safe DTOs, never hashes):
1. findMembership with verified session credential and tenantId, returning active membership shaped for existing resolveTenantContext (not another user's membership). Tenant must be active.
2. createInvitation: active OWNER in selected tenant, fresh membership DB version check, normalized email, allowed invite role, randomBytes(32) base64url token, expiry 24 hours based on DB clock. Return token only at creation, invitation ID/expiry. Persist only hash. Lock tenant row before membership check. Reject an already-active member with same verified user mapping only if known without speculative lookup; do not add auth-directory enumeration.
3. acceptInvitation: verified email required; derive user ID/email only from verifySession. Hash incoming strict 43-character token, find invitation then lock tenant then lock/re-read invitation; exact normalized email and pending/unexpired required, inviter still active OWNER. Atomic insert membership + mark accepted + audit. Never upsert/escalate/reactivate an existing membership (return stable conflict). Reuse/cancelled/wrong-email/unknown token share generic invalid invitation response. No tenant ID from client used to redirect acceptance.
4. revokeInvitation: OWNER of selected tenant, lock tenant then invitation, pending only. Cross-tenant ID denied without exposing foreign details. Atomic audit.
5. updateMembership: OWNER of selected tenant, target user and expectedVersion, only OPERATOR/VIEWER role assignment and ACTIVE/SUSPENDED/REMOVED status. Existing OWNER can be demoted/removed only if another active owner remains; cannot promote OWNER in this slice. Every successful real change increments version; stale version rejects. Lock tenant first to serialize last-owner checks and all membership mutations. No hard delete. Actor authorization is re-read in transaction, not trusted from stale context.

Tests must exercise real stored results, not query mocks: two tenants, shared user differing roles, wrong-tenant mutation, fake/expired session, unverified/wrong email, accepted/revoked/expired token reuse, only token hash stored/no token in audit, existing member cannot escalate/reactivate, removed inviter invalidates invitation, stale version, last-owner protection, revoked actor cannot use an old session, changed membership invalidates previous context on fresh resolution, forced audit INSERT failure rolls back membership AND invitation, error sanitization. Concurrent calls may be tested but explicitly label serialized local behavior, not multi-connection proof.

Document integration boundary in module comments: custom dashboard sessions need trusted identity adapter; production DB role/connection adapter not enabled; PGlite is test-only and single connection. No new broad SQL API or tenant switching UI. Run focused tests, full `pnpm test` once before commit, record RED/GREEN command evidence. Commit explicit changed files, do not push/merge/deploy. No subagents.

## Controller verification and handoff

Independent task review then final branch review. Build and full suite after final fixes. Report P1-02 completed sub-scope vs P1-03 next: real Supabase/PostgreSQL restricted-role adapter, separate DB multi-connection races and auth/session integration, before public invite UI. Do not apply candidate schema to production automatically.
