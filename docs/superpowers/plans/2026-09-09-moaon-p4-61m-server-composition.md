# P4-61M — API 키 저장 서버 composition과 HTTP 경계

기준 c834817. D:\GPT\moaon 전용 브랜치, 새 캐시/로그/시험 데이터 D. 사용자 승인: 다음 개발, 자동 검증 및 기존 개발 브랜치 커밋/푸시. 마우스/포커스를 점유하는 원격 UI 조작 금지.

## Task 1: 서버 composition 및 route

기존 createCredentialSaveRequest + createCredentialRequestAdmission + createCredentialStore + createCredentialSessionFence + createDashboardIdentityVerifier를 실제 서버 composition으로 연결한다. 새 credential-save-runtime.js와 POST /api/moaon/credentials route를 추가한다. Next 로컬 route guide를 읽는다.

- 서버 설정은 명시적인 MOAON_CREDENTIAL_SAVE_ENABLED=1, HTTPS 고정 origin, 별도의 자격증명 keyring/activeKeyId와 admission HMAC, vercel-direct ingress를 요구한다. 기본 비활성/누락은 SETUP_REQUIRED. 부분/잘못된 설정은 고정 sanitized503. 사용 중 기존 설정 명명 규칙을 먼저 확인하며 새 설정명은 문서화한다. 웹 공개 env/일반 DATABASE_URL/관리자 RPC로 fallback 금지.
- 제한 제어 DB는 createConfiguredControlDatabase만 기본으로 사용한다. Admission RPC를 이 DB에서 정확히 두 public 함수로 parameterized SELECT하여 {data:boolean,error:null}로 연결한다. 동적 임의 SQL/RPC 이름 허용 금지. 각 quota 요청은 별도 완료된 트랜잭션이어서 거부/저장 실패 때 차감이 유지된다.
- createDashboardIdentityVerifier의 read-only touch:false 경로를 admission 및 store에 공통으로 사용한다. store에 실제 mandatory sessionFence와 cipher 주입. 요청 단위 cookie/options.signal/options.deadline 보존.
- ingress는 실제 VERCEL=1/VERCEL_ENV=production와 vercel-direct를 확인하고 Vercel 전용 IP 단일값/forwarded 단일값 일치, optional realip 일치 검증을 기존 vercel-auth-request-admission 계약대로 사용한다. 임의 일반 proxy 헤더를 신뢰하지 않는다. 신뢰 설정/환경 검증 전 연결/키 저장 없음.
- cheap request/body 검증은 기존 처리기에서 DB 준비 전 수행. lazy 초기화 singleflight, 실패 시 pool close/retry, close idempotency, close/초기화 race와 late completion에서 저장 금지. 처리기 전체 maxConcurrent 유지 (매 요청마다 handler 생성하여 우회하지 않는다). 초기화/identity/quota는 bounded admission 내부에서 수행, parent absolute deadline 및 abort 체크를 다음 외부 단계에 전달.
- route는 nodejs이며 오직 composition.handle을 전달한다. 기본 비활성 import 시 연결 없음. 운영 환경변수/SQL/역할 변경이나 배포는 이 단계에서 수행하지 않는다. 운영 retention/HMAC rotation/권한 점검 및 앱 연결은 활성화 게이트로 명시한다.
- TDD: disabled/malformed config/no side effects; lazy singleflight/close+failure cleanup; exact RPC transport; identity/samecookie/sessionfence/cipher composition; successsafe metadata; quota denial; expired/abort/timeout no later save; bounded concurrency; origin/bodyinvalid noDB; actual Request path with existing encrypted store using isolated DB where practical. Sanitized errors no secrets.

## Task 2: 자동 검증 및 완료

- 기존 Electron 자동화에 숨김 격리 실행 옵션을 추가해 화면/프로필 격리를 지속적으로 재사용한다. 설치 앱의 개인 로그인/파일을 복사하지 않고 현재 설치 app.asar와 개발 Electron 사용 사실을 정확히 표시한다. BrowserWindow는 최초 생성부터 show/focus를 억제하고 창 isVisible/isFocused=false 검사. 사용자 작업 창 조작 금지. 실행기 오류는 GUI popup 대신 stderr/비정상 종료. 서버 전용 변경이므로 앱 설치 버전은 유지한다.
- 관련 시험, 전체402+추가 파일 정확 대조(느린 persistence2개 별도), 독립 검토. route 도입에 맞는 로컬 검증 수행, 빌드가 생기면 D output만 사용. 최종 보고/마스터 갱신, 커밋/푸시.
