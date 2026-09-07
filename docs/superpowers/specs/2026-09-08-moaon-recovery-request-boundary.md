# P1-04-9 복구 검토 요청 경계

승인된 다음 개발: P1-04-8 resolver를 기존 검증된 로그인 신원과 Web Request/Response로 연결한다. 전역 헤더의 OWNER 표시를 신원으로 신뢰하지 않는다. 이번 단계는 비활성 서버 handler이며 공개 route를 추가하지 않는다.

## 고정 계약

`createRecoveryReviewRequestHandler({verifySession,rpcClient,allowedOrigin,timeoutMs=10000,now=Date.now})` → async `(request: Request) => Response`. 서버에서만 생성·호출. 명시적 dependency만 받고 factory의 추가/심볼 키, 비함수, timeout 정수 1..30000 밖, 정규화되지 않은 origin을 거부한다. allowedOrigin은 HTTPS origin 문자열만 가능(경로·사용자정보·query·fragment 없음, new URL(value).origin===value).

1. 메서드는 POST만(405, Allow: POST). request URL origin과 Origin 헤더 모두 allowedOrigin과 일치해야 한다(403). query/hash/userinfo 거부. Host/Forwarded/x-harin-user-id/x-harin-session-verified/역할 헤더를 인증 근거로 사용하지 않는다. Sec-Fetch-Site가 있으면 same-origin만 허용한다. CORS 허용·redirect·Set-Cookie를 만들지 않는다.
2. Content-Type은 application/json 또는 application/json; charset=utf-8 (대소문자·허용 공백 무관)만(415). Content-Encoding은 없거나 identity만. Content-Length가 있으면 정상 십진수인지 검사하고 4096bytes 초과는413. 실제 stream도4096bytes 제한, 헤더를 믿고 전체 text/json을 무제한 읽지 않는다. UTF-8 fatal decode, 빈/잘못된 JSON/배열/미지정 필드/잘못된 값은400. JSON 중복 키는 JSON.parse의 최종 값 하나를 고정 검증하며 별도 JSON parser는 도입하지 않는다.
3. Cookie 헤더 최대16384bytes. harin_dashboard_session 쿠키가 정확히1개이며 값은 비어 있지 않은 ASCII cookie-octet 최대4096bytes이어야 한다. 중복·인코딩 모호성·따옴표·쉼표·공백/제어문자·세미콜론 혼입은401. percent decoding 없이 원문을 검증기에 전달한다. Authorization 헤더가 있으면401(인증 수단 혼용 금지). 쿠키가 없을 때 proxy의 사용자 표시만으로 인증하지 않는다.
4. body 고정 shape: inspect는 `{mode:'inspect',userId,operationId}`, resolve는 `{mode:'resolve',userId,operationId,resolutionId,expectedVersion,action}`. UUID1..8 문자열, SHA256 lowercase64hex, action은 CONFIRM_COMPLETED/CLOSE_NOT_STARTED. 모든 입력 원시값을 await 전에 고정하고 알 수 없는 키(operatorId 포함)를 거부한다. 문법 오류는 DB 호출 전에400.
5. body를 다 읽은 뒤 verifySession(opaqueCookie)를 매 요청 새로 호출한다. 검증기는 기존 createDashboardIdentityVerifier로 연결하는 신뢰된 서버 dependency다. 정확히 `{id,userId,email,emailVerified,expiresAt}`를 한 번 읽어 복사하고 UUID/정상 이메일/emailVerified===true/정상 canonical UTC ms ISO 만료시각이 현재보다 미래인지 검증한다. 미인증/미확인/만료는401; 잘못된 dependency 응답/일반 장애는503. 실제 DashboardIdentityError AUTH_REQUIRED만401로 매핑하고 일반 오류 code/status를 믿지 않는다. 검증된 userId만 resolver operatorId로 전달한다. createRecoveryReviewResolver를 직접 사용하고 응답 data를 임의 resolver injection으로 대체하지 않는다.
6. 전체 body read→identity→RPC를 하나의 deadline과 request AbortSignal로 제한한다. 단계 전후 취소 상태·남은 시간을 검사한다. timeout/취소 후 늦게 완료된 선행 단계가 다음 RPC를 시작하지 못한다. body reader 취소/해제·timer/listener 정리, 자체 cancel promise 실패도 정제한다. clock이 잘못되면503. RPC 한 번만, 재시도 없음. 이미 발송한 RPC는 timeout/브라우저 중단 후에도 DB에서 완료될 수 있으며 성공/실패를 추측하지 않는다. 같은 resolutionId 재조회/재요청으로 확인해야 한다.
7. 성공200 `{ok:true,data:<기존 resolver의 검증된 결과>}`. 오류 `{ok:false,code}`이며400 INVALID_REQUEST,401 AUTH_REQUIRED,403 SOURCE_REJECTED,405 METHOD_NOT_ALLOWED,413 REQUEST_TOO_LARGE,415 UNSUPPORTED_MEDIA_TYPE,503 RECOVERY_REVIEW_UNAVAILABLE만 사용. 모든 응답 Cache-Control:no-store, Vary:Cookie, X-Content-Type-Options:nosniff, application/json. 쿠키·이메일·비밀값·raw SQL/provider 오류/스택을 응답하거나 로그하지 않는다.

## 권한의 시점과 활성화 조건

세션은 RPC 발송 직전에 검증한다. 그 뒤 폐기된 세션이 이미 발송한 작업을 DB와 원자적으로 취소한다는 보장은 이번 범위가 아니다. SQL은 실행 시 복구 운영자 allowlist와 활성 프로필을 계속 검증한다. 엄격한 세션-DB 원자성, MFA/최근 재인증, 전용 분산 요청 제한, 실제 Auth/메일·proxy/TLS 설정은 운영 활성화 전 검토 조건이다. 테스트 대역의 Auth 응답을 실제 공급자 검증이라고 보고하지 않는다.

## 보존 조건

- 기존 로그인/비밀번호/UI/업무 API/환경설정/SQL은 수정하지 않는다. 신규 공개 route, 자동 migration, 실제 Auth/메일 호출, 운영자 추가, 고객 데이터 복사, 유료 자원 생성 금지.
- 이미 있는 candidate SQL과 identity/resolver를 재사용한다. 실제 서명된 합성 쿠키→기존 validateSession→현재 profile/Auth 확인→새 handler→resolver→PGlite SQL 전체 경로를 테스트한다. 외부 Auth만 합성 응답, DB는 로컬 합성 행만 사용한다.
- timeout은 작업 실패나 DB rollback 증거가 아니며 자동 재발급/재복구하지 않는다.
