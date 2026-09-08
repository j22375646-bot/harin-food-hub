# P4-53 Task 1 구현 보고

## 결과

- tenant-bound 주문 GET에 주문번호/상품/채널 검색, 한국 날짜 기준 기간, snapshot 조건 결합, `searchContractVersion: 1`을 추가했다.
- 동일 endpoint의 `format=xlsx`가 조회와 같은 판매자배송 후보 함수를 사용한다. 0건, 5,000건 초과, 부분 채널 실패를 파일 생성 전에 중단한다.
- XLSX 열은 주문번호/상품/채널/상태/수량/금액/주문일/송장번호로 제한했다. 알 수 없는 금액은 빈 셀이고 수식 시작 문자는 문자열로 이스케이프한다.
- Electron 고정 URL, 검색 bridge, 인증 세션 binary 읽기, MIME/계약 버전/건수/10MB/ZIP 서명 검증, native 저장 취소와 `wx` 안전 저장을 연결했다. renderer에는 bytes/path가 반환되지 않는다.
- 기존 앱 스타일 안에 접이식 전체 검색·기간 폼을 추가했다. 현재 페이지 검색과 분리되고 제출 시 한 번만 조회한다.

## TDD

- RED: `node --test test/order-search-export.test.js` — 최초 2 pass / 1 fail (tenant guard fixture credential 형식 오류 확인 후 수정).
- RED regression: `cd desktop; node --test test/connection.test.cjs test/order-freshness.test.cjs` — 초기 17 pass / 70 fail. 기존 2-key 필터 호환과 metadata optional legacy read 문제를 확인했다.
- GREEN: `node --test test/order-search-export.test.js` — 3/3 pass.
- GREEN: `cd desktop; node --test test/order-search-contract.test.cjs test/order-freshness.test.cjs` — 9/9 pass.
- GREEN: `node --test test/phase28-orders-cs-adapters.test.js test/workspace-orders-request.test.js` — 13/13 pass.
- GREEN: `pnpm build` — Next.js 16.3.0 production build 성공.

## 변경 파일

- `app/api/orders/page/route.js`
- `lib/ui/phase28-adapters/orders.js`
- `lib/tenancy/workspace-orders-request.js`
- `desktop/connection-policy.cjs`
- `desktop/hub-connection.cjs`
- `desktop/main.cjs`
- `desktop/preload.cjs`
- `desktop/ui/index.html`
- `desktop/ui/app.js`
- `desktop/ui/styles.css`
- `test/order-search-export.test.js`
- `desktop/test/order-search-contract.test.cjs`
- 이 보고서

## 자체 검토와 우려

- 실제 외부 쓰기/송장/인쇄는 실행하지 않았다. XLSX 저장은 fixture/unit 경계와 build까지만 검증했다.
- 기존 `desktop/test/connection.test.cjs`의 공개 method exact-list 및 예전 URL 문자열 기대는 새 bridge/검색 query를 모르는 테스트라 전체 실행 시 갱신이 필요하다. 기능 회귀 테스트인 freshness는 모두 통과했다.
- 실제 운영 데이터 내용은 보고서에 기록하지 않았다. 설치본 읽기 전용 UI/XLSX 취소 acceptance와 운영 배포는 컨트롤러 범위다.
