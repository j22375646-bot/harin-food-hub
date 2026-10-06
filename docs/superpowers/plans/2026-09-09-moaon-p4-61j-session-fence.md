# P4-61J — 저장 요청과 세션 폐기 직렬화

기준 HEAD b9965c8, 앱 0.51.2. 사용자가 다음 개발과 D:\GPT 저장을 요청했다.

## 작업 위치

최신 소스를 독립 저장소 D:\GPT\moaon에 준비한다. C 원본은 보존하며 대화 보존본과 UI/계획 색인도 D에 복사한다. 개발 임시파일·패키지 캐시·DB 시험 데이터는 D:\GPT 하위에 둔다. 실행 중인 Codex의 전역 데이터 저장 위치를 변경했다는 의미는 아니다.

## Global Constraints

기존 API 키 원문, 운영 DB, 로그인 세션, 앱 설정을 변경하지 않는다. 신규 사업장 실제 연결·HTTP route 개방은 운영 역할과 공유 요청 제한 등 미완료 경계가 있어 이번 단계 완료로 표시하지 않는다. 기존 암호화·OWNER 확인·revision 충돌 거부를 보존한다. 외부 신원 검증은 읽기 전용이어야 하며 행 잠금을 보유한 상태에서 별도 연결로 세션 touch를 실행하지 않는다.

## Task 1: 필수 트랜잭션 세션 보호

- credential-store에 필수 서버 주입 세션 보호 어댑터를 연결한다. 미구성 fallback 금지.
- 검증된 사용자·세션과 요청 토큰 해시를 같은 트랜잭션에서 확인한다.
- account_state → dashboard_users → dashboard_sessions → tenant/member → credential 순서로 잠근다.
- blocked/inactive/revoked/token 불일치/DB 시각 만료를 거부한다.
- 저장 완료 직전 DB 시각과 외부 신원을 재확인한다. 실패는 전체 rollback.
- PGlite 실제 SQL로 실패를 재현한 후 구현한다. 정상 암호화 저장·권한 거부·revision 보호 회귀를 유지한다.

## Task 2: 동시 요청 시험과 통합 검토

- D의 폐기 가능한 loopback PostgreSQL에서 두 연결의 저장/로그아웃 선후 경합을 검증한다.
- 비밀번호 변경 잠금 및 대기 중 만료도 검증한다. 네트워크/세션 불명 결과를 성공으로 바꾸지 않는다.
- 독립 코드 검토 후 관련 시험 및 정식 전체 시험을 실행한다.
- 테스트 결과와 운영 역할·분산 요청 제한·route·앱 연결의 남은 범위를 마스터 계획에 갱신한다.
- 검증한 코드와 보고서만 커밋·푸시한다. 이번 서버 후보 모듈만을 이유로 앱 버전·설치본을 새로 만들지 않는다.

## 근거

- 기존 P4-61G/H/I 보고서 및 실제 구현.
- PostgreSQL 공식 행 잠금: https://www.postgresql.org/docs/current/explicit-locking.html
- Supabase changelog.md는 웹 도구의 text/markdown 지원 오류로 읽지 못했다. 새로운 Supabase SDK/API에는 의존하지 않는다.
