# P4-160 분석 AI 실행 보고

기존 네이버 광고 분석에 근거 snapshot, CLOVA 생성 경계, 사업장별 기록·비용 예약과 앱 연결을 추가했다. **160A 코드·시험·운영 DB·웹·설치본·공개 업데이트 검증을 완료했다.** 실제 CLOVA 호출은 계정 조건 미설정으로 비활성 상태이며 검증하지 않았다.

배포 버전은 웹 **1.62.0**, 데스크톱 **0.144.0**이다. [공개 릴리스](https://github.com/j22375646-bot/harin-food-hub/releases/tag/moaon-stable). 이번 작업은 내부 광고 보고서용 160A이며 Gemini 공개시장 160B는 포함하지 않는다.

## 완료한 변경

- 서버가 선택한 네이버 보고서를 다시 읽고 수치·출처·해시를 고정한다. 모델 숫자는 검증된 metric 참조로 치환하며 고객 원본·외부 도구·다른 채널 자료를 전달하지 않는다.
- 자료 `BLOCKED`, 인식 가능한 전화번호·이메일·주민등록번호 질문은 예약·호출 전에 차단한다. 질문 개인정보 차단은 `QUESTION_PRIVACY_BLOCKED`이며 모든 자유문장 개인정보를 완벽 탐지한다는 의미는 아니다.
- Supabase service client의 `from/rpc`로 기록과 예산을 저장한다. 기존 `moaon_control_app` 권한을 넓히지 않았다. 신원·사업장·소유 권한은 서버에서 재확인한다.
- 계정·사업장 누적 예약 상한 30,000원, 사업장 일 50회·동시 1회, requestId·fingerprint 중복 방지를 적용했다. 모르는 비용은 예약액을 유지한다. 2분 이상 남은 예약은 UNKNOWN으로 바꾸되 비용과 fingerprint를 보존하여 다른 요청만 허용한다.
- 결과 90일·비용 원장 180일 정리와 기록 삭제는 누적 사용액을 환불하지 않는다. SQL 신규 예약 중단 시각은 2026-11-30 00:00 KST이다. 연장에는 계정 조건 확인과 별도 검토된 SQL 변경이 필요하다.

## 검증 증거

| 범위 | 결과 | 근거·한계 |
|---|---|---|
| 서버 `pnpm test` | 2,953 / 2,953 PASS | `D:/GPT/tmp/p4160-server-tests.log` |
| 데스크톱 직접 `node --test` | 434 / 434 PASS | `D:/GPT/tmp/p4160-desktop-tests.log`; 설치앱 실행 검증과 별개 |
| 오프라인 가상 평가셋 | 50건 PASS | 계약·자료 경계 검증이며 실제 제공자 응답 품질 평가가 아님 |
| 격리 DB | PASS | 동시 예약, 공유 상한, replay, UNKNOWN 비용 보존, tenant 읽기·삭제, 권한, 보관 정리, 만료·stale 예약 시험 포함 |
| 운영 DB migration | 적용 완료 | 프로젝트 `llnlphdmcmwgjnpndaam`, `moaon_analysis_ai_budgets_and_runs` |
| 운영 DB 권한 | 확인 완료 | anon/authenticated SELECT=false, service_role SELECT=true, anon RPC=false. service_role 읽기 count=0 성공 |
| 운영 보관 정리 | 등록·활성 확인 | `moaon-ai-insight-retention`, 매시 17분, `select public.moaon_ai_cleanup()`; 정리 실행 이력은 별도 후속 확인 |
| 웹 빌드·운영 | PASS / READY | 로컬 webpack 빌드 성공. 운영 `/login` 200, AI API 비로그인 401, 두 응답 버전 1.62.0 |
| 실제 소스·설치 앱 UI | PASS | `moaon://` 실제 preload·IPC, 격리 session fixture. 명시 생성, 근거 패널, 질문 초기화, OFF에서 원래 보고서 유지. 700/1040/1440px 라이트·다크 넘침 없음 |
| 설치 payload | PASS | 설치 ASAR 108개 파일 소스 일치. `D:/GPT/tmp/p4160-package-verification.log` |
| 공개 업데이트 | PASS | 0.143.2 모의 시작 버전에서 실제 0.144.0 다운로드·Ed25519 검증. installer 실행은 하지 않음. 최신 버전 CURRENT 두 번 확인 |
| 바로가기 | 확인 완료 | 바탕화면·시작 메뉴·고정 작업표시줄을 새 설치 경로로 갱신. 바탕화면 TargetPath 직접 읽기 확인 |

운영 대상은 기존 P4-06/P4-10 기록, 하린식품 고정 UUID의 활성 사업장·소유자, 기존·최근 migration 연속성으로 대조했다. 새 테이블은 UUID 사업장 FK를 사용하며 requester는 검증된 서버 사용자 식별 문자열이다.

## 실제 호출 조건과 미검증 범위

신규 Vercel 환경 조회에서 URL·service key는 Sensitive로 가려져 있고 CLOVA/Gemini 키와 활성화 플래그는 없다. 현재 실제 AI는 OFF이며, 설정 조회를 실제 공급자 연결 성공으로 해석하지 않는다.

CLOVA 활성화에는 서버 API 키·계정 ID, 허용 모델 HCX-007, 확인된 입력·출력 단가와 pricingVersion, 자료 처리 조건 동의, 유효한 크레딧 만료 시각 및 활성화 설정이 모두 필요하다. 요청 최대 비용을 입력·출력 한도에서 먼저 예약한다. 자동 유료 fallback이나 GPT/Claude 신규 호출은 없다. 무료 크레딧 잔액을 실시간 확인했다고 주장하지 않는다.

- 설치 경로: `D:/GPT/Apps/Moaon/releases/0.144.0/resources/app.asar`.
- 패키지: `desktop/dist/distribution-20260914-031222-057/Moaon-0.144.0-Setup.exe`, 114,193,836 bytes.
- 설치파일 SHA-256: `FD5BE148AC29E6F5C4B8BC64257F626FB677F1D718765A33D93BCC6567E4F5D2`.
- Ed25519 서명 검증이며 Microsoft Authenticode 인증서를 취득했다는 뜻은 아니다. 기존 키를 유지했다.
- 설치 앱 검증: `D:/GPT/tmp/p4160-installed-ai.log`, 공개 다운로드·최신 확인: `p4160-live-update.log`, `p4160-current-update.log`.
- 운영 서버의 실제 로그인 사용자 AI 생성 요청과 제공자 품질 시험은 하지 않았다. 운영 DB service-role 읽기, 비로그인 차단, 격리 인증/IPC 시험과 구분한다.
- 실제 계정 CLOVA 품질·요금 정산 검증: 미실행, 설정 조건 충족 후 별도 확인.

## 계획과의 차이·후속 작업

Electron IPC는 작업별 세 명령 대신 action을 검증하는 한 명령으로 통합했다. GET은 개별 기록 endpoint 대신 개수 제한된 최신 목록을 반환한다. 공개 시장 자료용 Gemini **P4-160B는 별도 후속 단계**이며 이번 완료 범위에 포함하지 않는다.

질문 영역은 분석 카드 내부에서 펼치되 보고서 상세 패널과 동시에 열리지 않는다. 기존 보고서 목록·계산 결과와 섞지 않고 선택한 저장 자료의 기간을 표시한다. 기록 조회 중 생성 버튼을 잠가 IPC 경합을 방지한다.

장애 시 `MOAON_ANALYSIS_AI_ENABLED`를 비활성화하여 새 유료 생성을 중단한다. 기존 보고서·계산·채널 자료와 비용 원장은 보존하며 롤백을 이유로 예산을 초기화하거나 테이블을 삭제하지 않는다. 필요한 서버 설정 이름은 `.env.example`에 추가했으며 실제 키·단가를 임의 등록하지 않았다.
