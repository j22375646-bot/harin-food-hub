# MOAON 계정 저장 기반 → 실제 가입 연결 조건

개발번호: P1-02 조사 부속 / 다음 P1-03 입력. 확인일: 2026-09-07.

## 현재 재확인한 사실

운영 catalog만 읽었으며 사용자·고객 행과 비밀키를 조회/수정하지 않았다.

- public table 129개, public tenant_id 컬럼 0개, moaon_control 스키마 없음.
- dashboard_users.user_id와 dashboard_sessions.user_id는 UUID다.
- dashboard_users에는 email과 active가 있지만 이메일 인증 완료 시각은 없다.
- dashboard_sessions에는 만료·폐기·token_hash가 있다. 사업장 소속이나 이메일 인증 증거는 없다.
- `lib/dashboard-auth.js:170`의 validateSession은 기존 서명·DB 세션·폐기·만료를 검사하고 사용자 ID를 반환하지만 검증된 이메일은 반환하지 않는다.
- `resolveRequestSession`의 헤더 기반 축약 결과는 session ID/만료/이메일을 모두 제공하지 않는다. 이를 신규 초대 수락 신원으로 그대로 넣지 않는다.
- proxy는 현재 보호 경로에 OWNER만 허용한다. 새 VIEWER/OPERATOR를 등록하는 것만으로 기존 화면을 열 수 없다.
- 기존 공통 DB client는 service_role이므로 신규 제한 역할/사업장 RLS를 대신하지 않는다.

## P1-03에서 연결할 순서

1. 별도 PostgreSQL/Supabase 검증 DB를 확보하고 초기 스키마를 실제 서버에서 검증한다. 시험용 PGlite는 단일 연결이며 실제 풀·동시 락·Supabase Auth를 증명하지 않는다.
2. 제어 저장소 전용 제한 DB 역할과 고정 쿼리 transaction adapter를 만든다. 연결 실패/rollback/connection release/권한 거부를 검증한다. API 요청에 SQL이나 역할 이름을 받지 않는다.
3. 기존 DB 세션 검증에 현재 사용자 활성 상태와 인증 공급자의 이메일 확인 상태를 결합한 trusted identity adapter를 만든다. profile.email 입력만으로 emailVerified=true로 간주하지 않는다.
4. 비밀번호 재설정·계정 중지·회원 권한 회수 후 기존 세션의 새 요청이 차단되는지 시험한다. 기존 하린식품 OWNER 로그인을 유지한다.
5. 신규 제어 경로는 기존 전역 업무 API에 연결하지 않는다. P2의 주문·금액·파일·캐시 격리가 끝나기 전 공개 초대/가입 화면을 열지 않는다.
6. 실제 서버에서 같은 초대를 동시에 두 번 수락, 두 OWNER의 동시 탈퇴, 초대 수락과 회수 경합을 서로 다른 연결로 실행한다. 회원/초대/감사 저장은 전부 성공하거나 전부 rollback되어야 한다.

## 다음 단계 검증표

| 시험 | 합격 기준 |
|---|---|
| 세션 위조/만료/폐기 | 새 회원·초대 저장 0건, 안전한 오류 |
| 이메일 미확인/불일치 | 가입되지 않음; 다른 사업장 정보 노출 없음 |
| 동시 초대 수락 | 회원 1건, 성공 1회, 재사용 거부 |
| 동시 마지막 관리자 탈퇴 | 활성 OWNER가 0명이 되지 않음 |
| DB 장애/감사 기록 실패 | 부분 회원 생성/초대 소모 없음 |
| 제한 역할 | 공개 역할 직접 접근 거부, 범용 service-role 경로 없음 |
| 기존 로그인 회귀 | 현재 하린식품 계정 잠금/비밀번호 변경 없음 |
| 사업장 경계 | 멤버십만으로 기존 전역 업무 API 개방 불가 |

운영 전환 migration은 이 검증 후 Supabase CLI로 생성하고 검토한다. 현재 후보 SQL은 자동 실행되는 migration 폴더에 넣지 않는다. 유료 DB 추가·실사용자 초대·실계정 연결은 이번 실행 범위가 아니다.

## 참고

- [PGlite 공식 안내](https://pglite.dev/docs/): 로컬 SQL 시험 용도 및 단일 연결 한계.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): role/table privilege와 행 정책, service-role 우회 주의.
- [통합 개발 계획](../plans/2026-09-07-multi-business-desktop-master-plan.md).
