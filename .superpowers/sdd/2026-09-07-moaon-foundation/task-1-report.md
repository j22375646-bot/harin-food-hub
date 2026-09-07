# Task 1 구현 보고서: 사업장 컨텍스트 및 권한 계약

## 결과

- `resolveTenantContext`가 서버 세션과 매 호출 조회한 membership을 검증한 뒤 동결된 요청 단위 context를 발급한다.
- 발급 context는 비공개 `WeakSet`의 객체 동일성으로 확인하며, 임의 객체·복제본·프로토타입 객체를 신뢰하지 않는다.
- `authorizeAction`은 명시된 네 action과 역할 조합만 허용하고 나머지는 `PERMISSION_DENIED`로 fail-closed 처리한다.
- DB, 환경변수, 네트워크, 기존 인증, 라우트에는 연결하지 않았다. 실사용 다사업장 기능이 아니라 후속 서버 통합을 위한 준비 계약이다.

## TDD 증거

- RED: `pnpm test -- test/tenant-context.test.js test/tenant-permissions.test.js`
  - 신규 두 테스트 파일이 `Cannot find module '../lib/tenancy/context.js'`로 실패했다.
  - 당시 전체 집계: 1953 tests, 1948 pass, 2 fail, 3 skipped.
- GREEN: `node --test test/tenant-context.test.js test/tenant-permissions.test.js`
  - 13 tests, 13 pass, 0 fail, 0 skipped.

## 안정 오류 계약

| code | status | 조건 |
| --- | ---: | --- |
| `AUTH_REQUIRED` | 401 | 세션 누락, 필수 식별자 누락, 잘못된 만료일, 만료 |
| `TENANT_REQUIRED` | 400 | 사업장 ID 누락 |
| `TENANT_ACCESS_DENIED` | 403 | 비회원, 교차 사업장, 비활성·불명확·잘못된 membership |
| `TENANT_LOOKUP_FAILED` | 503 | membership 조회 예외; 내부 원문 비노출 |
| `PERMISSION_DENIED` | 403 | 위조 context, 미허용 역할, 알 수 없는 역할/action |

## 남은 통합 조건과 위험

- context는 프로세스 메모리의 객체 동일성에 묶이므로 직렬화하거나 다른 런타임으로 전달할 수 없다. 서버 요청 안에서 resolve 후 즉시 authorize 해야 한다.
- 이 준비 모듈은 기존 인증과 연결되지 않았다. 후속 통합에서 검증된 서버 세션과 신뢰 가능한 membership 어댑터만 주입해야 한다.
- 장기 보관 또는 캐싱하면 membership revoke 반영 계약을 우회할 수 있으므로 금지한다.
- 전체 회귀 테스트와 production build는 공통 계획에 따라 루트 담당 최종 검증에서 수행한다.

## 변경 파일

- `lib/tenancy/context.js`
- `lib/tenancy/permissions.js`
- `test/tenant-context.test.js`
- `test/tenant-permissions.test.js`
- `.superpowers/sdd/2026-09-07-moaon-foundation/task-1-report.md`
