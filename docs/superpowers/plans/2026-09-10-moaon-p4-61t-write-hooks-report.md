# P4-61T — 저장 자동 실행 동작 점검

기준 f69b499. D:\GPT\moaon에서 개발. 제품 앱0.52.0 유지.

## 변경과 범위

권한·RLS 정책이 정상이어도 추가 트리거/룰이 저장 결과를 바꿀 수 있다. 후보 SQL의 보호 테이블4개(provider_credentials, account_state, dashboard_users, dashboard_sessions)는 사용자 트리거·룰·상속을 정의하지 않는다. 새 `node scripts/check-moaon-credential-write-hooks.js`는 해당 차이를 읽기 전용으로 점검한다.

명시적 MOAON_CONTROL_DB_DIAGNOSTIC=1과 기존 제한 DB 연결을 사용한다. 자동 env파일 로딩·대상/SQL 인수·운영 수정은 없다. 고정 catalog SELECT에서 일반 테이블·비파티션·상속 부모/자식 부재, rewrite rule 부재, 사용자 트리거 부재를 확인한다. 비활성 사용자 트리거도 후보와 다른 상태다.

PostgreSQL 내부 트리거는 해당 테이블에 연결된 외래키 제약과 내장 RI_FKey 함수에 연결되고 enabled=O인 경우만 허용한다. 내부 트리거 비활성 및 session_replication_role의 origin 이탈도 감지한다. 트리거/룰/함수 본문이나 실제 행을 실행·조회하지 않는다. 반환은 고정 code/status이며 쿼리·결과형태·연결 정리 실패도 BLOCKED다.

성공 CREDENTIAL_WRITE_HOOKS_MATCH_REQUIRES_OPERATIONS는 이 검사 범위의 일치만 의미한다. 외래키 정의·트리거 구성의 전체 완전성, 다른 테이블·함수·기본값·권한·정책 및 실제 저장/세션/quota/플랫폼 인증은 별도다. 신뢰된 DB 관리자가 시스템 카탈로그를 변조하는 상황의 무결성 증명 도구가 아니다.

## 검증

- PGlite에 실제 auth/control/credential/role 후보 SQL을 적용해 정상 내부 외래키 트리거가 허용되는 것을 확인했다. 제한 역할의 카탈로그 조회로 실행했다.
- row trigger, 비활성 statement trigger, 지연 constraint trigger, UPDATE rewrite rule, 상속 부모/자식, 파티션 테이블로의 대체, 내부 트리거 비활성, replication mode 변경을 감지했다. 각 변경을 복구한 뒤 정상 상태를 재확인했다.
- 사용자 트리거 함수는 실행 시 예외를 던지도록 구성했다. 검사에서 함수 실행 없이 INVALID가 됐으며 이름·오류 원문도 출력되지 않았다.
- 신규3/3 PASS 및 확장한 상속/파티션 시험 후 최종3/3 재PASS. D:\GPT\tmp\p461t-final.log. opt-in·연결 정리·안전한 오류/JSON·CLI 인수 거부·성공 exit0을 포함한다.

- 관련7개 파일의 존재를 먼저 확인한 회귀29/29 PASS, 실패/건너뜀0. D:\GPT\tmp\p461t-tests.log. 최종 신규 재실행과 중복 합산하지 않는다.
- 설치0.52.0 app.asar의 설정14개와 격리 Windows 로컬 암호화 회귀 PASS. 오른쪽 보조 모니터에서 visible=true/focused=false/rightSecondary=true/contained=true 확인. D:\GPT\tmp\p461t-right-verification.png를 시각 확인했다. synthetic IPC 시험으로 실제 서버 저장/플랫폼 인증과 구분한다.

이번에는 native PostgreSQL/운영 DB 접속과 제품 코드 변경·재패키징을 수행하지 않았다. 실제 운영 적용·함수 대조·세션/quota 경합·플랫폼 인증은 남아 있다.
