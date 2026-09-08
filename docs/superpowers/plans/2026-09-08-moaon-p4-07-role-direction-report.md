# P4-07 역할 방향 검증과 이전 판단 정정

## 결과

P4-06의 '관리자 membership 때문에 adapter가 거부한다'는 판단은 잘못됐다. 실제 postgres-control-database.js는 pg_auth_members.member = 현재 역할 OID만 검사한다. 운영 SQL 재조회 결과 has_role_membership=false, administrators=1, rolcanlogin=false다. 관리자 관계가 있다는 이유로 adapter를 수정할 필요는 없다.

control-role.sql의 재실행용 사전 검사는 양방향 membership을 검사하므로 기존 역할에 후보 SQL을 그대로 재실행하면 거부할 수 있다. 이것은 runtime adapter와 다른 경로다. 두 검사를 혼동한 이전 보고를 정정한다. 운영 migration 재실행이나 관리 관계 삭제는 하지 않았다.

## 추가한 검증

test/tenant-postgres-control-database.test.js에 실제 adapter가 보내는 역할 SQL을 PGlite PostgreSQL에서 실행하는 특성 시험을 추가했다. 관리자가 앱 역할을 관리하는 방향에서 false, 반대로 앱에 synthetic_parent 역할을 부여하면 true를 확인한다. 합성 역할은 메모리 DB에만 생성하고 종료했다. 운영에는 읽기 전용 조회만 수행했다.

관련 4개 테스트 파일 총 75개 통과. 최초 시험은 테스트 DB의 session authorization 복귀 설정 오류로 실패했고, 명시적 postgres 복귀로 수정했다. 제품 버그의 red-green 증거라고 주장하지 않는다. 제품 코드는 변경하지 않았다.

## 다음 단계

실제 미완료 조건은 NOLOGIN 전용 역할의 안전한 자격 증명 제공과 서버 비밀 설정, 직접 연결 인수다. 이후 소유권 대조 및 사업장 목록 서비스를 연결한다. DB 암호를 채팅이나 EXE에 넣지 않는다. runtime 검사를 우회하거나 service_role로 대신 연결하지 않는다.

UI/EXE/운영 데이터/운영 권한 변경과 새 유료 자원 생성 없음. 실제 전용 계정 로그인 및 사업장 선택 운영 개방은 아직 완료되지 않았다.

[전체 개발계획](./2026-09-07-multi-business-desktop-master-plan.md)
