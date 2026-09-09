# P4-61L — 여러 서버가 공유하는 API 키 저장 요청 제한

기준2bcee9d. 사용자 요청: 바탕화면 정상화와 개발 계속, 매 단계 설치 앱 직접 실행 검증.

## Global Constraints

D:\GPT\moaon 기존 전용 브랜치를 사용한다. 새 로그/시험 데이터 D. 운영 SQL·역할·키·route·앱 서버 저장은 이번에 활성화하지 않는다. 기존 세션 fence·OWNER·암호화·revision·RESULT_UNKNOWN을 보존한다. 시험과 설치 앱 실행 검증을 별개 근거로 기록한다.

## Task 1: 공유 admission 후보와 요청 처리기 연결

- credential-request-admission.js: createCredentialRequestAdmission({rpcClient,hmacKey,trustedClientIp,verifySession,timeoutMs=10000}) -> async(credential, {signal}={}) -> frozen {allowed:boolean}. 인자는 서버 주입이며 원본 IP/cookie/사용자/키 입력은 저장·로그하지 않는다.
- 기존 auth quota와 분리한다. 고정 정책은300초당 GLOBAL120/IP30/USER10. 운영량 검증 전 후보 정책임을 명시한다.
- 네트워크 quota 선차감 -> 동일cookie를 read-only verifySession -> 유효 UUID/만료 session의 userId 정규화 -> 사용자quota 차감. IP/user HMAC namespace 분리, IPv4/mapped IPv6 통합. 사용자quota는 사업장/플랫폼/세션별로 나누지 않는다.
- 하나의 bounded deadline/abort latch를 전 단계에 적용한다. network/verify/user의 throw·malformed·timeout·abort는 fail-closed. 늦은 성공이 다음 RPC나 save를 시작하지 못한다. 전체 timeout은 max30000ms. 기존 bounded-auth-rpc를 적절히 재사용하되 외부 verify도 bounded여야 한다.
- credential-request.js의 필수 admit(request,credential,{signal,deadline}) 주입 및 내부 admission으로 options 전달. 미설정이면 SETUP_REQUIRED, save만 주입해도 저장하지 않는다. 기존 cheap checks 및 bounded body 검증 후 admission, 바로 앞 signal/deadline 확인 후 writeStarted. handler 자체도 admission을 bounded wait하여 잘못된 adapter가 hanging하더라도 저장을 시작하지 못한다. quota false ->429 CREDENTIAL_RATE_LIMITED; quota장애 ->503 CREDENTIAL_ADMISSION_UNAVAILABLE. save 시작 후 RESULT_UNKNOWN 동작 유지.
- 별도 lib/tenancy/sql/credential-request-admission.sql 후보: moaon_control.credential_request_limits(scope,key_hash,started_at,used); security invoker/빈search_path의 public.moaon_consume_credential_network(p_ip_hash), public.moaon_consume_credential_user(p_user_hash). caller quota/clock 입력 금지. GLOBAL->IP 행잠금, 잠금 후 DB wallclock, backward clock reset금지, fixed cap에서포화. IP거부도GLOBAL차감 유지. 거부/저장실패는 quota를 돌려주지 않는다.
- moaon_control_app에 이 table의 필요한 SELECT/INSERT/UPDATE 및 RLS/정확한함수EXECUTE만. PUBLIC/anon/authenticated 접근금지, DELETE/TRUNCATE/schemaCREATE/BYPASSRLS/SECURITYDEFINER 추가금지. 기존 역할 후보를 LOGIN에 재실행하지 않는다. 보존기간 정리 및 실제 운영 정책 설정은 활성화 전 필수 조건으로 명시한다.
- TDD: 실제 SQL 합산 상한/윈도/차감 의미와 malformed/late completion/abort/no-adapter/writeunknown을 검증한다. 실제 Request->admission->암호화store 격리 경로도 검증한다.

## Task 2: 격리 실DB·회귀·실행 앱 확인

- D 임시 PostgreSQL 실제 제한 로그인에서 두 개 이상의 DB 연결/handler가 같은 quota를 합산하는지 확인한다. SQL권한 거부도 실제검증. 기존native harness의 생성DB/역할만 cleanup하는 보호규칙과 준비time300s/race별도deadline을 재사용한다.
- 관련 테스트와 전체 회귀, 독립 검토를 완료한다. C디스크 추가캐시를 만들지 않는다.
- 설치된0.51.2 앱을 직접 열어 오늘·주문·설정 등의 조회/표시 상태를 확인한다. 로그인은 사용자영역이고 실주문발급/출고/설정변경은 수행하지 않는다. UI결과를 이번 서버 후보기능 활성화로 주장하지 않는다.
- 마스터/보고서 갱신 후 커밋·푸시. 사용자 요청의 매단계 실제앱검증 규칙을 프로젝트 지침에 기록한다.

사용자 후속 지시: 마우스·포커스를 점유하는 원격 UI 조작을 중단하고 기존 Electron 백그라운드 자동화 방식으로 검증한다. 설치 EXE와 격리 설치패키지 검증을 구분한다.
