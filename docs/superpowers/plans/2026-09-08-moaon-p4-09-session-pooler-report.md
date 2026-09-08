# P4-09 IPv4 세션 풀러 지원 코드

## 구현 범위

전용 설정 MODE=direct 또는 supabase-session을 명시적으로 지원한다. 세션 모드에서는 20자리 소문자 프로젝트 ref, aws-*.pooler.supabase.com 주소, 5432 포트만 받는다. 접속 이름은 moaon_control_app.<project-ref>로 생성한다. 호스트의 실제 프로젝트 연결 주소는 Supabase Connect에서 확인해야 하며 샘플 주소를 운영 주소로 추정하지 않는다.

adapter가 접속 이름을 검증할 때만 프로젝트 접미사를 허용한다. SQL의 current_user/session_user 검사 대상은 계속 moaon_control_app이며 관리자 계정이나 접미사가 붙은 실제 역할 응답은 거부한다. SSL 인증서 검증, 제한 풀, 세션 초기화, 트랜잭션 및 권한 검사를 유지했다. pooler metadata를 pg 드라이버로 전달하지 않는다.

트랜잭션 풀러 6543은 세션 모드에서 거부한다. 자동 접속 모드 전환이나 인증 실패 자동 재시도는 추가하지 않았다. 직접 연결 기존 동작은 유지한다.

## 검증

신규 테스트 2개가 구현 전 실패(접미사 미생성, adapter 설정 거부), 구현 후 통과했다. 관련 5개 파일 전체 81개 시험 통과. 잘못된 ref, 다른 계정, 악성 접미사 호스트, 6543, 실제 session_user 불일치 시 거부 및 연결 폐기를 포함한다.

풀러 시험의 네트워크 경계는 테스트 더블이다. 실제 Supavisor 인증/TLS/DISCARD ALL/동일 세션 유지에 대한 운영 인수는 미실시다. 따라서 IPv4 실제 연결 성공으로 표시하지 않는다.

## 다음 단계와 제한

실제 프로젝트 session pooler 주소 확보 → NOLOGIN 역할 자격 증명을 서버 비밀 설정에 제공 → 실연결 역할/세션/트랜잭션 확인 → 사업장 소유권 대조 및 API 연결. 운영 역할/비밀번호/환경 변수/데이터 변경, 신규 유료 자원, 웹 및 EXE 배포는 이번에 하지 않았다. 아직 route는 이 설정 모듈을 소비하지 않는다. Next UI/route 변경이 없어 Next 빌드는 실행하지 않았다.

공식 연결 모드 문서: https://supabase.com/docs/guides/database/connecting-to-postgres

[전체 개발계획](./2026-09-07-multi-business-desktop-master-plan.md)
