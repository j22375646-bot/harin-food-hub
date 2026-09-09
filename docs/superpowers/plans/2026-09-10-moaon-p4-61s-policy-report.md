# P4-61S — 자격증명 런타임 RLS 정책 대조

기준 b6887c2. D:\GPT\moaon에서 개발. 제품 앱0.52.0 유지.

## 범위와 구현

앞선 열 권한 점검은 인증 테이블 UPDATE가 잠금용인지 실제 변경을 허용하는지 증명하지 않았다. 이번에는 후보 credential-runtime-role.sql이 정의한 보호 테이블4개의 정책9개를 카탈로그와 정확히 대조한다.

`node scripts/check-moaon-credential-policies.js`는 기존 MOAON_CONTROL_DB_DIAGNOSTIC=1과 제한 DB 연결을 사용한다. 환경 파일·임의 SQL·대상 인수를 받지 않으며, opt-in 전에 연결을 생성하지 않는다. 조회·오류·정리 결과는 고정 code/status만 출력한다. 성공은 CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS/exit0이고 누락·차이·연결/정리 실패는 BLOCKED/exit1이다.

정확한 역할/세션, 상속·역할 멤버십·BYPASSRLS 부재, table RLS 및 비소유자, row_security=on, pg_catalog search_path를 확인한다. 정책 이름·명령·permissive·단일 대상 역할·USING/WITH CHECK의 true/false/null을 후보와 대조하고 관련 정책 집합의 추가·누락을 감지한다. 다른 역할이 같은 예약 정책 이름을 사용해도 거부한다. PUBLIC이나 런타임 역할에 적용되는 추가 정책은 permissive/restrictive 모두 거부한다.

보호 테이블은 provider_credentials, account_state, dashboard_users, dashboard_sessions다. 인증 테이블3개의 잠금 정책은 USING(true)/WITH CHECK(false), 저장 테이블은 SELECT/INSERT/UPDATE 후보와 일치해야 한다. 정책 표현은 실행하지 않고 pg_get_expr로 정확히 대조하며 외부 객체 의존성도 거부한다. 다른 역할 전용 정책은 이 점검의 성공 범위에 포함하지 않는다.

## 검증

- 명시적 파일6개 존재 확인 후 관련26/26 PASS, 실패/건너뜀0. D:\GPT\tmp\p461s-tests.log.
- 마지막 추가 시험 후 신규3/3 재PASS. 중복 합산하지 않는다. D:\GPT\tmp\p461s-final.log.
- PGlite의 실제 auth/control/credential/role 후보 SQL로 정상 기준을 구성했다. WITH CHECK 변경, SELECT 조건 변경, PUBLIC/다른 역할/복수 역할, 추가 permissive·restrictive 정책, 잘못된 command, 정책 누락, RLS 비활성, BYPASSRLS, 역할 멤버십, row_security/search_path 변경을 감지하고 복구 후 정상화를 확인했다.
- 실행 시 예외를 던지는 사용자 함수를 정책에 넣어도 함수 실행 없이 INVALID가 됐다. 다른 역할 전용 정책은 명시된 범위 밖으로 유지했다. CLI의 안전한 JSON·인수 거부·성공 exit0, query/shape/close 실패 처리를 검증했다.
- 설치0.52.0 app.asar의14개 설정 시나리오와 격리 Windows 로컬 암호화 회귀 PASS. visible=true/focused=false/rightSecondary=true/contained=true. 캡처 D:\GPT\tmp\p461s-right-verification.png. synthetic IPC 시험으로 실제 서버 저장/플랫폼 인증과 구분한다.

제품 코드나 기존 SQL은 바꾸지 않았으므로 재패키징하지 않았다. 이번에는 native PostgreSQL이나 운영 DB에 접속하지 않았고 과거 native 결과를 이번 실행 결과로 합산하지 않는다. 다른 정책·열 권한·제약·함수/트리거/룰·quota·세션 경합·OWNER 정책·키관리·ingress·실제 플랫폼 인증은 별도 검증 대상이다. 운영 정책 자동 적용이나 실제 키 변경은 수행하지 않았다.
