# P4-158 · 키워드·상품 시장조사

## 변경

- 키워드 페이지에 독립된 ‘키워드·상품 시장조사’ 탭을 추가했다. 기존 광고 키워드·쇼핑광고 입찰 관리 기능을 유지한다.
- 한 키워드를 조회하면 네이버 검색광고 keywordstool의 월간 PC/모바일 검색량과 최대 50개 연관 키워드, API HUB 통합검색 상대 추이를 30/90일로 조회한다. 연관 키워드는 같은 화면에서 다시 조회한다.
- 네이버 공식 쇼핑 검색의 최대 40개 상품과 전체 검색 결과 수, 가격 확인 표본의 중간 가격을 표시한다. 순서는 관련도/가격/최신순. 개인화된 화면 순위, 시장 전체 평균, 경쟁사 판매량·실매출로 표현하지 않는다.
- 쇼핑 검색은 API HUB에 포함되지 않아 `NAVER_SHOPPING_CLIENT_ID`, `NAVER_SHOPPING_CLIENT_SECRET`이 별도로 있을 때만 호출한다. 키 발급/변경은 수행하지 않는다. 없으면 ‘조회 준비 필요’를 표시한다.
- 상품을 최대 6개 비교하고 직접 상품명/판매처/가격을 입력할 수 있다. 조사 메모와 복사 가능한 조사 요약을 제공한다. 작업 내용은 현재 창에서만 유지하며 연결 해제 시 비운다. 다른 페이지로 행동을 넘기거나 주문/광고/상품을 변경하지 않는다.
- 기존 인증된 요청 경로에 RESEARCH 읽기 동작을 추가했다. 원래의 Harin 소유자·세션·멤버십 재검사와 main-process POST 허가를 유지한다. 입력은 엄격한 4개 필드, 응답은 128KiB와 필드별 투영으로 제한한다. 기존 입찰 응답은 16KiB 유지.
- 값 없음, API 실패, 실제 0, 검색량 10 미만을 구분한다. 가격 0은 미확인으로 표시한다. 플랫폼 오류 본문이나 비밀키를 UI에 보내지 않는다.

## 검증

- 서버 전체 2,851개 PASS. 변경 범위·입찰 권한/동작 추가 검증 19개 PASS.
- 실제 IPC와 반환 계약을 경유하는 가시 격리 Electron UI PASS: 탭 왕복, 연관어 재조회, 비교·중복 방지·직접 입력·요약, 실패/부분 자료, 로그아웃 초기화, 밝음/다크 700·1040·1440. 테스트 자료를 사용하며 실주문/광고 수정 없음.
- 환경 파일을 이용한 실 API 검증은 완료되지 않았다. Vercel 내려받기 값은 마스킹되어 자격증명으로 사용할 수 없었다. 기존 로컬 설정도 필요한 키가 없어 SETUP_REQUIRED였다. 이를 실 API 연결 성공으로 기록하지 않는다.
- 기본 Turbopack 빌드는 저장소 외부 node_modules 연결 제한으로 실패. Webpack 빌드 및 운영 빌드 결과는 아래 배포 기록에 추가한다.
- 로그: `D:/GPT/tmp/p4158-*.log`, UI 캡처 `p4158-research-light.png`, `p4158-research-dark.png`.

## 공식 자료

- https://naver.github.io/searchad-apidoc/
- https://api.ncloud-docs.com/docs/naver-api-hub-overview
- https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md

## 배포 기록

- 앱 전체 417/417 PASS. 최종 연구 규칙 8개 PASS.
- Webpack 로컬 빌드 및 Vercel 운영 빌드 PASS. 운영 /login 200, x-harin-version 1.61.0, 비로그인 RESEARCH 요청 401 확인.
- 설치 위치 `D:/GPT/Apps/Moaon/releases/0.143.0/resources/app.asar` 104개 소스 대조 PASS. 해당 ASAR 가시 격리 UI PASS.
- 패키지 `desktop/dist/distribution-20260914-014022-457/Moaon-0.143.0-Setup.exe`, 114186197 bytes, SHA256 `0E4A15327FD2DC2AB78DABC28C963D7BE851F6D6481E32E0312695865660BB98`, Ed25519 서명 완료.
- 공개 업데이트 배포와 판다랭크 설치는 후속 검증 후 기록한다.

[전체 계획](./2026-09-07-multi-business-desktop-master-plan.md)
