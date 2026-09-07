# P1-04-11-1 추가 인증 공급자 연결

P1-04-11은 공급자 검증과 허브 증거 저장/폐기의 두 경계로 나눈다. 이번 단위는 실제 설치된 Supabase SDK의 TOTP challenge/verify 호출과 결과 검증이다. 실제 운영 계정 실증, 등록 UI, 허브 세션과의 영속 결합은 완료라고 주장하지 않는다.

## 범위와 선택

- 기존 로그인·비밀번호·UI·업무 API·환경 설정·SQL은 변경하지 않는다. 새 공개 route, 운영 계정/인증 설정/메일/유료 자원, 운영 데이터 복사 금지.
- 기존 @supabase/supabase-js2.55.0/auth-js2.71.1를 사용한다. SDK 자체를 mock하지 않고 HTTP transport만 합성한다. 새 의존성 설치 없음.
- TOTP만 지원한다. SMS, factor 등록/삭제, 비밀번호 로그인, global/local signout은 호출하지 않는다. 가입 UI와 플랫폼 연결보다 안전한 계정 경계를 먼저 완성한다.
- 후보 반환값은 공급자 증거이며 기존 verifyStepUp의 허브 세션 증거와 다르다. providerSessionId를 dashboard sessionId로 바꾸거나 같은 것으로 취급하지 않는다.

## 인터페이스

`createSupabaseStepUpProvider({url,publishableKey,fetch,timeoutMs=10000,now=Date.now})` -> frozen `{verifyTotp}`. 서버 전용; 구성 exact own keys, getters 한 번 복사. url은 canonical HTTPS origin(경로/검색/fragment/자격증명 없음). key는 비어 있지 않은 trim된 문자열 최대4096. fetch는 필수 함수, now는 생략 시 Date.now이며 명시하면 함수여야 한다. timeoutMs 정수1..30000. 브라우저에서 생성/호출 거부.

`verifyTotp({userId,accessToken,refreshToken,factorId,code})`: exact own keys, UUID1..8 정규화, token은 비어 있지 않은 trim 문자열 최대16384, code는 6자리 ASCII 문자열. 잘못된 입력은 TypeError이며 네트워크0회. 클라이언트가 이 함수를 직접 호출하는 공개 경로는 없다. userId는 후속 서버 orchestration에서 검증된 신원만 주입해야 한다.

성공은 frozen `{evidence,session}`. evidence exact `{userId,providerSessionId,factorId,method:'mfa',verifiedAt,expiresAt}`; UTC millisecond ISO. session exact `{accessToken,refreshToken}`이며 검증 성공으로 갱신된 공급자 자격증명을 서버에만 반환한다. 반환값 전체는 브라우저 응답/로그에 넣지 않는다. 영속 저장 연결 전 사용하지 않는다.

오류는 `StepUpProviderError`만 공개하며 `STEP_UP_REJECTED`/status403 또는 `STEP_UP_UNAVAILABLE`/status503과 고정 메시지. 네트워크/SDK 임의 예외·provider 원문·token/code를 오류에 싣지 않는다. 명확한 Auth401/403, 유효하지 않은 인증번호/인증수단422는403, 나머지 HTTP/형식/timeout 오류는503. 모듈 내부 정책 불일치(다른 사용자/세션/인증수단·aal1·오래된/future증거)는403. malformed provider claims/응답은503; 잘못된 서명은403.

## 한 번의 흐름

1. 입력 복사/검증 후 요청별 SDK client 생성(autoRefreshToken/persistSession/detectSessionInUrl:false). 한 번의 전체 deadline+AbortController. now는 유한 primitive number만; 시작보다 과거 또는 deadline 도달 시503.
2. 원본 accessToken을 `auth.getClaims(accessToken)`으로 검증한다. 단순 decode나 getAuthenticatorAssuranceLevel을 인증 근거로 쓰지 않는다. iss=`url+'/auth/v1'`, aud/role=`authenticated`, sub=userId, session_id UUID, is_anonymous=false, iat/exp 정수초이며 iat<=현재, exp>iat, exp*1000>현재+90000. nbf가 있으면 정수이며 미래가 아니어야 한다. exp에 대한 SDK 자체 시계 검사도 그대로 둔다.
3. `auth.setSession({access_token,refresh_token})` 사용. setSession이 묵시적으로 refresh를 시도할 수 있으므로 모든 refresh token HTTP 요청을 transport에서 차단한다. 결과의 user와 이후 fresh `getUser(accessToken)`에서 확인된 user는 같은 userId, 정상 확인된 이메일, is_anonymous=false, 삭제/ban 아님. 선택 factorId가 factors에 정확히 하나 있고 factor_type='totp', status='verified'여야 한다. 이메일과 factor를 서버 응답으로 확인한다; user_metadata는 권한에 쓰지 않는다.
4. `auth.mfa.challenge({factorId})` 한 번. response.id UUID, type='totp', expires_at 정수초로 아직 미래인지 확인. 외부 challengeId를 입력받지 않는다. 이어서 `auth.mfa.verify({factorId,challengeId,code})` 한 번. 각 호출/실제 HTTP 직전 전체 deadline·원본 accessToken 잔여90초를 다시 확인한다. 취소/timeout 이후 미발송 호출0회, retry없음.
5. 반환된 access/refresh token을 검증하고 새 accessToken에 대해 getClaims 및 fresh getUser를 다시 수행한다. sub/provider session_id는 원본과 동일, 이메일/선택factor도 동일·verified. aal='aal2', amr 배열에 최근 totp timestamp(정수초)가 있어야 한다. 선택한 totp timestamp는 challenge 시작 floor(seconds) 이상, 현재 이하, 현재기준5분 미만. JWT exp/iat/iss/aud/role/anonymous 조건을 다시 적용한다. 응답의 body.user만 믿지 않는다.
6. verifiedAt은 검증된 totp timestamp, expiresAt=min(verifiedAt+300000,새JWT exp*1000). 완료 직전 시간/유효성을 다시 확인하고 최소공급자증거+새session만 반환한다. 기존 인증의 유효시간을 refresh receipt 시각으로 연장하지 않는다.

## Transport 경계

실제 주입된 fetch 앞에서 현재 deadline과 허용 endpoint를 동기 검사하고 이어서 호출한다. configured origin의 `/auth/v1/user`(GET), `/auth/v1/.well-known/jwks.json`(GET), 이번 factor의 `/challenge`와 `/verify`(POST)만 허용. redirect='error', 전체 abort signal 사용. token refresh/factor enroll/delete/logout 등 다른 요청은 실제 fetch0회. 동일 요청 단위에만 SDK state를 유지해 동시 사용자 간 token이 섞이지 않게 한다. 응답이 늦으면 결과를 승인하지 않고 후속 호출하지 않는다. 이미 보낸 verification은 원격에서 완료됐을 수 있어 불명확 실패를 자동 재시도/로그아웃으로 복구하지 않는다. SDK timer는 finally 정리하되 사용자의 공급자 session을 폐기하지 않는다.

## 검증

실제 SDK + 합성 fetch + Node crypto ES256 서명/JWKS fixture. 올바른 서명 성공/변조 서명0 write, iss/sub/session/role/anonymous 오류, 미확인 이메일/다른factor/미인증factor/phone 거부, challenge 만료·잘못된id, wrong OTP, aal1·누락/과거/future totp, 반환 user/session 교체, HTTP429/503·응답형식 오류, timeout/late response/clockrollback, 묵시적 refresh차단, 동시두사용자격리, 입력extra/symbol/getter/6자리code, 비밀값오류비노출 검증. 기존 repo 전체검사/build를 별도 실행한다. 네트워크는 합성으로 제한되며 실제 MFA가 성공했다는 증거는 아니다.

## 다음 단위

P1-04-11-2: 갱신된 provider session의 안전한 서버 저장과 현재 허브 세션에 묶인 증거의 DB 발급/조회/폐기. provider 인증 결과와 허브 권한 사이의 race/replay/revocation 시험. 이후 승인된 실제 계정으로 등록·인증 실증을 수행한 뒤 제한 공개한다.

공식 확인(2026-09-08): https://supabase.com/docs/guides/auth/auth-mfa/totp , https://supabase.com/docs/guides/auth/jwt-fields . changelog 검토 완료. 로컬 SDK getClaims는 비대칭 서명을 검증하고 legacy symmetric token은 getUser로 서버 검증한다. SDK setSession과 MFA verify의 세션 저장 부작용을 확인했다.
