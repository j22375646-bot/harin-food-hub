# P4-65 — 재고·상품 조회 이식 / 0.54.0

## 구현
- 모아온 재고·상품 메뉴: 상품명/번호 검색, 채널·재고 상태 필터, 상품별 상세, 새로 조회.
- 기존 웹허브의 Cafe24 재고관리·네이버 커머스/광고 구분·품절/저재고/6시간 신선도 규칙을 재사용한다. 상품이 아닌 Cafe24 행사/사은품 제외 규칙도 유지한다.
- 채널 수량을 합산하지 않는다. 쿠팡 판매자배송/로켓그로스를 분리하고 연결 옵션 중 하나라도 수량이 없으면 해당 배송 유형의 수량을 확인 필요로 표시한다. 옵션 중 가장 오래된 시각을 기준으로 갱신 필요를 표시한다.
- 서버의 고정 하린 사업장 OWNER 권한을 조회 전후 검증한다. 권한 버전 변경/실패/취소 시 자료를 폐기한다. Main 전용 일시 GET 허용과 인자 없는 IPC를 추가했다.
- 목록과 상세는 textContent로 표시한다. 조회 실패 시 지난 목록/상세/건수를 비운다. 필터/상세는 추가 서버 요청을 보내지 않는다.
- 기존 색·글자 체계와 42px 입력/버튼 높이를 사용한다. 좁은 창에서는 상세가 목록 아래로 배치된다.

## 조회 범위와 남은 작업
- 현재 활성 마스터 상품을 기준으로 연결된 채널 자료를 조회한다. 재고 수정, 상품 연결 편집, 가격 변경, 발주, 수집 요청은 추가하지 않았다.
- 마스터 원본 201건 이상 또는 하위 조회 집합 1,000건 이상은 불완전 합산을 방지하기 위해 조회 실패 처리한다. 대량 사업장 페이지 조회는 후속 작업이다. 빈 값을 0으로 간주하지 않는다.
- 동일 상품의 같은 채널 연결이 여러 개이면 임의 연결을 택하지 않고 실패한다. 연결 정리/다중 연결 지원은 후속 작업이다.
- 상품 raw_data는 서버 판정에만 사용하고 앱에는 이름·식별자·채널 수량·상태·시각·고정 설명만 전달한다.
- 고객·CS 본문/답변 이력, 상품 연결 상세/가격 정보, 대량 조회 및 로그인 상태의 실데이터 대조가 다음 업무다.

## 검증 증거
- 관련 코드/권한/IPC/통신 110 PASS: D:/GPT/tmp/p465-tests.log.
- 고객·CS 회귀 8 PASS: D:/GPT/tmp/p465-regression.log. 추가 지정한 잘못된 재고 테스트 파일명은 실행되지 않았으므로 아래 정확한 파일명으로 별도 실행했다.
- 기존 재고·Cafe24 판정 15 PASS: unified-inventory-center, cafe24-catalog, cafe24-product-inventory. D:/GPT/tmp/p465-stock-regression.log.
- 실제 서버 로더에 가상 DB 자료 → transport → Main IPC → UI: 소스 창 10 PASS, 패키지 app.asar 창 10 PASS. 검색·채널/품절 필터·상세·추가 요청 없음·실패 초기화·중복 억제·늦은 응답 폐기·오른쪽/비활성 확인.
- 패키지 UI 시험은 개발 Electron 호스트가 완성된 app.asar를 격리 프로필로 로드한 시험이다. 설치된 EXE/로그인 세션/운영 재고 대조 시험으로 표현하지 않는다.
- 화면: D:/GPT/tmp/moaon-inventory-worklist.png. 로그: p465-ui.log, p465-packaged-ui.log.
- 전체 앱/전체 서버 테스트를 이번 턴에 다시 실행한 것은 아니다. 변경 관련 검사 총 133개 PASS.

## 서버 배포
- Vercel 운영 빌드 성공. deployment dpl_4CLVHHu9vGuJfTnCXgZWQSkie4k3, READY / production.
- https://harin-cafe24-sync-l5110zpfw-j22375646-6156s-projects.vercel.app
- 운영 alias https://harin-cafe24-sync.vercel.app 에 새 inventory route 존재. 비로그인 요청 401 UNAUTHENTICATED, private/no-store 확인.
- 로그인된 실제 상품/수량의 일치 여부는 아직 확인하지 않았다. DB/네트워크 화면 검증은 가상 자료다.

## 앱 전달
- D:/GPT/moaon/desktop/dist/p465/win-unpacked/MoaonPreview.exe
- D:/GPT/moaon/desktop/dist/p465/모아온 0.54.0 열기.lnk (--display-right)
- 폴더 빌드 exit 0, app.asar manifest 0.54.0 및 변경 파일 9개가 소스와 바이트 일치.
- app.asar SHA256: d621050a8d23fcb738943315a23bfcf8c0e62848709f508fb0c9cf6d748df3cb
- 실행 중 기존 설치 앱 PID 17676은 유지했다. 새 바로가지는 기존 앱을 닫은 뒤 열어야 새 버전이 실행된다. win-unpacked 폴더 전체를 유지해야 한다.
- 재설치 없이 폴더 실행 가능. 자동 업데이트 feed/서명/실제 버전 간 업데이트 인수는 아직 별도 미완료다.
- 새 소스·스테이징·로그·빌드 출력·검증 프로필은 D:/GPT 아래에 저장했다.
