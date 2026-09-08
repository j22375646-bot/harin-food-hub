# P1-04-17 실제 로컬 인증 공급자 연결 검증

Spec: 2026-09-07-multi-business-desktop-master-plan.md P1 및 기존 step-up provider 계약.

## Global Constraints

- 기존 운영 로그인/UI/API/클라우드 DB는 변경하지 않는다. 새 유료 자원 없음.
- 기존 createSupabaseStepUpProvider를 수정하지 않고 실제 GoTrue v2.189.0과 설치된 SDK로 검증한다.
- 가상 example.invalid 계정만 사용. 토큰/비밀번호/TOTP secret을 로그나 저장소에 남기지 않는다.
- 로컬 HTTPS 인증서를 요청별로 신뢰한다. 전역 TLS 검증 해제/OS 신뢰 저장소 변경 금지.
- 로컬 HS256 모드 검증이며 클라우드 JWKS, 실제 Hub 로그인 화면/쿠키/DB fence 연결 완료로 표시하지 않는다.

### Task 1: 재실행 가능한 실제 provider 시험 도구

Files: scripts/auth-lab/verify-step-up.cjs, 필요시 scripts/auth-lab의 작은 helper, test/tenant-auth-lab-harness.test.js.

1. 고정 localhost 전용 서버 https://127.0.0.1:54443/auth/v1 -> http://127.0.0.1:54323 연결을 사용하는 실행형 시험 도구를 작성한다. 실제 TLS gateway를 시험 중에만 실행하고 finally에서 종료한다. 인증 응답을 위조/변경하지 않는다.
2. MOAON_AUTH_LAB_RUN=1 명시 opt-in, MOAON_AUTH_LAB_CERT / MOAON_AUTH_LAB_KEY 파일 경로를 요구한다. 운영 env를 읽거나 목적지를 임의로 설정하지 않는다. 인증서는 외부 local lab에 있다. HTTPS 호출은 인증서 검증을 유지하며 지정 CA만 사용한다. upstream도 localhost 고정이고 redirect 금지.
3. 실제 가상 signup/login/enroll/첫 TOTP 검증으로 verified factor를 만든다. 이후 기존 Hub provider.verifyTotp를 실제 SDK와 network transport로 호출한다. 최초 factor 등록과 재인증은 다른 TOTP timestep을 사용해 replay 정책과 혼동하지 않는다. 대기는 최대 31초 이내.
4. 최소 성공 evidence(user/factor/provider session 동일, method=mfa, 만료/동결), 잘못된 코드 거절, 변조 토큰 거절, 다른 userId 거절, 명시 logout 후 refresh 거절 검증. 비밀정보 없는 검사명/숫자만 출력하며 실패 시 비밀 원문 없이 nonzero 종료.
5. 네트워크 요청 method/path/status만 기록해서 SDK의 실제 요청 및 refresh 미사용을 확인할 수 있게 한다. 저장 토큰 원문은 기록하지 않는다.
6. 헬퍼가 있다면 TOTP 공식 벡터와 opt-in/목적지 제한 등 단위 검사를 먼저 작성하여 실패 확인 후 구현한다. 일반 pnpm test에서 실제 로컬 서비스나 계정생성이 일어나지 않도록 분리한다.
7. 자체 검토 및 focused tests 수행, commit. 실제 통합 실행/전체 suite와 결과 보고는 controller가 실행한다.

## 완료 보고

개발번호, 실제 통과/실패 검사, 운영 영향 없음, 현재 단계의 한계, 다음 P1 저장/폐기 연결 검증과 P2 격리 선행 조건을 설명한다. 로컬 전용 변경에는 앱 버전을 올리지 않는다.
