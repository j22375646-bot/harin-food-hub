# P4-146 · 정산 그래프·따라오는 패널·연결 재확인 · 0.133.0

- 사용자 요청: 운영 정산 플랫폼별 연결 재점검, 스크롤을 따라오는 상세 패널, 긴 버튼/박스 잘림 수정, 그래프화.
- 정산 페이지의 중첩 overflow를 제거해 main-content가 본문 스크롤을 소유하도록 수정했다. 상세 패널은 본문을 따라 sticky로 이동하며 최대 높이는 창 높이에 맞춘다. 내부 세로 스크롤과 고정 제목을 제공하고, 패널/버튼 width 100%에 border-box·줄바꿈을 적용해 마지막 연결 버튼이 잘리지 않는다. 좁은 창은 상세를 위쪽에 배치하고 전체 높이로 펼친다. 새 상세를 열 때 내부 스크롤은 처음으로 돌아간다.
- 매출/예상 지급/확인된 지급을 선택하는 플랫폼별 공통 눈금 막대 그래프를 추가했다. 같은 눈금에서 비교하며 채널을 누르면 근거 패널을 연다. 확인된 0과 미확인을 구분하고 음수는 숫자/원장 확인으로 표시한다. 매출을 지급액 또는 입금 완료율로 표시하지 않는다.
- 연결 설정 버튼은 설정 이동 후 API 탭을 직접 연다. 지급 근거의 알려진 영문 코드 세 개를 한글 설명으로 바꿨다.

## 운영 연결 확인

2026-09-13 05:33~05:45 KST, 실제 읽기/API 상태 저장만 수행. 키 교체·권한 확대·주문/출고·입찰 변경 없음.

- 쿠팡 상품 조회 CONNECTED, 매출내역 API HTTP 200 / code 200 / 15건 / 다음 페이지 없음 (2026-09-01~12). 네이버 커머스 상품 및 광고 캠페인 CONNECTED. Cafe24 상품 CONNECTED. 우체국 접수국 조회 CONNECTED.
- 처음 수집 서버의 범용 점검 스크립트는 웹 전용 자격정보가 없는 네이버 광고/Cafe24를 실패로 기록했다. 이를 제품 인증 실패로 판단하지 않았고 웹 서버의 기존 verify-managed-web 절차로 다시 실행했다. 최종 moaon_key_checks의 NAVER revision2 및 CAFE24 revision0 모두 CONNECTED를 직접 재조회했다.
- 웹 운영 코드 1.59.0은 기능 변경 없이 기존 연결 점검 빌드 옵션으로 재배포: dpl_3hpjAuyu8BZsg3GSrhXNh1KXqAic READY, 운영 alias 및 HTTP 200/x-harin-version 1.59.0 확인. 로그 D:/GPT/tmp/p4146-web-probe-deploy.log. 사용자 로그인 없이 서버 자격정보로 확인 완료.
- 네이버 정산 원장 43행, 최근 COMMERCE_SYNC/SERVICE/PAYMENT_PERIOD 수집 SUCCESS 확인.
- 쿠팡 매출 원장 51행: UNKNOWN/COUPANG_REVENUE_API 28 + UNKNOWN/LEGACY 23. 비용 원장 116행은 UNKNOWN/LEGACY. 지급 요약16행: UNKNOWN/COUPANG_PAYOUT_API 7 + UNKNOWN/LEGACY 9. 따라서 인증 성공과 별개로 판매자배송/로켓그로스 귀속 근거가 없어 합산 보류가 유지된다. 임의 재분류하지 않았다.
- Cafe24 토큰에 mall.read_salesreport 권한 포함, 만료 전. 실제 /financials/dailysales GET(2026-09-01~12)은 HTTP403 / Invalid API. 재로그인이나 키 교체가 필요하다고 단정하지 않으며, API 제공 범위/클라이언트 승인 확인이 필요하다. 저장 매출통계는0행이며 0원 매출을 뜻하지 않는다. PG 지급 원장(KCP/KG/PAYCO) 연결은 별도 자료·계약 자격정보가 필요하여 이번에 연결 완료라고 표시하지 않았다.

## 검증

- 데스크톱 코드 시험394/394 PASS. 소스 정산: 기간 변경, 지급 일정/상세, 부분/미확인/음수, 캐시·오류·로그아웃·동작 감소 PASS.
- 추가 회귀: 동일 눈금0%/100%, 미확인 막대 제외, 그래프 지표 변경/상세 열기, 본문 스크롤 후 sticky 위치, 긴 API 버튼의 패널 내부 포함·자동 높이·줄바꿈, API 탭 직접 이동 PASS.
- 전체 44화면(11페이지×2테마×1040/1440px)+설정24상태 소스 PASS. 버튼의 43.99993896484375px 브라우저 소수점 결과 때문에 발생한 검사 실패는 높이를 0.01px 정밀도로 반올림해 비교하도록 보정했다. 실제 44px 규격은 유지한다.
- 합성 자료의 가시 격리 Electron 시험이며 실제 사용자 세션의 UI 조작과 구분한다. 설치본 검증/공개 서명 배포는 아래 후속 결과에 기록한다.
- 설치 패키지: desktop/dist/distribution-20260913-054444-553. 설치 위치 D:/GPT/Apps/Moaon/releases/0.133.0. 114157532 bytes / SHA256 2f94b099e2a1e96f2e868b890841e34741582b1fbcfa50da3949e7d83a63b4f0.

[쿠팡 매출내역 공식 문서](https://developers.coupang.com/ko/api/settlement/sales-detail-query) · [Cafe24 공식 API 문서](https://developers.cafe24.com/docs/ko/api/admin/)

[0.133.0 설치파일](https://github.com/j22375646-bot/harin-food-hub/releases/download/moaon-stable/Moaon-0.133.0-Setup.exe)

- 설치 ASAR 소스93개 대조 PASS, 정산 그래프·패널·긴 버튼·API 탭 이동 회귀 및 전체44화면+설정24상태 PASS (p4146-installed-settlement.log, p4146-installed-audit-final.log).

- 90eaa74 푸시·GitHub moaon-stable 0.133.0 서명 업데이트 게시 완료. 0.132.0으로 인식하는 격리 설치 앱이 공개 설치파일 다운로드·Ed25519 서명 검증 READY PASS (p4146-live-update.log). 실제 설치 프로그램 실행/사용자 앱 강제 종료는 하지 않았다.
