# P1-04-11-2 추가 인증 증거 저장·세션 결합

승인된 후속 개발. 새 저장소와 서버 조합을 만들되 기존 로그인·비밀번호·UI·업무 API·운영 SQL·환경 설정은 바꾸지 않는다. 공개 route/실계정 MFA/메일/유료 자원/운영 자료 복사 금지. 기존 Node crypto, pg, PGlite, Supabase SDK 사용; 설치 없음. 후보 SQL은 lib/tenancy/sql 아래에 두고 운영 migration으로 자동 적용하지 않는다.

## 책임과 신뢰 경계

기존 createSupabaseStepUpProvider의 verifyTotp 결과를 현재 허브 세션에 묶는다. 공급자 session_id와 허브 sessionId는 별개다. 서비스는 검증된 서버 호출 전용이며 클라이언트가 userId/세션ID/증거를 직접 보내는 route를 만들지 않는다. 저장 서비스의 issue만 provider 결과를 받으며, DB commit RPC는 service_role 전용이다. 공개 서명만으로 로그인 유효성을 판단하지 않는다.

모든 신규 API는 exact own keys, symbol/배열/추가·누락 필드 거부, getter 한 번 snapshot, primitive string/number 엄격 검사, 원문 예외 비노출. UUID는1~8 소문자 정규화; tokenHash는 소문자64hex; UTC는 millisecond ISO 왕복일치. token은 trim nonempty 최대16384. 브라우저 생성/호출 금지. 잘못된 호출 입력은 고정 TypeError·I/O0. 외부 실패는 StepUpStorageError의 STEP_UP_REQUIRED(status403) 또는 STEP_UP_UNAVAILABLE(status503) 고정 메시지, cause/원문/토큰 없음.

## DB 후보

신규 step-up SQL은 기존 dashboard account migration 및 auth-session-fence.sql 이후 반복 설치 가능. private moaon_auth schema/RLS/SECURITY INVOKER/search_path='' 유지. anon/authenticated/PUBLIC 테이블·RPC 권한 없음. service_role만 필요한 새 테이블 DML와 RPC 실행, auth.sessions(id,user_id) 및 auth.mfa_factors(id,user_id,status,factor_type) SELECT만 허용. 이 Auth catalog 계약은 운영 적용 전 재확인한다. Auth 테이블 구조나 데이터는 변경하지 않는다.

두 테이블: step_up_heads(session_id PK FK dashboard_sessions, current_operation_id nullable)와 step_up_attempts(operation_id UUID PK, session_id/user_id FK, account_generation, state PENDING/VERIFIED/REVOKED, started_at, pending_expires_at, provider_session_id/factor_id/verified_at/expires_at nullable, sealed_session jsonb nullable). 완료 메타데이터와 sealed_session은 함께 commit한다. secret 평문/OTP 저장 금지. 폐기 시 ciphertext를 null로 지우고 attempt tombstone은 보존해 operationId 재사용을 막는다.

권한 검사와 잠금 순서는 account_state FOR SHARE → active profile FOR SHARE → dashboard_sessions FOR UPDATE → head/attempt. 앱 잠금 후 auth.sessions와 auth.mfa_factors는 일반 SELECT로 확인한다. PostgreSQL의 FOR SHARE에는 UPDATE 권한도 필요하므로 Auth catalog SELECT-only 계약을 위해 외부 Auth 행 잠금은 하지 않는다. 외부 Auth 삭제와 commit/read의 원자적 직렬화는 보장하지 않는다. 다음 verifyStepUp/loadSession 호출은 원본을 다시 조회하여 삭제를 반영하지만, 이미 반환된 증거를 원격에서 즉각 취소하는 보장은 없다. active profile, account_state 존재/not blocked, session userId 일치/not revoked/not expired 필요. begin/commit/revoke는 tokenHash 일치도 요구한다. 계정 generation은 begin snapshot과 commit/read에서 일치해야 한다. 잠금 획득 후 clock_timestamp로 만료 재검사. 기존 password reset은 account lock/generation/revoked_at을 바꾸므로 늦은 commit/read는 거부한다.

RPC 이름/인수와 반환:
- moaon_begin_step_up(p_user_id,p_session_id,p_token_hash,p_operation_id) → exact {operationId,startedAt,expiresAt}. pending TTL=min(DB now+60초,hub session expiry). 현재 유효 PENDING이 있으면403, 같은 operationId replay도403. 새 begin은 이전 VERIFIED/만료PENDING을 REVOKED 및 cipher null로 바꾸고 새 head를 가리킨다. 새 인증 시작은 기존 추가 인증 증거를 무효화한다.
- moaon_commit_step_up(p_user_id,p_session_id,p_token_hash,p_operation_id,p_provider_session_id,p_factor_id,p_verified_at,p_expires_at,p_sealed_session) → exact proof {userId,sessionId,method:'mfa',verifiedAt,expiresAt}. head/current pending/op/accountgeneration/hub권한 재확인. 공급자 auth.sessions에 같은 user와 session이 존재하고 선택 mfa_factors가 같은 user의 verified totp여야 한다. verifiedAt>=date_trunc('second',attempt.started_at), <=DB now, age<5분; expiry>now and <=verifiedAt+5분. 최종 expiry는 hub expiry와 입력 expiry의 최소. p_sealed_session은 exact {v:1,keyId,iv,ciphertext,tag}, keyId 1~64 ASCII [A-Za-z0-9_-], iv/tag base64url(12/16bytes), ciphertext base64url bounded1..50000chars. commit 동일 op 재호출도 거부, 자동 retry없음.
- moaon_read_step_up(p_user_id,p_session_id,p_include_session boolean) → null 또는 exact {proof,operationId,providerSessionId,factorId,sealedSession}. read는 현재 인증된 서버 identity로만 호출; tokenHash는 호출하지 않는 기존 verifyStepUp({userId,sessionId})와 연결한다. 위 권한/현재head/VERIFIED/generation/시간/공급자세션·factor 검사. 유효하지 않으면 null, 접근 자료나 cipher 반환 없음. include_session=false는 sealedSession:null. true는 암호문만 서버에 반환. proof에는 공급자 ID/토큰 없음.
- moaon_revoke_step_up(p_user_id,p_session_id,p_token_hash) → true. 세션 소유+hash 확인(이미 revoked/expired/계정blocked도 자기자료 폐기는 허용); 같은 순서 lock. 해당 session의 모든 attempt REVOKED/cipher null/head null; 반복 true. 다른사용자/hash 거부. 허브 자체 로그인이나 공급자 Auth session은 변경하지 않는다. revoke와 이미 전송된 commit은 DB lock 순서로 직렬화되며, revoke가 나중이면 cipher 삭제, 먼저이면 늦은 commit 거부.

DB 예외의 정확한 P0001/STEP_UP_REQUIRED만403으로 매핑; 나머지는503. db read null은 서비스 read/verifyStepUp에서403. SQL은 NULL·infinity·invalid envelope·기타 직접 RPC 입력에도 fail closed. DB 장애에서 기존 증거를 성공 기본값으로 반환하지 않는다.

## 서버 조합

createStepUpStorage({rpcClient,provider,encryptionKey,keyId,timeoutMs=10000,now=Date.now}) → frozen {issue,verifyStepUp,loadSession,revoke}. rpcClient.rpc와 provider.verifyTotp 명시적 함수, encryptionKey 소문자64hex(32bytes AES key), keyId 위형식. 키를 env에서 암묵적으로 읽지 않는다; 운영 설정 변경 없음. timeout 1..30000 정수. secret 키/토큰을 반환·로그하지 않는다.

- issue({userId,sessionId,tokenHash,operationId,accessToken,refreshToken,factorId,code}) → frozen proof. 전체 한 deadline에서 begin RPC → 검증된 begin 응답 → provider.verifyTotp 기존 exact입력 → 검증된 공급자 exact결과 → 암호화 → commit RPC → 검증된 proof. 원래 사용자/factor, begin시간, 5분/expiry 확인. 사용자·세션 공급자결과 getter 한 번만 읽는다. 단계 및 실제 RPC dispatch 직전 deadline/now rollback/취소상태 확인; 시간 초과나 실패 뒤 새로운 호출 없음, retry/compensating revoke/signout 없음. 이미 전송된 DB/provider 요청의 원자적 취소는 보장하지 않는다. 모호한 실패의 pending은 TTL 이후 새 operationId로만 다시 시작한다.
- verifyStepUp({userId,sessionId}) → frozen proof, 저장 RPC로 현재 근거 확인 후 정확한 형식/시각/일치 검사. 기존 recovery-review-request의 dependency에 바로 전달 가능한 shape. 아직 운영 handler wiring은 하지 않는다.
- loadSession({userId,sessionId}) → frozen {accessToken,refreshToken}, read include_session=true의 유효한 증거에서만 복호화. 서버 전용이며 5분 proof가 끝나면 읽을 수 없다. 영구 로그인 refresh manager가 아니다.
- revoke({userId,sessionId,tokenHash}) → true, DB literal true만 허용.

AES-256-GCM, crypto.randomBytes(12) fresh IV, tag16, JSON session 두 필드 암호화. AAD는 JSON.stringify(['moaon-step-up-v1',keyId,userId,sessionId,operationId,providerSessionId,factorId]) 순서 고정. envelope exact위형식/base64url canonical. 다른 row/AAD/key/tag/iv/cipher 바꾸면503이며 비밀 비노출. 키 교체시 구키 ring은 이번 범위 밖; 키 불일치는503. 증거·token 저장은 단일 DB commit; DB에 raw access/refresh/OTP/키가 전달되면 테스트 실패.

## 검증 및 한계

합성DB PGlite로 반복설치/권한/실제 RPC/만료/세션폐기/계정generation/factor삭제/공급자세션삭제/이전op재사용/cipher폐기/다른사용자·세션 거부. 실제 설치SDK+기존 ES256 fixture → 새 issue → 실제 SQL 저장 → verifyStepUp/loadSession/revoke 수직 검사. AES변조/AAD교체, malformed/getter/객체 coercion/시간초과·늦은결과·0후속I/O 검사. native PostgreSQL 다중연결에서 동시begin 한쪽만승인, revoke vs blocked commit, password reset vs commit/read 경합을 실제 lock/barrier로 검증(임의 sleep에 의존하지 않음).

Supabase 세션 문서(https://supabase.com/docs/guides/auth/sessions)와 changelog를2026-09-08 확인했다. auth.sessions 존재 확인은 로그아웃 삭제를 잡지만 공급자의 모든 inactivity/single-session 정책을 즉시 대신하지 않는다. 운영 Auth catalog/권한·키 관리/복구·사용자 실제 MFA·모든 로그인/로그아웃 발급경로·HTTP rate limits 검수가 남는다. 이번 후보를 배포했다고 운영 활성화/EXE/다사업장 가입 완료라고 표시하지 않는다. 기능 공개 전 해당 gate를 통과해야 한다.
