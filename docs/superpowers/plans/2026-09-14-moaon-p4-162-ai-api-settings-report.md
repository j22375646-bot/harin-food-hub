# P4-162 AI API 설정 실행 기록

요청에 따라 설정/API에 CLOVA·Gemini·OpenAI 직접 입력과 암호화 저장을 추가했다. CLOVA·Gemini는 필수 정보를 입력하고 저장을 확인하면 자동 활성화한다. OpenAI는 미사용 보관이다. 네이버 분석만 유지하며 160C 다채널 확장은 재개하지 않는다.

## 구현

- 기존 OWNER/session 검증 및 managed-key RPC를 사용하며 AI 암호문 원문 재조회는 API/IPC/SQL 모두 금지한다.
- 이전 앱용 cards 4개를 보존하고 aiCards 3개를 별도로 전달한다.
- CLOVA는 계정 구분 ID, 단가와 크레딧 만료일을 입력한다. HCX-007 공개 공지의 입력 1,250/출력 5,000원 per million을 수정 가능한 참고값으로 제시한다. 실제 청구·크레딧 적용을 보장하지 않는다. 출처: https://www.ncloud-forums.com/topic/537/
- Gemini는 Google Cloud 프로젝트 ID와 무료 프로젝트/공개 자료 정책을 하나의 저장 확인에서 확인한다. 서버 저장 시각으로 30일 확인기간을 적용한다.
- 저장 확인은 암호화된 정책 버전으로 기록한다. 기존 미확인 행은 새 동의로 소급하지 않는다. OpenAI는 요청별 환경이나 내부 override가 있어도 미사용이다.
- 저장 상태 조회는 외부 생성 요청이 아니다. READY는 설정 준비 상태이며 공급자 키 인증 성공과 구분한다. 만료·긴급 중지·저장기능 비활성 원인을 표시한다.
- 인증된 AI 요청만 저장 키를 읽으며 읽은 뒤 세션을 재검증한다. 앱 재시작 없이 키 저장 이벤트로 해당 분석 설정만 새로 조회한다. 이벤트에는 provider만 포함한다.

## 확인한 결과

- 서버 전체 2,997/2,997, 데스크톱 전체 451/451 통과.
- 실제 소스 Electron 설정 화면: 세 AI 저장/실패/충돌/원문삭제/탭이탈/로그아웃, 빈 만료일 차단, 저장 이벤트, 700/1040/1440 라이트·다크 통과.
- 네이버 대화 패널 및 공개시장 AI: 키 변경 후 구성 갱신, 명시적 생성, 근거, 취소, 가상 응답, 반응형 회귀 통과. 오른쪽 보조 모니터, focusable=false, native 입력 없음.
- 독립 정적 검토: 차단 결함 없음. 검토 중 찾은 managed 설정 OFF 상태와 READY 표시 불일치는 수정·회귀시험 완료.
- 운영 migration moaon_managed_ai_keys 적용. provider 제약 7개, RLS true, anon/authenticated RPC 실행권한 false 확인. 기존 COUPANG1/EPOST1/NAVER2 revision 유지, AI 운영키는 아직 없음.
- DB advisor: 서버 전용 테이블의 RLS/no-policy INFO 유지(공개권한 없음). 별도 Auth leaked-password WARN은 이번 변경 범위가 아님.

실제 사용자 AI 키는 입력하지 않았으며 실제 공급자 응답·과금·무료 크레딧 적용은 미검증이다. 사용자가 설정/API에서 입력 후 분석을 실행해야 실제 인증을 확인할 수 있다.

## 배포 검증

- 웹 1.64.0 webpack 빌드 성공, Vercel production READY (dpl_HSKXx5jnXtwHRd1giKjS4qdq4R4E). 최초 CLI 권한 오류 후 명시적 scope로 재시도 성공.
- 운영 /login 200, /api/moaon/connections 및 네이버 AI API 비로그인 401, 모두 x-harin-version=1.64.0.
- 앱 0.147.0 설치본 D:/GPT/Apps/Moaon/releases/0.147.0/resources/app.asar 112개 파일 소스 일치.
- 설치본 실제 격리 Electron 설정/네이버 대화/Gemini 공개추이 세 smoke PASS. 운영 DB나 provider는 fixture로 대체한 UI/IPC 검증이다.
- moaon-stable 공개 배포 완료: https://github.com/j22375646-bot/harin-food-hub/releases/tag/moaon-stable
- 0.146.0 모의 시작버전에서 실제 114,199,926바이트 새 업데이트 다운로드 및 Ed25519 검증 PASS. 최신 CURRENT 두 번 PASS. NSIS 설치·자동재시작은 이번 시험에서 실행하지 않았다.
- 바탕화면·시작메뉴·작업표시줄 바로가기와 current.json을 0.147.0 경로로 갱신. 바탕화면 TargetPath 직접 확인.
- 주요 로그: D:/GPT/tmp/p4162-{server-final,desktop-final,build,deploy-retry,package,installed-keys,installed-chat,installed-market,publish,live-update,current-update}.log.
