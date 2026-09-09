# P4-61K — 제한 DB 역할의 API 키 저장 권한

기준365ab25. 사용자 요청: D:\GPT\moaon에서 다음 개발을 계속한다.

## Global Constraints

기존 전용 D 저장소와 codex/moaon-print-preview 브랜치를 계속 사용한다. C에 새 의존성/빌드/DB 데이터를 만들지 않는다. 운영 DB·계정·키·앱0.51.2는 변경하지 않는다. 이번 SQL은 lib/tenancy/sql의 검증용 후보이며 자동 마이그레이션이나 실제 역할 활성화가 아니다. 기존 멤버십 서버 역할의 권한을 보존한다. 공유 요청 제한·HTTP route·앱 transport는 다음 단계다.

## Task 1: 최소 권한 후보와 의미 있는 실패/성공 시험

- 기존 moaon_control_app 서버 broker 역할에 별도 credential-runtime-role.sql 후보를 추가한다. auth/control/credential/control-role 후보 설치 후 적용한다.
- 사전 조건(역할 안전성·소유권·필수 테이블/RLS)을 실패 시 원자적으로 거부한다. NOLOGIN 초기 프로비저닝 단계이며 로그인 자격증명은 별도다.
- 세션 보호에 필요한 account_state/dashboard_users/dashboard_sessions의 열 SELECT 및 불변 ID UPDATE 잠금 권한만 준다. UPDATE RLS는 USING(true), WITH CHECK(false)로 실제 쓰기를 차단한다. 인증 계정·세션·복구 상태를 바꿀 수 없어야 한다.
- provider_credentials는 필요한 열 INSERT/UPDATE, tenant/provider/revision SELECT만 허용한다. 암호문 envelope SELECT·DELETE·TRUNCATE·키 변경·DDL은 금지한다. SELECT FOR UPDATE 및 기존 저장 upsert가 이 권한으로 실제 작동해야 한다.
- ON CONFLICT의 excluded 값 참조가 추가 SELECT 권한을 요구하면 동일한 바인드 매개변수로 RHS를 바꾼다. envelope 읽기 권한을 넓히지 않는다.
- anon/authenticated/PUBLIC 접근을 추가하지 않는다. SECURITY DEFINER나 BYPASSRLS로 우회하지 않는다. 기존 control 권한 동작을 보존한다.
- PGlite 실제 SQL로 후보 없을 때 실패를 확인한 뒤 정상 OWNER 저장·revision2 갱신, 비소유자/타 사업장/폐기세션 거부, 직접 암호문 조회·인증수정·삭제 거부를 시험한다. 후보 반복 적용과 실패 rollback도 검증한다.

## Task 2: 실제 제한 연결 검증과 마무리

- D의 loopback 임시 PostgreSQL에서 실제 moaon_control_app 로그인과 createPostgresControlDatabase transport로 저장/갱신을 검증한다. 관리자 SET ROLE만으로 실제 연결 검증을 대체하지 않는다.
- 부정 권한 시험 및 세션 폐기와 저장 경합을 제한 역할 연결로 확인한다. 준비만 넉넉한 timeout, 경합 검증 제한은 별도 유지한다.
- 독립 검토, 관련 시험, 전체 회귀를 실행한다. 외장 HDD의 느린 파일 기반 시험도 최종 결과를 구분해 기록한다.
- 마스터 계획/보고서를 갱신하고 코드·계획만 커밋·푸시한다. 대화 아카이브는 로컬 제외 유지. 임시 PostgreSQL을 종료한다.

## 해석

서버 broker DB 자격증명 자체가 end-user/tenant credential은 아니다. DB 권한은 읽기/쓰기 능력을 제한하고 사업장 OWNER/세션 검증은 신뢰된 저장 모듈이 강제한다. 이 단계 완료를 실제 API 키 인증 또는 신규 사업장 연결 완료로 부르지 않는다.

## 사전 검토 보완

- 기존 열별 grant는 테이블 REVOKE만으로 제거되지 않는다. 대상 네 테이블의 열별 권한을 명시적으로 정규화하거나 과권한 상태를 거부하고 그 동작을 시험한다.
- transport 역할 검사에 moaon_auth 스키마/테이블 및 public.dashboard_users/dashboard_sessions 소유권을 추가하여 RLS 소유자 우회를 거부한다. 기존 transport의 안전한 연결·오류 정제·거래 재시도 금지를 유지한다.
