# P4-61Q — 자격증명 열 구조·최소권한 대조

기준4c97164. D:\GPT\moaon, 앱0.52.0 유지. 기존 사용자 지침대로 가시 검증은 오른쪽 보조 모니터에 showInactive로 표시하며 원격 마우스/키보드와 메인 포커스 변경을 사용하지 않는다.

## 구현 범위

새 lib/tenancy/credential-contract-check.js와 CLI scripts/check-moaon-credential-contract.js. 기존 제한 역할 DB factory/diagnostic noop/명시적 MOAON_CONTROL_DB_DIAGNOSTIC=1/고정 catalog 조회/안전 code 응답/항상 close를 재사용한다. 임의 인수·SQL·대상·env파일 로드·운영증거 수동 통과 없음.

provider_credentials의6개 열을 credential-store.sql과 대조한다: 이름/정확한PG형식/NOTNULL/생성·identity열 아님,updated_at default존재. 누락/추가열도 계약 불일치다. default표현식/제약/인덱스는 미검증이다.

credential-runtime-role.sql의4개 보호 테이블(provider_credentials/account_state/dashboard_users/dashboard_sessions)에 대해 역할 moaon_control_app의 실제 SELECT/INSERT/UPDATE/REFERENCES 열 권한을 정확한 allowlist와 대조한다. 테이블 DELETE/TRUNCATE/TRIGGER 금지. table grant와 PUBLIC의effective grant도 포함하고 새열에 넓은 권한이 생기면 거부한다. 기존 adapter의 제한 역할·TLS검사는 유지한다. 다른 테이블/역할/정책을 모두 검사했다고 주장하지 않는다.

성공 status CREDENTIAL_CONTRACT_MATCHES_REQUIRES_OPERATIONS는 전체READY가 아니다. 기타ACL/정책/함수정의/실세션fence/quota/ingress/키관리/플랫폼인증은 UNVERIFIED. 실데이터/암호문 조회·SQL쓰기·업무함수호출 없음. 운영DB 접근/키변경/배포 없음.

## 분담 및 검증

구현자: 모듈/CLI/시험. 실제 후보 SQL로 정상fixture를 만들고 누락/자료형/nullable/추가열/암호문읽기/전체tablegrant/PUBLICgrant/불필요인증열권한 등 변경을PGlite catalog로 검증. nooptin/오류누출/정리/CLI 경계도확인.
Root: plan/runbook/report/master, 기존 설치0.52.0 가시14시나리오·오른쪽비포커스·캡처, 관련 회귀, 현재셸미활성diagnostic 확인, 독립검토와기존브랜치 commit/push. UI제품코드불변이므로 재설치하지 않는다. 검증 범위와 과거 전체시험 결과를 구분한다.
