# P4-61Q — 자격증명 열 구조·최소권한 점검 결과

기준4c97164. 개발 저장소 D:\GPT\moaon. 앱0.52.0 유지.

## 변경

`node scripts/check-moaon-credential-contract.js`로 자격증명 저장 계약을 읽기 전용으로 대조한다. 명시적 MOAON_CONTROL_DB_DIAGNOSTIC=1과 기존 최소권한 DB 연결이 필요하다. opt-in 전에는 pool도 생성하지 않는다. env파일·대상·SQL·운영 검증 인수는 자동으로 받지 않는다.

provider_credentials 6개 열의 이름/PG형식/NOTNULL/생성·identity 여부와 updated_at 기본값 존재를 확인한다. 추가열도 현재 계약과 다른 상태로 표시한다. 보호 테이블4개의 실제 열 권한을 후보 credential-runtime-role.sql과 정확히 대조하며, 암호문 읽기·불필요 열 권한·전체 테이블 권한·PUBLIC 부여·grant option을 거부한다. 향후 추가되는 테이블 권한도 직접 ACL 대조로 놓치지 않도록 했다.

카탈로그와 PostgreSQL 내장 권한 검사만 사용하며 실데이터/암호문을 읽거나 업무 함수를 실행하지 않는다. 기존 adapter의 세션 초기화/역할/TLS/timeout 확인은 유지한다. 결과는 고정 code/status만 출력하고 연결/쿼리/정리 실패 시 비밀 오류를 노출하지 않는다.

성공은 CREDENTIAL_CONTRACT_MATCHES_REQUIRES_OPERATIONS다. 제약·기본값 표현식·인덱스·RLS정책·함수본문·다른DB권한·quota동작·OWNER정책·키관리·세션fence·ingress·플랫폼 인증은 별도 UNVERIFIED로 남긴다. 전체 DB 또는 운영 준비 완료를 뜻하지 않는다.

## 검증

- 최종 관련20/20 PASS: 계약 검사3, 구조 검사4, control DB config7, 실제 제한 역할 후보5, 암호화 저장1. 파일 존재를 먼저 검증한 명시적 목록으로 실행했다.
- 마지막 raw tableACL 포괄 강화 후 신규3/3 재실행 PASS. 중복은 합산하지 않는다.
- PGlite에 실제 auth/control/credential/role 후보 SQL을 적용해 정상 기준을 구성했다. 자료형·NULL·추가/누락열·기본값·generated/identity·암호문 SELECT·전체/PUBLIC/불필요 열 권한·DELETE/TRUNCATE/TRIGGER·grant option을 변경하고 감지·복구를 확인했다. 실제 운영 DB에서는 실행하지 않았다.
- CLI 기본 factory의 연결 실패·정리·순수 JSON, 임의 인수의 연결 전 거부, 성공 응답과 exit0을 격리 child에서 검증했다.
- 현재 개발 셸의 opt-in 없는 진단은 DIAGNOSTIC_OPT_IN DISABLED/BLOCKED,exit1이며 DB 미연결이다. 원격 운영환경의 상태를 조회한 결과가 아니다.
- 설치0.52.0 app.asar의14개 설정 시나리오와 실제 Windows 격리 로컬 암호화 회귀 PASS. 오른쪽 보조 모니터에 표시했고 visible=true/focused=false/rightSecondary=true/contained=true 확인. 캡처 D:\GPT\tmp\p461q-right-verification.png. 개발 Electron44.2.0의 synthetic IPC 시험이며 운영 키 저장/플랫폼 인증 검증과 구분한다.
- 독립 검토 승인. 실제 앱 제품/route/기존SQL 변경이 없으므로 재설치·전체 Next 빌드·과거 전체2731시험 재실행을 주장하지 않는다.

[운영 점검 절차](./2026-09-10-moaon-credential-activation-runbook.md)에 명령과4개 테이블 허용 권한을 추가했다. 실제 배포 환경의 점검·정책/함수 대조·활성화·소유자 확인 후 플랫폼 인증은 남아 있다.
