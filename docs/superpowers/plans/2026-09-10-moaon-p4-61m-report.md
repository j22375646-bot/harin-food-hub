# P4-61M — API 설정 저장의 서버 연결

기준 c834817. 구현 2026-09-09 시작, 검증 2026-09-10. 앱 설치 버전0.51.2 유지.

## 변경된 동작

POST /api/moaon/credentials를 추가하고 기존 요청 검사·공유 요청 제한·읽기 전용 신원 확인·세션 잠금·암호화 저장을 하나의 서버 실행 흐름으로 연결했다. 필수 설정이 없으면 SETUP_REQUIRED이며 저장하지 않는다. 성공 응답은 사업장/플랫폼/revision/SAVED_UNVERIFIED만 반환한다. 이는 플랫폼 인증 성공을 의미하지 않는다.

한 처리기의 동시 요청 상한과 초기화 공유를 유지하며 실패한 초기화의 DB 연결을 정리한다. 요청 취소·종료·절대 deadline을 초기화와 후속 신원 확인에 전달한다. 이미 시작한 저장은 완료를 기다리고 결과 불명은 유지하여 자동 재시도를 유도하지 않는다.

요청 제한은 제한 DB 계정의 정확한 두 SQL 함수만 parameter binding하여 별도 트랜잭션으로 호출한다. 신원 확인용 관리자 client는 기존 읽기 전용 신원 확인에만 쓰며 키 저장/제한 RPC의 대체 연결로 사용하지 않는다.

## 활성화 설정과 남은 범위

| 서버 설정 | 의미 |
| --- | --- |
| MOAON_CREDENTIAL_SAVE_ENABLED | 명시적인1만 활성화; 기본 비활성 |
| MOAON_CREDENTIAL_SAVE_ORIGIN | 정확한 HTTPS origin |
| MOAON_CREDENTIAL_SAVE_INGRESS | vercel-direct |
| MOAON_CREDENTIAL_KEYRING | 최대8개 키 ID와 base64 32-byte 키의 JSON |
| MOAON_CREDENTIAL_ACTIVE_KEY_ID | 현재 암호화 키 ID |
| MOAON_CREDENTIAL_ADMISSION_HMAC_KEY | 요청 제한 전용 비밀값 |
| MOAON_CONTROL_DB_* | 기존 최소권한 DB 연결 설정 |

실제 Vercel production 환경과 단일 IP 헤더들의 일치를 확인한다. 일반 DATABASE_URL이나 공개 환경변수로 대체하지 않는다. 이번에는 운영 설정/SQL/권한/배포를 변경하지 않았다. 운영 제한 행 보존·정리, 키 교체, 최소권한 ACL, 요청량 점검과 앱 저장 transport 연결이 남아 있다.

기존 proxy.js의 로그인/OWNER/origin 보호는 유지했다. 따라서 요청 본문 검사보다 DB 초기화가 뒤에 온다는 보장은 새 runtime 내부에 해당하며, 전역 proxy의 인증 조회/touch까지 뒤로 이동시킨 것은 아니다. 실제 활성화 전 이 전역 권한 조건과 다사업장 정책의 대조가 필요하다.

## 사용자 작업을 방해하지 않는 앱 검증

재사용 명령:

- node desktop/test/background-login-smoke.cjs
- node desktop/test/background-login-smoke.cjs --installed-package

개발 Electron에서 D의 새 격리 프로필과 소스 또는 설치 app.asar를 실행한다. 현재 main의 show:false 생성 후 show/showInactive/focus 호출을 억제한다. 로그인 필요 상태·업무 화면의 inert 보호·sandbox/contextIsolation·Node 비노출·창 숨김/비포커스를 확인한다. 실제 사용자 로그인 프로필을 복사하거나 마우스/키보드를 조작하지 않는다. 향후 show:true 창을 추가한다면 별도 검증이 필요하다.

두 실행 모두 통과했고 시험 실행기 시작 오류도 popup 대신 고정 stderr와 종료코드1을 내는 경로를 실제 검증했다. 로그인된 설치 EXE의 업무 인수나 실제 플랫폼 동작 전체를 확인한 결과는 아니다.

## 시험 환경 보완

기존 출고 시험 두 개의60ms/1초 전체 deadline이 D 파일 쓰기 중 먼저 만료되어 의도한 POST 단계에 도달하지 못했다. 실제 출고 코드는 변경하지 않고 해당 workflow timer만 제어해 mock 네트워크 단계에 도착한 뒤 실제 만료 callback을 실행하도록 수정했다. 파일 기록/조회, POST 횟수, 등록 결과 보존, 자동 재시도 금지 검증은 유지했다. 독립 검토 승인 및 수정한2개 시험 통과.

최종 회귀·빌드·실DB 결과는 완료 후 아래에 기록한다.

## 최종 시험 결과

- 서버403파일을 정확 대조했다. 일반400파일2,660 통과·실패0·빌드 전용3개 건너뜀, 영속 DB2파일24/24 통과, 스케줄링에 민감한 복구 요청1파일38/38 개별 통과: 합계2,722 통과·실패0·건너뜀3.
- 전체 병렬 시험 중 복구 요청의 기존15ms 시각 시험이 목표 단계 진입 전에 만료한 경우가 있어, 해당파일은 변경 없이 단독 검증으로 분리했다. runtime 초기화 시험은 factory 진입 barrier와 정리 완료 대기로 수정해 의도한 취소 경로를 보장했다.
- 앱285개 시험 최초283 통과·위 타이밍2개 실패, 테스트 조건 수정 후 해당2/2 통과. 실주문 출고 동작 코드는 변경하지 않았다.
- 실제 제한 PostgreSQL runtime Request 통합1/1 통과(161.4초, 준비/정리 포함). quota·session fence·암호화는 실제 DB, 신원 외부 응답은 모의값이다. 시험DB/역할/연결 정리 후 PostgreSQL 종료와55437 리스너0 확인.
- 설치 패키지/소스의 숨김 격리 로그인 실행 각각 통과. 실제 route 모듈의 비활성 POST503 SETUP_REQUIRED 확인.
- 독립 구현/전체 검토 승인. git diff --check 통과.

## 빌드 보완

첫 webpack 빌드에서 기존 phase28-shell.module.css의 전역 단독 선택자가 CSS Module purity 규칙을 위반했다. 로딩 컴포넌트가 이미 속한 .main 아래로 네 선택자를 한정했다. CSS 속성값과 컴포넌트 구조는 유지했고 독립 검토를 통과했다. 최종 빌드 결과는 아래에 추가한다.

Windows D 소스/C 의존성 연결에서 Next16.3의 진입점 생성이 ./C:/...를 만들어 빌드가 실패한 문제도 확인했다. 경로 보존 실행 옵션은 SWC 중복 로딩을 일으켜 사용하지 않는다. 대신 Windows webpack entry의 잘못된 접두사만 제거하는 작은 보정을 추가했다. Linux·기존 entry 함수의 지연 실행/문맥·import metadata는 유지한다. 신규2개 시험과 관련75개 시험 통과, 독립 검토 승인. 이 추가 시험으로 전체 단위 시험 범위는404파일·2,724 통과·빌드 전용3개 별도 집계다. 기존 C 의존성 파일은 수정하지 않았다.

## 빌드 및 HTTP 검증 완료

일반 Node 설정(경로 보존 옵션 없음)으로 NEXT_DIST_DIR=.next-p461m, next build --webpack 성공·종료0. 새 /api/moaon/credentials가 빌드 경로 목록에 포함된다. build-only3개도 실제 출력 대상으로 통과하여 최종 서버 시험 총2,727 통과·실패0·건너뜀0이다. 관련3파일 재실행6개 중3개는 앞선 단위시험과 중복이므로 총계에는 추가3개만 반영했다.

컴파일된 route POST는 비활성 설정에서503 SETUP_REQUIRED를 반환했다. localhost127.0.0.1:3219의 production Next HTTP에서 인증 없는 저장 POST401 UNAUTHENTICATED/no-store와 로그인 페이지200을 확인했다. 시험 서버는 종료했다. 운영 배포나 실제 API키 저장을 실행한 결과는 아니다.
