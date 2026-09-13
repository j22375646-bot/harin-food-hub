# P4-160B 공개시장 AI 실행 보고

키워드·상품 시장조사에 Gemini 공개 검색 추이 해석을 추가했다. 웹 1.63.0 / 앱 0.145.0 배포·설치·공개 업데이트 검증 완료. 실제 제공자 호출은 기본 OFF이며 무료 프로젝트·키·데이터 처리 조건을 확인하기 전 활성화하지 않는다.

## 구현

- 시장조사 결과 아래에 검색 관심 추이 설명·시즌 기획 참고점 두 버튼을 제공한다. 사용자 클릭 때만 서버가 공개 자료를 다시 조회한다.
- 검색어는 Naver 조회와 화면 표시에서만 사용한다. Gemini와 저장 기록에는 검색어 원문, 수동 비교 상품, 메모, 내부 주문·고객·매출, 자유 질문을 전달하지 않는다.
- Gemini 입력은 서버에서 재조회한 공개 날짜·상대지수와 검증된 계산값뿐이다. 공개 추이 응답은 64KB, Gemini 입력은 24KB, 응답은 128KB로 제한한다.
- 모델의 숫자는 서버 metric 참조로 치환한다. 근거 없는 지표·판매량·매출 추론·실행 주장·HTML·URL은 거부한다. 자료 누락을 0으로 바꾸지 않고 STALE/BLOCKED는 생성 전에 중단한다.
- 같은 근거·동작·모델의 검증된 해석을 7일 재사용한다. 사업장 하루 20회, 프로젝트 하루 20회, 사업장 동시 1회 제한을 DB 잠금으로 적용한다. 타임아웃·실패도 예약을 환불하지 않으며 영구 중복 표식을 보존한다.
- 결과 7일, 요청 기록 90일 정리. 운영 cron은 매시 23분 등록했다. 기존 내부 보고서 AI 저장소·정리 작업은 보존했다.
- 조회 변경·취소·연결 해제 시 이전 결과와 늦은 응답을 폐기한다. OFF 상태에서도 원래 시장조사·비교 상품·메모는 유지한다.

## 실제 AI 활성화 조건

고정 모델 gemini-2.5-flash-lite, 서버 GEMINI_API_KEY, GEMINI_FREE_PROJECT_ID, 무료 tier 확인, 데이터 처리 정책 확인, 30일 이내 프로젝트 확인 시각, MOAON_MARKET_AI_ENABLED=true가 모두 필요하다. 설정 플래그는 계정 확인 기록이며 실제 무료 청구를 보증하거나 Google의 결제 상태를 조회하는 기능이 아니다. 유료 grounding·자동 재시도·유료 모델 fallback은 없다.

현재 실제 Gemini 계정 호출, 품질·실청구 검증은 미실행이다. 격리 fixture의 생성 성공과 실제 운영 제공자 연결 성공을 구분한다. 최근 30/90일 상대지수만 있으므로 전년 대비 반복 계절성은 판단 보류이며 시즌 참고점은 추가 확인할 가설이다.

## 검증·배포 증거

| 범위 | 결과 | 증거·한계 |
|---|---|---|
| 서버 전체 | 2990/2990 PASS | node --test --test-concurrency=4 test/*.test.js, p4160b-server-final.log |
| Desktop 단위 | 445/445 PASS | p4160b-desktop-tests.log |
| 소스·설치 UI | PASS | p4160b-source-ui.log / p4160b-installed-ui.log. 실제 앱 preload·IPC, 격리 fixture |
| 기존 CLOVA 소스·설치 회귀 | PASS | p4160b-clova-source-regression.log / p4160b-clova-installed-regression.log |
| 공개 업데이트 | PASS | 0.144.0 모의 버전에서 실제 0.145.0 다운로드·Ed25519 검증. 최신 CURRENT 두 번. p4160b-live-update.log / p4160b-current-update.log. installer 실행은 하지 않음 |
| 설치 payload | 112개 파일 일치 | p4160b-package-verification.log |
| 웹 빌드·배포 | PASS / READY | p4160b-build.log / p4160b-deploy.log. login 200·market-ai 비로그인 401, 버전 1.63.0 |

로그 기준 경로: D:/GPT/tmp. 신규 운영 환경 목록에 Gemini 키·활성화 설정 없음 확인(p4160b-env-names.log). 따라서 실제 생성 OFF.

설치파일: desktop/dist/distribution-20260914-032904-870/Moaon-0.145.0-Setup.exe, 114196836 bytes. SHA-256 DAC2E8138E71A541BEE0894E083CB0035373BA975AC70569382DB027C91C6880. Ed25519 서명을 사용하며 Microsoft Authenticode 인증서는 아니다.

- 운영 DB: migration 20260913182828_moaon_p4_160b_public_market_ai. B 3테이블 RLS·anon/auth 거부·service 권한, B 3RPC 권한 확인. 초기 0행. 기존 A 함수와 cron 보존. D:/GPT/tmp/p4160b-db-verification.json.
- cron 등록·활성 상태는 확인했지만 예약 실행 이력은 아직 관찰하지 않았다.
- 소스 UI: 실제 moaon:// preload/IPC 및 격리 응답. 700/1040/1440px 라이트·다크, 오른쪽 보조 화면 비활성 창. 실주문·실제 제공자 호출 없음.

초기 기본 병렬 실행에서 기존 15ms 인증 deadline 시험의 호출 횟수 기대가 실패했다. 단독 9/9 및 최종 전체 재검증에서 통과했으며 인증 구현은 변경하지 않았다. 중간 재검증의 변경 이력 버전 표기 실패는 기존 대괄호 버전 형식으로 수정했다. 최종 전체에는 두 보완 시험 파일도 포함됐다.

바탕화면·시작 메뉴·고정 작업표시줄 바로가기를 0.145.0 경로로 갱신했고 바탕화면 TargetPath를 직접 확인했다. 이전 0.144.0 폴더는 보존했다.

## 계획 대비

Task 8의 기존 단일 시험 파일 대신 snapshot/contract/provider/service/storage/request/desktop 시험으로 분리했다. 계정 확인이 필요하므로 실제 Gemini 활성화를 완료 범위에서 제외한다. CLOVA 내부 보고서와 Gemini 공개시장 경로는 독립적이다.

[구현 계획](./2026-09-14-moaon-p4-160-analysis-ai-implementation.md) · [마스터 계획](./2026-09-07-multi-business-desktop-master-plan.md)
