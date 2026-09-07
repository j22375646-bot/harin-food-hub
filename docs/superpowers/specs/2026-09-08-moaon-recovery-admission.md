# P1-04-10 운영자 추가 인증·분산 요청 제한

기존 비활성 recovery-review-request의 다음 보안 경계다. 실제 MFA 등록/챌린지 화면·공급자 연결은 활성화 조건이며 이번 코드만으로 MFA 실사용 완료를 주장하지 않는다. 기존 쿠키의 OWNER/로그인 여부를 추가 인증 증거로 재사용하지 않는다.

## 고정 범위

- 운영 로그인·비밀번호·UI·업무 API·환경 설정과 기존 SQL은 변경하지 않는다. 새 공개 route, 운영 migration/계정/메일/유료 자원, 운영 자료 복사 금지.
- 후보 SQL은 lib/tenancy/sql에만 추가한다. 기존 로컬 PGlite/PostgreSQL의 합성 자료로 검증한다.
- 요청 취소/시간 초과 이후 미발송 RPC를 시작하지 않는다. 이미 발송한 RPC의 원자적 취소나 quota 반환은 보장하지 않으며 재시도하지 않는다.

## 1. 서버 추가 인증 증거

createRecoveryReviewRequestHandler의 필수 factory option에 verifyStepUp 함수를 추가한다. 없으면 생성 시 거부한다. 기존 HTTP body/cookie shape는 그대로이며 클라이언트가 proof나 운영자 번호를 전달할 수 없다.

서버가 verifySession으로 신원을 확인한 뒤 verifyStepUp(Object.freeze({userId,sessionId}))를 호출한다. 이는 서버 측에서 보관·확인한 추가 인증 증거를 조회하는 신뢰 dependency다. 반환값은 정확히 {userId,sessionId,method:'mfa',verifiedAt,expiresAt}. UUID1..8, canonical UTC millisecond ISO, 원시값을 각각 한 번만 읽어 복사·동결한다. 추가/심볼 필드와 잘못된 타입은503. null/false/undefined, 다른 사용자·세션, method가 문자열이지만 mfa 아님, 미래 verifiedAt, 만료 또는 5분 이상 지난 증거는403 STEP_UP_REQUIRED. method 비문자열/잘못된 시각 형식은503. expiresAt>verifiedAt이며 expiresAt-verifiedAt<=300000ms이어야 한다(잘못된 증거503). 실제 유효 종료는 proof expiry·verifiedAt+300000·최초/재확인 세션 expiry의 최솟값이며 현재시각은 유한한 primitive number만 허용한다.

proof의 유효성은 조회 직후와 실제 각 RPC 발송 직전 모두 확인한다. clock·signal·deadline 검사는 동기 checkpoint와 실제 bound RPC 호출 사이 await/microtask가 없어야 한다. verification dependency도 호출 직전 deadline을 검사한다.

추가 인증이 실패하면 admission/inspect/resolve RPC는0회. dependency 자체 장애/임의 code/status 오류는 기존 sanitized503. 새 내부 helper로 분리 가능하되 범용 validation framework를 만들지 않는다.

## 2. DB 분산 제한

새 후보 public.moaon_consume_recovery_review(p_operator_id uuid,p_session_id uuid,p_mode text) returns boolean, SECURITY INVOKER, search_path='', public/anon/authenticated EXECUTE 거부, service_role만 허용한다. 기존 authorize_recovery_operator 호출로 활성 허용 운영자+READ COMMITTED를 검증한다. 현재 dashboard_sessions의 id/user_id/revoked_at/expires_at도 검사한다. 세션은 FOR SHARE로 잠그고 quota를 기다린 뒤 DB 현재 시각으로 만료를 다시 확인한다. 다른 세션/폐기/만료/미허용 운영자는 예외로 거부하며 quota 변화 없음.

moaon_auth.recovery_request_limits: scope GLOBAL/OPERATOR, subject_id uuid, mode inspect/resolve, started_at timestamptz, used integer. PK(scope,subject_id,mode), GLOBAL의 subject_id는00000000-0000-0000-0000-000000000000 고정, OPERATOR는 실운영자 UUID. RLS 켜고 public/anon/authenticated 권한 없음; service_role select/insert/update만. 브라우저/IP 원문/이메일/토큰 저장 없음.

정책은 DB 내부 고정값, 클라이언트 시간/한도 입력 없음: 60초 창에 운영자별 inspect30/resolve10, 서비스 전체 inspect300/resolve100. 항상 GLOBAL→OPERATOR row 순서로 insert-on-conflict/row lock. 잠금을 얻은 후 clock_timestamp로 창을 계산한다. 둘 다 여유가 있을 때만 두 카운터를 함께 증가한다. 한쪽 제한/미래 started_at이면 false, 허용된 한쪽도 used를 증가하지 않는다. 새0행 삽입은 허용되지만 최대 행 수는 운영자 수에 비례한다. 창 만료는 기존 행을 재사용하므로 별도 정리 스케줄러 불필요. 일반 로그인 rate limiter와 섞지 않는다.

createRecoveryReviewAdmission({rpcClient,timeoutMs=10000}) -> async ({operatorId,sessionId,mode}) => frozen {allowed:boolean}. exact keys/UUID normalize/mode validate, 기존 bounded-auth-rpc 사용, boolean 응답만 수용, 모든 transport/provider 문제 sanitized RecoveryReviewAdmissionError code RECOVERY_REVIEW_UNAVAILABLE/status503. 서버 생성·호출 전용, 단일 RPC/no retry.

## 3. 기존 handler 연결 순서

HTTP guards/body → verifySession → verifyStepUp → proof validation → admission (요청별 checkpoint RPC wrapper 사용) → allowed false면429 RECOVERY_REVIEW_RATE_LIMITED, Retry-After:60 → verifySession 다시 확인 → 동일 id/userId/email/emailVerified 및 유효 세션 확인 → proof 재확인 → 기존 resolver inspect/resolve.

재확인에서 세션이 없거나 같은 세션/계정/이메일이 아니면401 AUTH_REQUIRED; malformed dependency503. 최초 만료시각을 늘려 사용하지 않는다. 실제 모든 admission/resolution dispatch에는 동기 deadline+proof/session-expiry checkpoint. Admission 실패·timeout·abort·proof 만료·재확인 실패 후 resolve0회. 이미 승인 카운터를 소비한 다음 실패해도 quota 환불·자동 재시도 없음. 기존401/403/503 등 응답과 no-store/nosniff/Vary:Cookie를 유지하며 새 에러도 같은 방식으로 정제한다.

Admission과 resolution은 별도 트랜잭션이다. 최종 확인 이후 이미 dispatch된 작업에 대한 세션 폐기 원자성은 여전히 활성화 gate이며 이 단계에서 해결했다고 주장하지 않는다. Pre-auth flood/WAF, 실제 MFA 공급자 증거 저장·폐기, Auth/메일, DB 권한/마이그레이션 검증, 사업장 격리 완료 전에 공개하지 않는다.

## 검증

기존 request unit/integration을 새 필수 dependency/실제 admission SQL에 맞추되 기존 실패 검사를 지우거나 완화하지 않는다. 합성 signedcookie→기존 identity→합성 step-up authority→실제 admission→실제 resolverSQL 검증. 부정 proof별로 DB 처리0회, gate중세션폐기·시간초과·증거만료·microtask취소, rate한도와 독립운영자/global공유, rollback/noquota부분소비, authstate불변 포함.

Native PostgreSQL은 기존 opt-in loopback55437 격리 harness를 재사용한다. 별도 두 connection의 마지막한도 경쟁에서 한 건만 true, GLOBAL 공유경쟁, 만료리셋, 미인가/폐기세션 거부와 카운터변화없음을 실제 query로 확인한다. 자료는 합성이며 이 단계가 실제 MFA/운영DB 검증을 대신하지 않는다.

공식 근거: https://supabase.com/docs/guides/auth/auth-mfa (추가 인증 등록·검증·권한 적용의 분리). 변경일2026-09-08, changelog 검토 완료, SDK/버전 변경 없음.
