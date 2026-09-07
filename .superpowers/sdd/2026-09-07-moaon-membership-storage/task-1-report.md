# Task 1 report: Transactional membership and invitation control store

## Status

DONE

P1-02의 내부 저장 기반만 구현했다. 기존 로그인, proxy, UI, 플랫폼 연결, 운영 데이터에는 연결하지 않았고 공개 API, onboarding, 이메일 전송, 실사업장 생성, 운영 migration, push/deploy를 수행하지 않았다.

## Implemented

- 의존성 주입형 서버 전용 `createTenantControlStore({ database, verifySession })`.
- 검증된 세션 본인의 활성 사업장 membership 조회와 기존 `resolveTenantContext` DTO 호환.
- OWNER의 24시간 초대 생성: DB `clock_timestamp()`, fresh actor version, 32-byte base64url token, SHA256 hash-only 저장.
- 검증 이메일 기반 초대 수락: token 선조회, tenant 선행 잠금, invitation 재잠금/재검증, inviter 최신 OWNER 검사, 기존 membership 충돌 차단, membership/초대/audit 원자 처리.
- 선택 사업장 pending 초대 회수와 교차 사업장 ID 비식별화.
- OWNER의 membership role/status 변경: tenant 선행 잠금, actor 재조회, target version 검사, no-op 거부, version +1, 마지막 active OWNER 보호, hard delete 금지.
- raw SQL/token/email을 노출하지 않는 안정적인 오류 코드와 메시지.
- private 후보 스키마: UUID/enum-like check/FK/unique/expiry/acceptance consistency, RLS default deny, 공개 grant와 policy 없음.
- `@electric-sql/pglite`를 test-only devDependency `0.5.8`로 고정하고 릴리스 버전을 `1.41.0`으로 갱신.

## RED / GREEN evidence

### RED

Command:

`node --test test/tenant-control-store.test.js`

Initial result: exit 1, 0 pass / 1 fail. `Cannot find module '../lib/tenancy/control-store.js'`.

Subsequent vertical slices failed first with the expected missing public seam:

- `store.createInvitation is not a function`
- `store.acceptInvitation is not a function`
- `store.revokeInvitation is not a function`
- `store.updateMembership is not a function`

### GREEN: control-store behavior

Command:

`node --test test/tenant-control-store.test.js`

Result: exit 0, 15 pass / 0 fail / 0 skipped.

Covered real stored results for two tenants and a shared user with different roles; wrong-tenant mutation; fake/expired/verification-delay/lock-delay expiry; unverified/wrong email; accepted/revoked/expired/unknown token behavior; hash-only token storage; audit privacy; active and removed existing-member conflicts; removed inviter; stale version; last-owner protection; removed actor with old session; fresh context after role/version change; forced audit failure rollback; RLS/grant/policy catalog state; sanitized errors.

### GREEN: existing tenancy compatibility

Command:

`node --test test/tenant-context.test.js test/tenant-permissions.test.js test/tenant-control-store.test.js`

Result: exit 0, 34 pass / 0 fail / 0 skipped.

### GREEN: full repository suite

Command:

`pnpm test`

Result: exit 0. UI guard passed with no newly added prohibited design pattern. Node test result: 1,988 pass / 0 fail / 0 cancelled / 0 skipped.

## Database test engine

`select version()` returned:

`PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit`

This is a single-connection WASM test engine. It is not proof for the read-only live PostgreSQL 17.6 environment or for separate-connection races.

## Files

- `lib/tenancy/sql/control-plane.sql`
- `lib/tenancy/control-store.js`
- `test/tenant-control-store.test.js`
- `package.json`
- `pnpm-lock.yaml`
- `CHANGELOG.md`
- `.superpowers/sdd/2026-09-07-moaon-membership-storage/task-1-report.md`

## Remaining integration boundary / concerns

- Candidate SQL was not applied to production.
- The custom dashboard session does not yet provide the trusted verified identity/email adapter required by this store.
- No production DB singleton or service-role client was added. P1-03 must supply a restricted Supabase/PostgreSQL connection adapter and verify its grants/RLS behavior.
- Separate PostgreSQL connections, multi-connection race behavior, and real auth/session integration remain P1-03 gates before any public invite UI.
- Controller-owned execution plan, development report, and account integration gate documents were intentionally left unstaged.

## Commits

- Implementation: `2a5de01` (`feat: add transactional tenant membership store`)
- This report is committed separately so it can record the immutable implementation commit.
