# P4-61O — 서버 저장 설정 사전 점검 결과

기준3c47ee0. D:\GPT\moaon. 앱0.52.0 유지.

## 변경

`node scripts/check-moaon-credential-readiness.js`로 현재 프로세스에 전달된 설정을 검사한다. runtime validator를 재사용해 비활성 상태에서도 후보 키 구성·DB/TLS 구성·신원 확인·Vercel 환경·앱 고정 origin을 검사한다. 입력 환경은 변경하지 않는다.

설정 형식이 맞아도 CONFIGURATION_VALID_REQUIRES_OPERATIONS이며 실제 DB 권한/schema/session fence/quota/ingress/OWNER정책/키 관리/플랫폼 인증은 UNVERIFIED다. 고정 code/status만 출력하며 비밀값·키ID·주소·DB값·오류본문을 출력하지 않는다. DB/client/fetch 호출, 자동 .env 로드, 운영검증 수동통과 옵션은 없다. CLI exit0은 설정 형식 통과이고, 누락/오류/임의인수는 exit1이다.

[운영 적용·중단 절차](./2026-09-10-moaon-credential-activation-runbook.md)는 실제 proxy의 전역 OWNER와 사업장 ACTIVE OWNER 조건을 구분하고, NOLOGIN 역할 프로비저닝 전제·키 관리·진입 경로·요청 한도를 대조한다. runtime이 시작 시 설정을 보관하므로 중단 설정의 새 배포/재시작과503 확인이 필요하다. 비활성 중에는 GET도 중단되므로 결과 불명은 운영자의 읽기 전용 점검 또는 통제된 재활성화 후 GET으로 확인한다.

## 이번 검증

- 새6개 및 runtime/request/metadata/store/envelope/control-config 관련 총28개 PASS,0FAIL. 임시 경로 이식성 보완 뒤 새6개만 재실행하여6PASS 확인.
- 독립 검토 승인. runbook의 비활성화 의미와 Windows 경로 하드코딩을 보완했다.
- 설치된0.52.0 app.asar 숨김 로그인 보호 PASS. 같은 설치 패키지의14개 설정 UI 시나리오·1040/1440 폭·실제 Windows 격리 로컬 암호화 저장/삭제 PASS. 모든 시험 창 hidden/unfocused. 개발 Electron44.2.0이며 서버 저장 응답은 synthetic IPC, 실제 운영 자격증명 저장 검증은 아니다.
- 현재 개발 셸에서 진단 exit1: BLOCKED/DISABLED,5개 설정 그룹 MISSING,8개 운영 항목 UNVERIFIED. 이는 로컬 프로세스 설정이 전달되지 않았다는 결과이며 원격 운영환경을 조회한 결과가 아니다.
- 앱/route/runtime/SQL 변경이 없어서 재패키징·Next 전체빌드·전체2731회귀·native DB 재실행은 하지 않았다. 이전 결과를 이번 재실행으로 합산하지 않는다.

## 남은 범위

실제 배포 환경의 설정·권한·SQL 적용 상태와 키 보관/진입경로 증거 대조, 운영 적용, 소유자 확인 후 실제 플랫폼 인증이 남아 있다. 이번 도구와 절차 작성은 그 준비이며 운영 설정/SQL/키/배포는 변경하지 않았다.
