# 다사업장 Windows 허브 통합 개발·검증 계획

> **실행 상태 (2026-09-07):** 사용자가 제품명 모아온(MOAON)과 본 계획의 개발 착수를 승인했다. 아래는 전체 로드맵이며 완료 보고서가 아니다. 첫 구현 단위는 `2026-09-07-moaon-foundation.md`에 기록한다. 다사업장 실사용과 EXE 배포는 각 검증 게이트를 통과한 뒤 개방한다.

**Goal:** Windows 앱 UI와 기존 업무 기능을 유지·개선하면서 하린식품과 초대받은 다른 사업장이 자기 계정·플랫폼·자료로 독립 사용하는 허브를 만든다.

**Architecture:** 기존 Next.js/Supabase/Auth/고정 IP worker를 재사용한다. 사용자 인증, 사업장 멤버십, 플랫폼 연결, tenant-scoped 저장소/작업 실행을 분리하고 Electron을 먼저 실증한다. 사업장 가입과 채널 정책 승인을 완료한 조합만 실사용에 개방한다.

**Tech Stack:** 기존 Node 24/Next 16.3 계열/React/PostgreSQL/Supabase Auth, Electron 후보, Windows 설치 도구. 신규 런타임/DB 드라이버/packager 정확한 버전은 P0/P1에서 지원·보안·호환성을 확인해 고정하고 lockfile로 기록한다.

**Spec:** `../specs/2026-09-07-multi-business-desktop-hub-design.md`, `../specs/2026-09-07-desktop-business-ui-design.md`. 출력/설치 상세는 기존 `2026-09-07-windows-private-hub-roadmap.md` W1~W7을 재사용하되 사업장 경계를 추가한다.

## 실행 번호별 기록

| 실행 단위 | 범위 | 기록 |
|---|---|---|
| 첫 기반 릴리스 / 1.40.0 | 모아온 이름, 요청별 사업장 권한 검사 기반. 다사업장 실사용은 미개방 | [첫 보고서](./2026-09-07-moaon-first-development-report.md) |
| P1-02 / 1.41.0 | 내부 회원·초대 SQL 저장 기반과 로컬 검증. 실제 DB/인증 연결과 가입 UI는 별도 게이트 | [실행 계획](./2026-09-07-moaon-membership-storage.md), [개발 보고서](./2026-09-07-moaon-p1-02-development-report.md) |
| P1-03 / 1.42.0 | 기존 로그인·인증 이메일 연결부 및 제한 DB adapter 구현·로컬 PostgreSQL 다중 연결 시험 완료. 운영 개방은 별도 | [실행 계획](./2026-09-07-moaon-p1-03-adapters.md), [보고서](./2026-09-07-moaon-p1-03-development-report.md) |
| P1-04-1 / 1.43.0 | 복구 세션 잠금·구 세션 폐기 후보 및 RPC 연결부. 격리 hosted/로컬 동시성 검증. 운영 활성화 아님 | [실행 계획](./2026-09-08-moaon-p1-04-session-fence.md), [보고서](./2026-09-08-moaon-p1-04-1-development-report.md) |
| P1-04-2 / 1.44.0 | SDK 이메일 확인·복구 요청·세션 차단 연계 서버 모듈. 로컬 시뮬레이션 검증, 운영 미개방 | [실행 계획](./2026-09-08-moaon-p1-04-2-recovery-provider.md), [보고서](./2026-09-08-moaon-p1-04-2-development-report.md) |
| P1-04-3 / 1.45.0 | 기존 로그인 함수의 명시적 세션 차단 연계와 복구 경합 검증. 운영 전환은 별도 게이트 | [실행 계획](./2026-09-08-moaon-p1-04-3-fenced-login.md), [보고서](./2026-09-08-moaon-p1-04-3-development-report.md) |
| P1-04-4 / 1.46.0 | DB 기준 로그인 발급·만료시각 연결. 앱 시계 오차 발급 문제 검증, 운영 전환은 별도 | [실행 계획](./2026-09-08-moaon-p1-04-4-db-clock.md), [보고서](./2026-09-08-moaon-p1-04-4-development-report.md) |
| P1-04-5 / 1.47.0 | 대상별 DB 요청 제한·복구 검토 이력 서버 기반. 실제 인증 전환과 관리자 검토 화면은 별도 | [실행 계획](./2026-09-08-moaon-p1-04-5-request-controls.md), [보고서](./2026-09-08-moaon-p1-04-5-development-report.md) |
| P1-04 후속 / 인증 전환 | 모든 로그인 발급 경로 조합, IP/전역 제한·별칭·정리 정책·운영자 검토 해결·HTTP 보안, 허용 수신자/실제 링크 검증 후 전환. P2 전 공개 가입 미개방 | [진입 조건](../specs/2026-09-07-moaon-account-integration-gates.md) |

실행 단위 완료와 P1 전체/G1 통과는 다르다. P2의 모든 업무 자료 격리 전에는 다른 실사업장을 개방하지 않는다.

## Global Constraints

- 최초 산출물은 계획 문서였으며, 현재 사용자 승인으로 단계별 구현에 착수했다. 미검증 DB 전환·실업무 실행은 승인된 안전 조건 없이 수행하지 않는다.
- UI 소폭 조정 허용. 기존 업무 계산/API 의미/채널 경계는 보존.
- 다른 사업자 사용은 초대제부터. 모바일/공개가입/구독결제/앱스토어 제외.
- 모든 사업장 업무 경로에서 tenant 누락은 거부. 신규 사용자를 하린식품으로 fallback 금지.
- API 키·PII·관리자 권한을 설치파일/클라이언트/로그에 넣지 않음.
- 로그인 성공과 사업장 접근 허용, 인증 성공과 기능별 수집 성공을 구분.
- 기존 web 안전 접속 유지. 다사업장 전환 후 tenant 비인식 서버 버전으로 복귀 금지.
- 신청/가입/연결은 출고·답변·광고 쓰기 실행 승인이 아님.
- 실제 프린터 미검증이면 조회용 시험판만 인도 가능.
- 모르는 비용/미수집 데이터를 0으로 만들지 않음.
- 구현 전 관련 `node_modules/next/dist/docs/`와 AGENTS.md를 읽는다. 현재 계획 작성에서는 Next 코드를 쓰지 않음.

## 1. 작업 분해와 순서

독립 하위 프로젝트는 계정·격리(P1/P2), 연결·자동화(P3), 앱 UI(P4), EXE·출력(P5), 기존 이전·검수(P6/P7), 분석 고도화(B1~B4)다. 아래는 통합 인수 기준과 인터페이스를 고정하는 계획이다. P0의 실스키마 인벤토리 뒤 각 실제 변경 파일·SQL·테스트 fixture를 작업별 실행 명세로 확정한다. 조사하지 않은 모든 경로를 이미 점검·구현했다고 취급하지 않는다.

```text
P0 현황/정책/요구 정의
 ├─ P1 계정·사업장 → P2 저장/권한 격리 → P3 연결·수집
 └─ P4 앱 UI 시안 + P5 기술 실증(모의자료만)
         ↓ 두 흐름 통합
P6 하린식품 이전·성능 → P7 두 사업장 종단간 검수·제한 출시
         ↓
B1 정산/GA4 보강 → B2 인사이트 → B3 선택 Hermes / B4 제작·사은품
```

병렬 가능한 설계/모의 검증과 실사용 활성화를 구분한다. 같은 파일을 중복 수정하지 않는다. P2/P3 보안 통과 전 새 실사업자의 키·고객자료를 공통 서버에 넣지 않는다.

## 2. 파일·컴포넌트 책임 지도

`신규`는 제안 경로이며 현재 존재하지 않을 수 있다. 기존 경로는 이번 읽기 조사로 확인했다. 실제 migration 파일명은 구현 시 Supabase CLI로 생성한다.

| 구분 | 경로 | 책임 |
|---|---|---|
| 기존 수정 | lib/dashboard-auth.js, proxy.js | 인증 재사용, 전역 OWNER 판정→사업장 권한 |
| 신규 | lib/tenancy/context.js, permissions.js | 서버 검증 컨텍스트, 행위 권한 |
| 신규 | lib/tenancy/memberships.js, invitations.js | 참여/초대/탈퇴/소유권 이전 |
| 신규 | lib/tenancy/db.js, repositories/* | 제한 DB 역할·트랜잭션 scope·업무 저장소 |
| 기존 축소 | lib/cafe24/supabase.js | service-role 일반 접근 전환/제어면 분리 |
| 신규 | lib/connections/registry.js, service.js, secret-store.js, oauth-intents.js | 공급자 메타/연결/암호화/인증 귀속 |
| 기존 수정 | lib/cafe24/config.js, token-store.js; lib/coupang/config.js; lib/naver/client.js | 전역 설정에서 명시 연결 인수로 전환 |
| 기존 수정 | app/oauth/cafe24/start/route.js, callback/route.js | 로그인된 연결 시작·일회용 callback 의도 검증 |
| 기존 수정 | lib/coupang/request-queue.js, scripts/coupang-local-worker.js | 연결별 대기열·작업 실행·재시도 |
| 신규 | lib/tenancy/jobs.js, cache-keys.js, switch-state.js | 작업/캐시/전환 불변조건 |
| 기존 수정 | lib/owner-workspace.js, app/_phase28/phase28-shell.js | 저장 보기/알림/브랜드 tenant화 |
| 신규 | app/settings/business/page.js, connections/page.js, members/page.js | 사업장 정보·연결센터·멤버 관리 |
| 신규 | app/business-select/page.js, app/onboarding/page.js | 최초 시작·사업장 선택 |
| 기존 수정 | app/_phase28/phase28-shell.module.css, phase28-tokens.module.css | 앱 공통 배치, 기존 web 호환 |
| 신규 | app/_desktop/business-switcher.js, connection-card.js, desktop-shell.css | 앱 맥락과 상태 표시 |
| 신규 | desktop/src/*, desktop/test/*, desktop/e2e/* | 기존 Windows 계획의 창·출력·파일·설치 |
| 신규 | test/tenancy-*.test.js, test/connections-*.test.js, supabase/tests/tenant-isolation.test.sql | 격리/권한/연결 회귀 |
| 신규 문서 | docs/tenancy/inventory.md, permissions.md, migration-runbook.md, provider-readiness.md | 증거·운영·복구 인수 |

각 단계는 실패 테스트 → 실패 확인 → 최소 구현 → 집중·회귀 테스트 → diff/보안 확인 → 기능 단위 커밋으로 실행한다. 이 문서 작성 턴에서는 테스트를 실행하지 않는다.

## P0. 기능 기준·정책·데이터 전수 목록 — 3~5근무일 제안

- [ ] 실제 HEAD/운영 버전/테스트 명령/18 주요 경로와 하위 탭·쓰기 API·cron·worker 목록 기록.
- [ ] 테이블·뷰·함수·스토리지·캐시·로그·AI 인덱스마다 현재 소유 식별 방식, 전역 값, 읽기/쓰기 consumer 기록. DB 원문을 채팅/문서에 복사하지 않음.
- [ ] 기존 authentication/공통 env/직접 Supabase 조회·Realtime/공개 OAuth 시작 경로를 목록화.
- [ ] 플랫폼별 타 사업자 연결 유형/심사·계약/필수 scope/IP/조회 기간/호출 제한을 공식 문서와 실제 앱 등록 화면에서 확인. 외부 승인 요청은 별도 실행.
- [ ] 듀모르는 독립 tenant 예시로 시작. 실소유자·법적 사업장 관계·첫 연결 채널은 P3 실계정 적용 전 확인. 추측하여 자동 등록하지 않음.
- [ ] 첫 PC/프린터/배율/주문량·정산량을 기록하고 성능·출고 gold set 고정.
- [ ] OWNER/OPERATOR/VIEWER별 메뉴·PII·export·인쇄·외부 쓰기 권한표 확정.

**인수물:** 인벤토리, 유지/추가/이전/폐기 매핑, 원천 비교용 가명화 기준자료, 위험 목록, 정책 준비도. 복구나 소유 매핑이 불명확하면 실자료 이전을 시작하지 않는다.

## P1. 계정·초대·사업장 컨텍스트 — 7~10근무일 제안

**Files:** lib/dashboard-auth.js, proxy.js; 신규 lib/tenancy/context.js, permissions.js, memberships.js, invitations.js; 관련 API/가입 화면; test/tenancy-permissions.test.js.

**제안 인터페이스:**
- `resolveTenantContext({session,requestedTenantId}, deps) -> Promise<TenantContext>`; TenantContext={userId,sessionId,tenantId,role,membershipVersion}. deps는 서버 세션/멤버십 조회이며 클라이언트 입력이 아님.
- `authorizeAction(context, action) -> void`; tenant 누락은 TENANT_REQUIRED, 권한 부족은 PERMISSION_DENIED. 글로벌 role만으로 통과하지 않음.
- `acceptInvitation({token,verifiedUserId}) -> membership`; email/token/만료/사용 여부를 서버 트랜잭션에서 검증.

정책 순수 함수의 실패 테스트 예시(제안 계약이며 제품 코드 아님):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAction } = require('../lib/tenancy/permissions.js');
test('조회자는 송장을 발급하지 못한다', () => {
  const ctx = {tenantId:'tenant-a',userId:'viewer-a',role:'VIEWER',membershipVersion:1};
  assert.throws(() => authorizeAction(ctx, 'shipping.issue'), {code:'PERMISSION_DENIED'});
});
test('사업장 없는 OWNER도 실행하지 못한다', () => {
  assert.throws(() => authorizeAction({userId:'u1',role:'OWNER'}, 'shipping.issue'),
    {code:'TENANT_REQUIRED'});
});
```

- [ ] 위 두 정책 외에 A회원의 B요청/위조헤더/탈퇴/강등/초대재사용을 RED 사례로 작성.
- [ ] `node --test test/tenancy-permissions.test.js`로 실패 확인 후 권한표 기반 구현.
- [ ] 로그인→이메일 확인→초대→사업장 생성/참여→로그아웃/복구 구현. SMTP·MFA·회복 코드는 서비스 설정/비용을 확인하고 안전한 입력 경로 사용.
- [ ] 기존 로그인 테스트 재실행. 비밀번호 재설정·계정 정지·멤버십 철회 시 자체 세션/권한 캐시 폐기 검증.
- [ ] 이전 계정은 이메일 검증/소유자 매핑으로 하린식품 멤버십 부여. 비밀번호 일괄 변경이나 공용 비밀번호 재사용 금지.
- [ ] 신규 세션의 global OWNER 우회 없음, 마지막 소유자 제거 방지, 지원 관리자와 고객 OWNER 분리 확인.

**Gate G1:** 두 사용자/두 사업장/공유 사용자/조회 사용자 시험 통과. 하린식품 로그인 유지. 구 세션은 하린식품 호환 경로로만 제한하거나 명확한 재로그인으로 전환한다.

## P2. DB·파일·캐시·AI 격리 — 10~15근무일 제안

**Files:** 신규 lib/tenancy/db.js, repositories/*, cache-keys.js; 실제 업무 테이블 migration/쿼리 consumer 전부; supabase/tests/tenant-isolation.test.sql; test/tenancy-storage.test.js.

**제안 인터페이스:** `withTenantTransaction(context, operation) -> Promise<Result>`는 검증된 context로 제한 DB 역할을 사용한다. tenant 설정은 transaction-local; operation은 허용된 repository 함수이며 임의 클라이언트 SQL이 아니다. `cacheKey({tenantId,connectionId,kind,period,filters,ruleVersion,permissionVersion}) -> string`는 tenant 누락을 거부한다.

- [ ] P0 목록에서 전역 service-role 경로 대체 범위 확정. table owner/BYPASSRLS 역할을 고객 업무 쿼리에서 사용하지 않음.
- [ ] 실제 DB/풀 조합에서 context 없는 접근 거부와 오류 후 풀 재사용 격리를 먼저 RED→GREEN 검증.
- [ ] tenant_id·connection_id·복합 unique/FK·인덱스·upsert 규칙을 함께 구현. 같은 외부 주문번호의 A/B 값이 서로 덮이지 않도록 함.
- [ ] read/write/update/delete, views/RPC, raw JSON, export/첨부/이미지 URL의 허용·거부 시험. 캐시와 집계의 tenant 누락 검사 추가.
- [ ] 서버 검증 API 기반 갱신으로 연결. 기존 직접 Realtime은 안전한 대체/정식 tenant 인증 확인 없이 노출하지 않음.
- [ ] AI retrieval/embedding/result cache/보고서/알림 발송 대상을 사업장 단위로 격리. 타 tenant 문서 ID 주입 거부.
- [ ] 역할별 개인정보 필드/export 제어 적용. 짧은 signed URL·권한 확인·로그 마스킹 검사.
- [ ] 제어 저장소(멤버십)와 업무 저장소 접근, worker 예외 권한의 이유·범위를 기록.

**Gate G2:** A/B 동시 요청·교차 ID·FK 재할당·빈 tenant·오류 후 pooled connection·캐시 재사용 누출 0. 외부 사용자 개방 전 적용 대상 목록 100% 점검. RLS 활성화만으로 합격시키지 않는다.

## P3. 연결센터·키 보관·사업장별 자동화 — 10~16근무일 제안

**Files:** lib/connections/*, provider config/client/token-store/OAuth, lib/coupang/request-queue.js, scripts/coupang-local-worker.js; 설정 UI/API; test/connections-scope.test.js, connections-lifecycle.test.js.

**제안 인터페이스:**
- `resolveConnection(context,connectionId,{capability}) -> verified descriptor`; tenant 불일치/해제/기능 권한 부족 거부.
- `getProviderClient({tenantId,connectionId,credentialVersion}) -> server-only client`; 전역 process.env 교체 없음.
- `enqueueJob(context,{connectionId,jobType,period,idempotencyKey}) -> {jobId,status}`; secret 원문은 job에 넣지 않음.
- `completeOAuth({state,code,currentSession}) -> connection result`; state에 고정한 소유로만 완료, 현재 UI tenant 사용 금지.
- `assertConnectionScope(context,connection) -> void`; 소유 불일치는 CONNECTION_FORBIDDEN.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertConnectionScope } = require('../lib/connections/registry.js');
test('다른 사업장의 플랫폼 키 선택을 거부한다', () => {
  assert.throws(() => assertConnectionScope(
    {tenantId:'harin'}, {tenantId:'dumore',id:'connection-b',status:'ACTIVE'}
  ), {code:'CONNECTION_FORBIDDEN'});
});
```

- [ ] `node --test test/connections-scope.test.js`로 RED 확인 후 scope 검사 구현.
- [ ] registry에 지원 플랫폼/공식 인증 방식/필수 필드/capability 명시. 임의 baseURL 입력 거부.
- [ ] 서버 secret 암호화/키 버전/회전·복구 구현. key와 ciphertext 분리, 원문 재조회/로그 기록 차단.
- [ ] Cafe24부터 생성→공식 인증→실계정 일치→조회→부분 실패를 수직 구현. 이후 공통 계약을 재사용하되 공급자 고유 인증 코드 유지.
- [ ] 네이버 커머스/검색광고, 쿠팡, 우체국 순으로 준비된 계정에 적용. 타 사업자 방식 미승인 카드에는 대기 사유를 표시하고 우회 연결하지 않음.
- [ ] OAuth 만료/위조/재사용/계정 변경/브라우저 다른 사용자/동시 사업장 연결, refresh 동시실행/해제 경합 시험.
- [ ] 계정 조회 결과와 소유 확인 증거 대조. 계정 이름을 제공하지 않는 API는 확인 가능한 근거/수동 확인 상태 명시.
- [ ] 해제/키 변경/재연결 시 대기·진행 작업/커서/토큰 버전 관리. 재연결로 과거 원천이 중복 생성되지 않게 identity 유지.
- [ ] 스케줄/락/멱등성/쿼터/재시도/dead-letter/로그를 tenant+connection 기준으로 전환. A 장애·대량 수집의 B 독점 방지.
- [ ] 수집/webhook 중복·역순·부분 성공·오래된 커서·누락 기간 재대조 시험. 자동 발급은 별도 owner 설정·최신 권한 필요.

**Gate G3:** 두 사업장의 같은 공급자·다른 계정에서 수집·실패 격리·해제·재연결 통과. 실연결 미검증 기능을 VERIFIED로 표시하지 않음. 미확인 쓰기 자동 재전송 0.

## P4. 앱 UI와 신규 사업장 흐름 — 8~12근무일 제안

**Files:** UI spec의 app/_desktop/*, app/settings/*, app/business-select/page.js, app/onboarding/page.js, Phase28 shell/tokens/주요 페이지; test/tenancy-switch.test.js 및 패키지 E2E.

**제안 인터페이스:** `mayApplyResult({activeTenantId,requestGeneration}, responseMeta) -> boolean`; responseMeta={tenantId,requestGeneration}. 선택세대가 달라지면 같은 tenant로 돌아왔어도 이전 응답을 버린다. 이 UX 방어는 서버 권한을 대체하지 않는다.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mayApplyResult } = require('../lib/tenancy/switch-state.js');
test('전환 전 늦은 응답을 새 화면에 반영하지 않는다', () => {
  assert.equal(mayApplyResult({activeTenantId:'b',requestGeneration:2},
    {tenantId:'a',requestGeneration:1}), false);
  assert.equal(mayApplyResult({activeTenantId:'a',requestGeneration:3},
    {tenantId:'a',requestGeneration:1}), false);
});
```

- [ ] 오늘·주문·CS의 현재 UI를 먼저 확인하고 U1~U5 인터랙티브 시안 제작. 메인/사업장 선택/주문출력/연결센터부터 검토.
- [ ] 승인한 앱 레이아웃을 공통 컴포넌트로 구현. web fallback 접근성과 기존 기능 보존.
- [ ] `node --test test/tenancy-switch.test.js` RED→GREEN. switch 시 선택/편집/상세/진행 출력/다운로드 정리·늦은 응답 차단.
- [ ] 신규 사업장의 연결 없음/권한 일부/수집 중/정상 0건/실패 구현. 하린식품 숫자/문서/발송인을 기본값으로 복사하지 않음.
- [ ] 권한별 표시와 API를 대조. 숨긴 버튼의 URL 직접 호출로 우회 불가.
- [ ] 배지/활력/알림/검색/보고서까지 새 tenant 반영. 전환 시 stale 숫자 표시 금지.
- [ ] FHD/QHD,100/125/150%,긴 사업장명/상품명/주소,한글IME/키보드/테마/동작줄이기 검증.

**Gate G4:** 실제 업무 시나리오로 편의 개선 검수. 선택 대상/금액/규칙 동일, 전환 잔존 데이터 0, 디자인 토큰·접근성 유지.

## P5. 설치형 앱·프린터·업데이트 — 7~11근무일 제안

**Files:** 기존 Windows roadmap의 desktop 신규 파일. W1~W5 계약·실패 테스트를 실행하고 아래 사업장 조건 추가.

- [ ] Electron/대안 실증, 원격 nodeIntegration OFF/contextIsolation ON/sandbox ON, exact origin·IPC 권한 검사.
- [ ] 로그인/사업장 선택은 서버 검증. 앱모드 표시나 tenant 파라미터가 로컬 권한을 주지 않음.
- [ ] 프린터 설정은 user+tenant+device+문서종류별 저장. 실제 장비/용지 확인; 100×150mm를 추측 확정하지 않음.
- [ ] 발송인·반송지·우체국 계약·주문 tenant 일치를 발급/인쇄 양쪽 검사. 혼합 사업장 묶음은 전체 거부.
- [ ] 발급/인쇄 분리, 부분 인쇄/결과 불명확 시 확인, 재출력은 기존 번호 유지. 실제 라벨/A4/바코드·20/21·100/101 경계 시험.
- [ ] 진단/export/자동완성/저장에 타 사업장 자료 없음. 사용자 저장 파일을 로그아웃으로 회수할 수 있다고 설명하지 않음.
- [ ] 설치파일에 사업자 키·PII 없음. 깨끗한 일반 사용자 Windows에서 설치/업데이트/제거 검증.
- [ ] 같은 EXE를 초대 사용자에게 비공개 전달. 서명상태·해시·변경내역·호환표 제공. 공개업데이트/공개 Releases 금지.
- [ ] 최소 지원 앱 버전 미달 시 위험 로컬 기능 차단 및 호환 web 안내. 앱 rollback≠서버 데이터 rollback.

**Gate G5:** 두 사업장 컨텍스트와 실제 프린터 시험 통과. 장비 미확인 사업장에는 자동출력을 켜지 않음.

## P6. 하린식품 이전·성능·운영 — 5~8근무일 제안

P2 schema 구현과 별도로 실제 리허설·전환·대조를 수행한다.

- [ ] 백업을 별도 환경에 복구해 복구 가능성 확인. 소유 매핑 불명확 행을 먼저 해결.
- [ ] additive schema→단일 신규 write→backfill→shadow read→제약검증→하린식품만 전환. 외부 쓰기 dual-run 금지.
- [ ] 테이블별 건수/ID집합/금액/상태/관계와 주요 화면 대조. 재수집만으로 기존 수동 수정·이력을 복원할 수 있다고 가정하지 않음.
- [ ] 이전 중 cron·수집·발급·알림 중복 차단. 전환 시간과 필요한 쓰기 정지 범위 사전 안내.
- [ ] 앱/로그인/첫업무/DB/API/수집 지연 분리 측정. warm30/cold10,8시간 사용,50회 전환,앱종료 포함24시간 수집 기록.
- [ ] 제안 목표: PC 창 표시 p95 2초,대표 warm 첫 업무 p95 2초. P0 실측 후 기준 확정; EXE 변환만으로 달성 보장하지 않음.
- [ ] tenant 인덱스·권한조회·캐시·worker 공정성 부하검증. 실제 주문량 기반 목표 확정; 느리다고 격리·최신성 검사 제거 금지.
- [ ] 지원 접근/사업장 비활성/복구/export·삭제/보존정책·비용경보 문서화. 법률 검토를 코드 테스트로 대체하지 않음.

**Gate G6:** 하린식품 원장·작업 이력 보존과 실제 수집 확인. 두 번째 사업장 개방 전에 tenant 비인식 경로 차단.

## P7. 두 사업장 출시 검증·수정·인도 — 10~15근무일 제안

- [ ] 가명 fixture A/B 격리→하린식품 제한 운영→듀모르 소유자 승인 실연결→두 사업장 동시 업무로 확대.
- [ ] 신규 사용자가 연결센터 안내만으로 연결할 수 있는지 관찰. 승인 대기를 완료 버튼으로 우회하지 못하게 함.
- [ ] 아래 시험 행렬 실행, 결과·로그·commit·앱·서버 버전 연결.
- [ ] 기존 전체 테스트·빌드·패키지 E2E·RLS/권한·보안 검토 실행. 과거 1951개 통과 기록을 새 결과로 사용하지 않음.
- [ ] 사업장별 최소 2~3영업일 시범 운영 및 수정. 외부 7/14일 성과 관찰은 별도.
- [ ] 정보 노출/계정 오용/중복 출고/금액 오류/Critical·High 결함 0 및 미실행 시험 명시. off로 남긴 위험 기능은 범위 제한 공개.
- [ ] 사용자 안내, 소유자 연결/권한/해제 안내, 설치파일+해시·서명상태, 오류 진단, rollback runbook 인도.

## 3. 필수 테스트 행렬

| ID | 상황 | 기대 결과 |
|---|---|---|
| TEN-01 | A사용자가 B 주문/파일/보고서ID 요청 | 403/비노출. 이름/개수/원문 누출 없음 |
| TEN-02 | A OWNER가 header/body tenant/role 수정 | 권한 상승·사업장 이동 불가 |
| TEN-03 | A/B 같은 외부주문번호·멱등키 | 각 사업장 한 건, 덮어쓰기 없음 |
| TEN-04 | A 주문에 B 상품/연결 FK 저장 | DB/서버 양쪽 거부 |
| TEN-05 | transaction 오류 후 풀 재사용 | 이전 tenant 잔류 없음 |
| AUTH-01 | 초대 만료·재사용·다른 이메일·취소 | 참여 거부, 중복 계정/사업장 없음 |
| AUTH-02 | 강등·탈퇴·비밀번호 재설정 후 구 세션 | 민감 조회/실행 재검증·차단 |
| AUTH-03 | 마지막 OWNER 삭제·지원관리자 임의조회 | 거부 또는 명시된 승인 절차 |
| CON-01 | A연결 중 B로 전환 후 callback | A 검증 intent로만 처리 또는 거부 |
| CON-02 | refresh 동시실행·해제 후 늦은 완료 | 토큰/연결 부활 없음 |
| CON-03 | 다른 vendorId/몰·임의 내부URL 입력 | 연결 거부·SSRF 없음 |
| JOB-01 | A 대량수집/장애/429, B 신규주문 | B 기아 방지, 계정별 한도 준수 |
| JOB-02 | worker crash/재시도/역순·중복webhook | 복구 추적 가능, 미확인 쓰기 자동 replay 없음 |
| UI-01 | A→B→A 전환·늦은응답·선택행 | 이전 자료/선택·실행 대상 잔존 없음 |
| UI-02 | 알림·검색·활력·보고서·AI·export | tenant와 사용자 권한에만 일치 |
| PRINT-01 | B화면에서 A계약/주문 혼합 인쇄 | 전체 거부, 계약/발송인 일치 |
| PRINT-02 | 용지걸림·중복클릭·부분실패·강제종료 | 재발급 없음, 명시적 재출력만 허용 |
| FIN-01 | 판매자배송/RG·충전/소진·매출/지급 | 분리·중복공제 없음·미확인≠0 |
| EVT-01 | 29999/30000/30001·기간·삭제·부분취소 | 사업장별 이벤트만 판정, 중복동봉 방지 |
| MIG-01 | 이전 전후·재실행·전환 중 쓰기 | ID/금액/상태/이력 보존, 신규행 누락 없음 |
| REC-01 | 한 사업장 복구/정지/앱 rollback | 타 사업장 최신 업무에 영향 없음 |
| WIN-01 | 일반PC 설치/제거/업데이트·테마·배율 | 개발도구 없이 사용, 비밀값 없음 |
| PERF-01 | warm/cold/8시간·동시사업장·24시간수집 | 속도·격리·수집 증거 기록 |

## 4. 기존 계획 전체 연결표

| 이전 작업 | 새 포함 위치 | 추가 조건 |
|---|---|---|
| W0~W1 현황·Electron 실증 | P0/P5 | tenant 계약·공식 연결 유형 먼저 |
| W2 로그인·창·보안 | P1/P5 | 개인 계정·사업장 역할·초대/복구 |
| W3 전체 페이지·파일 | P2/P4/P7 | 파일·검색·배지·보고서까지 격리 |
| W4 우체국 실제 출력 | P5 | 계약·발송인·PC 프로필 분리 |
| W5 설치·업데이트 | P5/P7 | 초대 사용자 비공개 제공·버전 호환 |
| W6 속도·수집 | P3/P6 | 공정성·캐시·실패 고립 |
| W7 업무 검수 | P6/P7 | 하린식품 이전 + 두 사업장 검수 |
| B1 정산·GA4 | 기존 기능 P2/P3, 후속 B1 | 매출≠지급≠이익, 충전≠소진 |
| B2 인사이트 | 기존 자료 P2, 후속 B2 | 근거/행동/7·14일 결과 사업장별 |
| B3 Hermes | 선택 후속 | 읽기 집계·지식·예산 격리, 기본 OFF |
| B4 마케팅·사은품 | 기존 기능 P2/P7, 신규 보강 후속 | 타 사업장 규칙 복제 금지·실행 권한 |

현재 정산·캘린더·키워드·CS·재고·상품·인사이트를 후속으로 미루어 삭제하는 뜻이 아니다. 현재 기능은 모두 격리하여 유지하고, 이전 계획의 추가 고도화만 아래 별도 묶음으로 둔다.

### B1. 정산·공식몰 분석 보강

지원·권한·원천 상태 재확인, 판매자배송/RG·Cafe24 Naver Pay/스마트스토어·광고충전/소진·순지급/총매출 구분, 비용 근거 대조, 파일 import hash/정정 이력, GA4 속성/시간대/태그/UTM/테스트 거래 검증을 수행한다. 사업장별 계산 설정·최신성 테스트 포함. 초기 공수 8~15일 추정, 플랫폼 권한/파일 대기 별도.

### B2. 사장님 관점 인사이트

네이버부터 근거→변화→가설→행동→7/14일 결과를 연결한다. 가격·품절·시즌/프로모션 교란요인과 자료 부족 표시. 보고서 멱등 키에 tenant/connection/period/snapshot/ruleVersion을 포함하고 과거 버전을 보존한다. 초기 공수 8~12일 추정, 7/14일 실관찰 별도.

### B3. 선택 Hermes

아침 요약/주간 제안 두 작업만 읽기 전용으로 시험한다. 원문 개인정보/플랫폼 쓰기키 전달 금지, 사업장별 지식·사용량·시간·재시도·예산·중지 스위치. 14일 비교 후 도입 판단. VPS/LLM 비용 별도 승인, 미도입도 정상 운영 가능. P7 일정 제외.

### B4. 마케팅 소재·예산안·사은품 확인

승인 자료→초안→표현 검수→UTM→성과, 원가/재고/기여 준비도 기반 예산안, 포장 사은품 확인 이력을 추가한다. 광고 변경/게시/실출고는 명시적 권한·확인·이력 유지. 입력자료와 채널 쓰기 범위 확정 후 별도 산정한다.

## 5. 공수와 범위 관리

P0~P7 합계는 개발자 1명 기준 **60~92근무일(대략 12~19주)**의 초기 추정이다. 실DB 목록·외부 플랫폼 지원 유형·기존 테스트 품질·장비 확보 전이므로 확정 견적/납기가 아니다. 이전 Windows 단독 18~30일은 이 공수에 포함되며 중복 합산하지 않는다. 새 범위에는 이전 4~6주 전체 완료 추정이 더 이상 유효하지 않다.

첫 중간 인도는 모의자료 앱 시안·검증용 EXE, 다음은 두 테스트 사업장+준비된 한 플랫폼의 수직 검증이다. 중간 산출물을 전체 기능 또는 외부 실사용 완료로 표시하지 않는다. 임시 EXE보다 계정·원장 격리가 선행하는 것이 핵심 일정 변경이다.

B1/B2 추가 고도화는 별도 16~27근무일 추정이며 조사 후 재산정한다. Hermes/B4·승인 대기·사용자 준비·장기 성과 관찰은 별도다. 기존 기능 격리는 P0~P7에 포함되므로 중복 계산하지 않는다.

초기 범위 밖: 공개 회원가입/요금제/청구·결제, 모바일, 사업장 통합 원장, 전면 UI 교체, 공급자 미지원 기능의 임의 API 대체, 무제한 고객 수 보장. 비용은 실제 API/저장량/메일/서명/AI 사용량과 고객 수를 계측한 뒤 결정한다. Supabase Pro만으로 모든 비용이 포함되지 않는다.

## 6. 보고·승인·인도 원칙

각 단계 보고: 사용자가 할 수 있게 된 일 → 바뀐 화면/파일·자료 영향 → 통과 시험/버전/적용 범위 → 미검증·부분완료·외부대기 → 복구 방법·다음 단계.

오류가 전혀 없다고 약속하지 않는다. 설계·실패 테스트·단계 전환·가명자료→소량 실업무 검증으로 오류를 발견하고, 위험 결함이 있으면 확대를 멈춘다. 승인된 범위의 일반 수정마다 재승인을 반복하지 않되 유료 구매/심사 제출/실거래·출고/계정 소유권 이전/자료 삭제는 별도 명확한 권한을 받는다.

사용자 검토 후 개발이 시작되면 P0부터 착수한다. API 비밀키나 프린터 크기를 지금 채팅에 보낼 필요는 없다. 연결센터 입력과 실제 장비 점검이 가능한 단계에서 안전하게 확인한다.
