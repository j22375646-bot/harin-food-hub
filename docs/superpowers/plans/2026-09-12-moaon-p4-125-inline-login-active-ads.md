# P4-125 · 앱 내부 로그인과 활성 광고 작업 화면 (0.111.0)

## 적용 범위

- 앱 시작 시 세션 확인 후 같은 창의 WebContentsView에서 기존 서버 로그인 폼을 표시한다. 팝업 BrowserWindow를 만들지 않는다. 48px 창 제어 영역을 보존하고 크기 변경에 맞춘다. 비밀번호 입력·검증·세션 발급은 기존 서버 폼이 담당하며 앱 renderer/IPC로 비밀번호를 전달하지 않는다.
- 캠페인, 광고그룹, 등록 키워드의 저장 상태가 ELIGIBLE이고 user_lock=false인 대상만 사용한다. 상위 캠페인이 중지되거나 상태 조회가 실패하면 그 하위 자료를 노출하지 않는다. 현재 상태 기준 필터이므로 중지 캠페인의 과거 성과도 화면 합계에서 제외함을 명시한다.
- 키워드 페이지에 캠페인 필터, 상세 입찰 작업 영역, 현재가 조회·변경안·사용자 확인·반영 결과 조회를 추가했다. 캠페인 상세에는 해당 캠페인에 귀속된 전환 발생 등록 키워드를 표시한다. 최대 200개 전환 상위 자료와 별도 집계 기간을 명시한다.
- 직접 입찰은 등록 키워드에 한정한다. 웹허브의 DIRECT_LOWER_ONLY 정책을 재사용해 근거가 부족한 증액, 자동입찰/그룹가 사용, 중지 광고, 오래되거나 달라진 현재가를 막는다. 10원 단위·최소가·감액 범위·7일 변경 제한·서버 쓰기 스위치를 유지한다.
- 사업장 OWNER 재확인, 요청 소유자 확인, 기존 financial_change_requests/audit, 멱등 키, 승인/실행/재조회 검증을 사용한다. 응답 불명확 시 자동 재실행하지 않고 요청 상태 조회로 안내한다. 실제 네이버 입찰 변경은 이번 개발 검증에서 실행하지 않았다.

## 현재 계정의 제한과 후속 작업

- 실제 DB 확인: 활성 SHOPPING 캠페인 4개, 활성 그룹 23개, 활성 등록 키워드 0개. 검색어는 1,059개 중 비용 상위 200개를 연결했다. 투영 응답 85,802bytes.
- 따라서 **현재 운영 중인 쇼핑광고의 검색어를 이 기능으로 개별 입찰할 수 있는 상태는 아니다.** 쇼핑 상품/그룹 입찰은 아직 미지원이다. 별도 대상 모델·변경 이력·확인·재조회 절차를 구현해야 한다. 등록 키워드의 감액 기능을 쇼핑 입찰 완료로 표시하지 않는다.
- 현재 저장된 실제 검색어 원천에는 전환 필드가 없으며 활성 등록 키워드 전환 행도 0개다. 전환 키워드 상세 UI는 구현·가상 자료 검증했지만 실제 전환 키워드가 보인다고 주장하지 않는다. 캠페인 전환을 키워드에 임의 배분하지 않는다.
- 금융 근거 연결에 따른 증액과 쇼핑 상품/그룹 운영, 키워드 전환 원천 추가 확보가 후속 범위다. 쓰기 스위치나 광고 설정을 임의 변경하지 않았다.

## 검증

- 서버 전체 2,822개 PASS. 이후 OWNER/변경된 membership 차단 시험 1개 추가; 관련 입찰 11개 PASS.
- 앱 기존 369개 PASS + 신규 3개(요청 허용 범위, 응답 계약/취소, 로그인 view 정리) PASS.
- Next.js 로컬 webpack build PASS. 운영 Vercel Turbopack build READY: `harin-cafe24-sync-iqk12vuqf-j22375646-6156s-projects.vercel.app`, `dpl_2nL3NNMNnpVdt9X7yEkNviL56ueo` → 운영 alias.
- 운영 신규 endpoint의 무인증 GET/POST 401 확인. 실제 사용자 인증을 우회하거나 비밀번호를 입력하지 않았다.
- 패키지 코드 격리 Electron 3개 PASS: 로그인 한 창·원래 native form POST·세션 갱신·크기 조절, 키워드 필터/검색/감액 확인/모의 실행/결과/로그아웃/테마/너비, 분석 차트/캠페인/전환 키워드/오류/로그아웃/테마/너비.
- 실제 운영 서버 공개 로그인 GET 화면을 같은 패키지로 읽어 입력 높이 56px, 부모 영역 중앙 정렬, 가로 넘침 없음, Node/IPC 미노출 확인. 실제 로그인 POST는 하지 않았다.
- 이번 PC에서 오른쪽 보조 모니터가 감지되지 않았다. 보이는 시험은 RIGHT_DISPLAY_UNAVAILABLE로 중단했고 메인 화면에 대신 띄우지 않았다. 위 화면 시험은 **숨김 격리 시험**이다. 이전 버전의 21개 보이는 전체 화면 시험 결과를 이번 버전에 재사용해 통과했다고 기록하지 않는다.
- 가상 로그인 native-form 시험은 `inline-login-smoke.cjs`로 통합했으며 기존 entry/submit 실행 파일은 이를 호출한다. 공개 로그인 시각 검증은 별도 `inline-login-public-smoke.cjs`다.
- 시험 로그/화면: `D:\GPT\tmp\p4125-*`, `moaon-public-inline-login.png`, `moaon-bid-panel.png`, `moaon-marketing.png`. 숨김 캡처 문제는 Electron capturePage로 확인했다. 최초 중앙 정렬 시험은 viewport와 scrollbar gutter를 혼동했으며 실제 부모 영역 기준 중앙 오차 0px로 검증했다.

## 배포

- 산출물: `desktop/dist/distribution-20260912-025920-815`.
- 설치파일: `Moaon-0.111.0-Setup.exe`, 114,122,250bytes.
- SHA256: `F017FCCA74B52C92FDBC7F452D34A3700F78014FF71F83FBD88E4C1929EAC76A`.
- GitHub `moaon-stable`에 0.111.0 Ed25519 서명 업데이트 게시 완료. Authenticode 유료 인증서는 사용하지 않는다.
- 관리형 설치: `D:\GPT\Apps\Moaon\releases\0.111.0`, 바탕화면 모아온 바로가기 갱신. 실행 중인 사용자 앱을 강제 종료하지 않았다.
- 이전 0.110.0 패키지 런타임의 격리 프로필에서 실제 0.111.0 다운로드·Ed25519 검증 PASS. 이 시험은 설치파일 실행과 사용자 프로필 접근을 하지 않았다.
- 실제 사용자 로그인 완료, 보조 모니터 표시, 사장님 PC 업데이트 재시작과 실입찰은 미검증이다.

참고한 공식 API: https://www.electronjs.org/docs/latest/api/web-contents-view , https://github.com/naver/searchad-apidoc/blob/master/python-sample/examples/ad_management_sample.py .
