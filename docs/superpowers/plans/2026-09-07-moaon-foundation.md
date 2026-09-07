# 모아온 첫 구현: 브랜드와 사업장 권한 계약

사용자는 2026-09-07 모아온(MOAON) 이름과 다사업장 Windows 앱 계획의 개발 착수를 승인했다.
상위 계획: 2026-09-07-multi-business-desktop-master-plan.md (P0-P7).
이 실행 단위는 P0 조사 일부와 P1 권한 계약 준비, 브랜드 적용만 포함한다.
다사업장 실사용, DB 마이그레이션, 새 로그인, API 자격증명 이전, exe 배포는 완료 범위가 아니다.

## 공통 안전 조건

- 기존 세션, 쿠키명, 환경변수, theme storage, PWA id, 운영 API를 변경하지 않는다.
- 실제 사업자명/상품명/거래기록을 모아온으로 치환하지 않는다.
- 권한 모듈은 인증된 서버 세션과 신뢰할 수 있는 membership 조회 어댑터만 받는 준비 코드다. 프로덕션 경로에는 아직 연결하지 않는다.
- 기존 auth의 OWNER는 사업장 OWNER의 근거가 아니다. 조회 실패와 불명확한 상태는 허용하지 않는다.
- RED/GREEN 단위 테스트, 기존 전체 회귀 테스트, production build 및 독립 검토를 거친다.

## Task 1: 사업장 컨텍스트 및 권한의 fail-closed 계약

소유 파일: lib/tenancy/context.js, lib/tenancy/permissions.js, test/tenant-context.test.js, test/tenant-permissions.test.js.
CommonJS / node:test 패턴을 사용한다. DB, env, network, 기존 auth에는 연결하지 않는다.

resolveTenantContext({ session, requestedTenantId }, { findMembership, now })를 구현한다.
session은 서버에서 검증된 세션이어야 하며 id, userId, expiresAt을 요구한다. 잘못된 날짜, 만료, 누락, tenant ID 누락을 거부한다.
findMembership({ userId, tenantId })의 결과는 정확히 일치하는 userId/tenantId, status ACTIVE, role OWNER/OPERATOR/VIEWER, 양의 정수 version을 요구한다.
세션의 role, 클라이언트 role, 불명확한 status를 신뢰하지 않는다. 조회 예외는 코드 TENANT_LOOKUP_FAILED로 감싸며 내부 원문을 사용자 오류에 노출하지 않는다.
성공은 Object.freeze({ userId, sessionId, tenantId, role, membershipVersion })이며 매 호출 membership을 재조회한다. 캐싱하지 않는다.

authorizeAction(context, action)은 이 모듈이 발급한 context만 허용한다. 임의로 만든 객체, 알 수 없는 action/role은 PERMISSION_DENIED.
최소 action 집합: workspace.read (전 역할), orders.write (OWNER/OPERATOR), connections.manage 및 members.manage (OWNER만).
컨텍스트 유효성 확인을 공통 모듈에서 제공하되 임의 객체 등록은 공개하지 않는다. 서버 요청 단위 사용 및 장기 보관 금지 문서화.
에러 code/status 계약은 안정적으로 테스트한다. tenant 누락 TENANT_REQUIRED, 무효세션 AUTH_REQUIRED, 비회원/비활성/잘못된membership TENANT_ACCESS_DENIED.

먼저 실패 테스트로 교차 사업장, 위조 context, role escalation, 만료, revoke 후 재조회, 저장소 오류를 고정한다. 구현 후 관련 테스트를 통과시키고 커밋한다.

## Task 2: 모아온 제품 브랜드 적용

소유 파일: lib/brand.js, app/layout.js, app/manifest.js, app/login/page.js, app/_phase28/phase28-shell.js, app/_shell/harin-app-shell.js, app/_shell/market-intelligence-shell.js, public/hub-offline-v2.html, public/hub-sw.js, next.config.js, test/moaon-brand.test.js. 필요하면 관련 기존 브랜드 테스트의 기대값 및 module import harness만 수정하고 보고한다.
공유 제품 정보: name 모아온, latinName MOAON, shortName 모아온, mark M, tagline 사업 운영 허브.
메타데이터, 설치 이름, 로그인 및 공통 셸(기존 fallback 셸 포함)의 제품 이름을 변경한다. 사업장은 하린식품임을 셸에서 별도 설명으로 보존한다. 아직 사업장 전환 버튼은 만들지 않는다.
현재 로그인 비밀번호-only 안내/동작, id/scope/start_url, storage 및 쿠키 이름은 그대로 둔다. 제품명만 바꾸며 앱 기능 완료를 암시하지 않는다.
기존 래스터 아이콘은 이번 범위에서 변경하지 않는다 (후속 앱 아이콘 작업).
오프라인 v1 HTML은 immutable 응답이므로 덮어쓰지 않는다. 모아온 v2 HTML을 새로 만들고 worker의 OFFLINE_CACHE/OFFLINE_URL 버전 및 next.config의 v2 immutable header를 추가한다. v1 파일/헤더는 보존. 기존 worker 등록 URL, PWA id, no skipWaiting/no clients.claim, 비공개 자료를 캐시하지 않는 정책은 유지한다. 이전 worker 캐시는 삭제하지 않는다. test/hub-pwa.test.js에서 versioned URL 기대값 및 실제 offline 응답 모아온 표기도 검증한다.
추가 소유 범위: proxy.js의 정확한 `/hub-offline-v2.html` 공개 경로 1개와 해당 회귀 테스트. prefix/다른 경로/세션 검증은 변경하지 않는다. 기존 v1 공개 경로도 유지한다. 이것이 없으면 인증 redirect된 로그인 HTML을 캐시할 수 있으므로 v2 도입과 함께 검증한다.
기존 Next 로컬 metadata 관련 가이드와 실제 소비 컴포넌트를 읽고 작업한다.
테스트는 manifest 출력 및 SSR 렌더 또는 테스트 가능한 실제 consumer의 출력으로 브랜드 반영을 검증하고 보호할 기존 계약도 확인한다. 문자열 상수만 테스트하지 않는다.
RED/GREEN과 기존 로그인/셸/PWA 관련 회귀 테스트를 실행하고 커밋한다.

## 종료 검증

루트 담당: P0 코드 조사표 및 다음 단계 차단 조건 작성. task 독립 검토와 최종 전체 diff 검토. pnpm test, pnpm build. 검증된 기능과 준비 코드, 미구현 사항을 구분하여 보고한다.
