# P4-06 운영 제어 스키마·NOLOGIN 역할 준비

## 실제 적용 결과

사용자가 승인한 전용 제어 스키마·최소권한 역할 준비 범위에서 운영 프로젝트 llnlphdmcmwgjnpndaam에 적용했다. 관리 도구 연결이 이번에는 정상 동작했다. 적용 전 SQL 카탈로그에서 moaon_control 스키마 없음, moaon_control_app 역할 없음 확인.

기존 lib/tenancy/sql/control-plane.sql 및 control-role.sql을 검토하고 migration `moaon_control_plane_restricted_nologin`으로 적용했다. 잠금 제한 2초, 명령 제한 15초. 신규 테이블 tenants, memberships, invitations, audit_events는 모두 빈 상태다. 고객 자료를 복사하거나 사업장/소유자 매핑을 넣지 않았다.

## 검증

- 관련 로컬 시험 74개 통과, 실패 0개: tenant-control-store, tenant-postgres-control-database, business-list-service, business-list-request. 기존 격리 worktree에서 실행. 운영 서버 연결 종단간 시험은 아니다.
- 운영 테이블 4개 모두 RLS 활성, 소유자 postgres, 정책 9개.
- anon/authenticated/service_role의 제어 스키마 USAGE 및 tenants SELECT 권한 false.
- moaon_control_app의 기존 public 업무 테이블 SELECT/INSERT/UPDATE/DELETE 권한이 있는 테이블 수 0.
- 역할 LOGIN/SUPERUSER/INHERIT/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS 모두 false.
- 제어 정책은 신뢰된 서버 역할용이다. 회원별 권한 확인은 서버 저장소 책임이며, 이 DB 역할을 클라이언트에 제공하거나 역할만으로 사업장 격리 완료라고 주장하면 안 된다.

## 발견한 운영 차이 — 연결 전 해결 필요

PostgreSQL 역할 생성 후 관리용 membership 1개가 자동 생성됐다: granted_role=moaon_control_app, member=postgres, grantor=supabase_admin, admin_option=true, inherit_option=false, set_option=false.

이는 앱 역할이 관리자 역할을 상속하는 방향이 아니다. 하지만 현재 adapter는 역할에 관계된 membership이 하나라도 있으면 거부하므로 현재 상태로 연결 인수는 통과하지 못한다. 관리형 DB의 역할 관리 관계를 조사한 후 허용 범위를 증명하는 테스트 또는 제한된 구성 조정이 필요하다. 이번에는 관리 관계 제거, 검증 우회, LOGIN 활성화나 비밀번호 생성 없이 NOLOGIN으로 유지했다.

## 보안 진단

Supabase advisor는 기존 public 테이블의 RLS 정책 없음 INFO 127건과 유출 비밀번호 보호 꺼짐 WARN 1건을 반환했다. 새 제어 스키마에 대한 항목은 반환되지 않았다. 전체 보안 이상 없음이라는 의미가 아니며, 기존 서버 전용 테이블에 공개 정책을 일괄 추가하지 않았다.

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- 역할 공식 문서: https://supabase.com/docs/guides/database/postgres/roles

## 범위와 다음 단계

운영 DB 준비 부분 완료. 기존 주문·정산·로그인 자료 변경 없음, 유료 프로젝트/브랜치/컴퓨트 추가 없음. 새 EXE/웹 배포 없음. 사업장 목록 route는 기존 SETUP_REQUIRED 상태를 유지한다.

다음은 관리형 역할 membership 호환성 검증 → 제한 연결 자격 증명 서버 비밀 설정 → 기존 사용자와 사업장 소유권 대조 → 목록 route 연결과 사업장 선택 UI다. 지금 다른 사업장 가입/로그인을 사용할 수 있다는 뜻은 아니다.

[전체 개발계획](./2026-09-07-multi-business-desktop-master-plan.md)
