# P4-12 사업장 목록 운영 연결

## 실제 DB 등록

기존 public.dashboard_users의 계정이 정확히 1개이며 owner/OWNER/활성 상태이고, auth.users의 동일 UUID 계정과 이메일이 일치함을 확인했다. 이메일 인증 완료·익명 아님·삭제 아님·현재 차단 없음도 확인했다. 사용자 이메일이나 인증 비밀값은 보고서에 넣지 않는다.

위 조건을 DB 트랜잭션 안에서 다시 검사하고, 제어 테이블에 기존 사업장 또는 회원이 있으면 전체 실패하도록 잠근 뒤 하린식품 ACTIVE 사업장과 기존 사용자 ACTIVE OWNER 회원(version 1)을 함께 등록했다. 생성한 사업장 UUID는 DB가 발급했다. 등록 후 사업장/회원/기존 프로필 JOIN 조회로 하린식품·owner·OWNER·ACTIVE를 확인했다. 이 초기 등록은 재실행 시 기존 행을 덮어쓰지 않는다.

이것은 모아온의 사업장 소속 등록이다. 기존 주문·정산·채널 API 자료를 복사/이동/삭제하지 않았다. 다른 사업자 계정을 만들거나 권한을 부여하지 않았다. 새 과금 자원은 생성하지 않았다.

## 범위와 제한

이번 API는 기존 OWNER-only proxy를 유지한다. OPERATOR/VIEWER의 운영 진입, 새 사업자 가입, 사업장별 주문·정산 데이터 격리는 아직 개방하지 않는다. 사업장 명부 등록만으로 기존 업무 자료 전체가 다사업장으로 분리됐다고 보지 않는다.

Vercel Production Sensitive 변수는 `env run`으로 다운로드되지 않는 것을 확인했다. passwordPresent=false, caPresent=false였다. 값을 다시 노출하거나 덜 안전한 형태로 바꾸지 않았다. 운영 함수 안의 실제 인증된 조회는 로그인 후 확인해야 한다.

## 코드·검증·배포

사업장 목록 route를 실제 서버 composition에 연결했다. 요청의 로그인 쿠키 형식·출처·쿼리 검사를 통과한 경우에만 전용 DB와 기존 인증 클라이언트를 준비한다. 성공한 연결 객체는 재사용하지만 사용자별 목록은 캐시하지 않는다. 설정 없음은 SETUP_REQUIRED, 설정 오류는 내부 정보가 없는 BUSINESS_LIST_UNAVAILABLE로 구분한다. 초기화 실패 시 부분 생성한 연결을 닫고 다음 요청에서 다시 준비한다.

읽기 전용 연결 점검 스크립트 scripts/check-moaon-control-connection.js를 추가했다. MOAON_CONTROL_DB_DIAGNOSTIC=1 명시 시에만 제한 역할과 허용된 테이블 건수를 조회한다. 로그인 사용자 자료나 비밀값은 출력하지 않는다.

집중 테스트 24개 통과, Next.js 16.3.0 운영 빌드 성공. 별도 코드 검토에서 사양·품질 모두 PASS. 기존 전체 테스트에서 회복 요청 테스트 1개가 고정된 세션 만료시각 때문에 401로 조기 종료하는 문제를 재현했다. 해당 테스트만 현재 시각 기준 유효 세션으로 수정했고, 대상 38개 통과했다. 실제 인증 로직은 변경하지 않았다.

전체 재검증 `pnpm test`: 2,587개 통과, 실패/스킵 0개. 로컬 운영 빌드와 Vercel 운영 빌드 모두 성공했다. 코드와 테스트 수정의 독립 검토는 최종 PASS다.

첫 웹 배포에서 desktop/dist EXE 산출물과 desktop/node_modules가 포함되어 파일 크기 제한에 걸렸다. .vercelignore에 두 경로를 제외해 해결했다. 앱 설치파일 자체는 삭제/교체하지 않았다.

운영 배포: 2026-09-08 23:34 KST 생성, 코드 기준 713b842, deployment dpl_4YjvzxH8d5WwD4smJQQk9uXr3MPg, READY 및 https://harin-cafe24-sync.vercel.app 별칭 연결 확인.

배포 후 비로그인 API는 401 UNAUTHENTICATED와 no-store를 반환했고 로그인 화면 HTTP 200을 확인했다. 로그인 쿠키가 없는 현재 브라우저에서는 사업장 목록 성공 응답과 Vercel 내부 DB 접속을 아직 확인할 수 없다. 확인용 로그인 창은 열어두었다. 인증을 우회하거나 가짜 사용자 세션을 발급하지 않았다. 따라서 코드·배포는 완료지만 로그인 후 목록 1건 실인수는 남아 있다.

## 다음 단계

### 로그인 진입 오류 후속 수정 (2026-09-08)

사용자가 연 `/api/dashboard/login` GET 요청에서 운영 HTTP 405를 재현했다. POST 전용 경로의 직접 진입 복구 처리가 없었다. GET은 인증을 실행하거나 URL 인자를 전달하지 않고 `/login`으로 303 이동하며 no-store를 반환하도록 수정했다. 비밀번호·POST 인증·세션 정책은 변경하지 않았다.

회귀 시험 실패 확인 후 수정, 로그인 관련 35개 시험 통과, 로컬/운영 빌드 성공. 코드 `443dd1d`, 배포 `dpl_64rYYpKCjj1w8nqJUVcPgw6YrDMM` READY. 운영 별칭에서 303 → `/login` HTTP 200을 확인했다. 이 검증은 GET 진입 복구이며, 앞서 확인 중에 머문 실제 POST 요청의 원인이나 로그인 성공을 증명하지 않는다. 인증된 사업장 목록 인수는 여전히 남아 있다.

1. 실제 로그인 후 /api/moaon/businesses에서 하린식품 OWNER 목록 1건과 오류 없음 확인.
2. 그 결과를 앱의 사업장 선택/표시 화면에 연결하고 빈 목록·만료·지연·재시도를 구분.
3. 기존 OWNER-only 경계는 타 사업자 업무 자료 격리 완료 전까지 유지. 별도 계정이 하린식품 주문/정산을 조회할 수 있도록 임의 개방하지 않음.

[운영 허브](https://harin-cafe24-sync.vercel.app/)

[로그인 후 사업장 목록 확인](https://harin-cafe24-sync.vercel.app/login?next=%2Fapi%2Fmoaon%2Fbusinesses)

[전체 계획](./2026-09-07-multi-business-desktop-master-plan.md)
