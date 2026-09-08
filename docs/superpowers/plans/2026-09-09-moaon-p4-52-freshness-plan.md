# P4-52 주문 변경 감지·안전한 새 목록

기준6a64043 / 0.36.0. 승인된 주문 기능 대조의 후속 단계.

## Global Constraints

기존 서버/DB/API/IP 유지, backend 변경·새 서비스·비용 없음. 자동 수집/배송추적/발급/등록 POST 추가 금지. 실제 운영 쓰기·물리 인쇄 시험 금지, 개인정보 로그/스크린샷 금지. 현재 채널/필터/권한/선택최대20/발급·등록·문서 guard 보존. 샘플과 실데이터 명확히 구분. 모르는 상태를 최신 또는0으로 표시하지 않는다.

### Task 1: 읽기전용 변경 확인과 상태 UI

기존 app/api/orders/page/route.js와 lib/ui/phase28-adapters/orders.js buildOrderPage를 읽기전용으로 대조한다. snapshot에는 캘린더 eventRevision이 포함돼 있으므로 별도 calendar legacy endpoint 권한을 추가하지 않는다. 새 checkOrderFreshness() 무인자 trusted IPC/preload/Main method. 기존 현재 scope/channel/filters/offset/snapshot URL에 GET만 호출. snapshot409는 CHANGED,200은 strict projectOrdersPayload 검증 뒤 현재 메모리 주문과 실제 내용이 일치하는지 비교. snapshot에서 빠질 수 있는 상품·옵션·수량·receiver·gifts 변경도 기존 Main fingerprint/문서투영으로 포착. 결과는 metadata status/check time only, 개인정보·snapshot token 외부 노출 없음. 조회가 현재 loadedOrders/pageCursor/fingerprints/선택/문서 상태를 갱신하거나 비우면 안 된다. 실패/partial/timeout은 UNAVAILABLE 또는 명시적 확인필요,401/403은 인증확인필요로 표시하며 기존 실제쓰기 guard를 약화하지 않는다.

Main: 단일 in-flight 동시호출 공유 또는BUSY, 최대1회/60초 실제조회(오류도포함). 테스트에는 injected clock 사용 가능. timeout과 읽기본문 모두 bounded; 응답이 abort무시해도정리. 캡처한 generation/cursor identity/filter/context가 바뀌거나 logout이면 늦은 결과폐기. registration/automatic/reviewShipment/collection/tracking/findOrder/activeRead/disconnect/login/cleanup 중 SKIPPED/BUSY, 외부작업을 중단시키지 않는다. 로드된 snapshot없으면 조회0회. 정상 데이터응답 뒤 background probe 결과를 일반 목록조회 결과로 apply하지 않는다. generic freshness logic이 필요하면 작은 standalone 모듈1개까지 허용, package포함은 메인에게 보고.

Renderer: 주문 페이지가 보이고 로그인된 live 상태일 때만1분 주기로 check. hidden/minimized visibility나 다른페이지에서는 네트워크0회; 복귀해도Main60초 rate cap 존중. 1개타이머만 유지, logout/reset/routechange 늦은결과 버림, 프로덕션 테스트 전용모드 추가 금지. 실제 수집 POST는절대자동호출하지않음. 변경감지는 자동, 목록교체는 '새 목록 보기' 명시클릭으로만 한다. CHANGED를 받으면 선택/상세 그대로 유지하고 '주문 또는 사은품 기준이 변경됐어요' 안내. 버튼은 '선택 해제 후 새 목록 보기'처럼 선택초기화를 명시, 기존 runHubAction(refresh)로 현재채널/필터첫페이지 재조회. 작업중버튼 잠금/handler 진입guard, 한 번 클릭 중복방지. 새 조회가성공해야changed해제, 실패시변경/확인필요를 유지. 단순 render/동일응답으로changed가잘못해제되지않도록함.

UI: 기존 앱 Pretendard/라벤더/슬림 작업실 유지. 목록 도구영역 인접한 compact freshness row: 상태점+짧은문구+마지막확인시각+필요할때만새목록버튼. 항상 초단위 카운트다운/큰 배너/레이아웃점프 없음. dark/light색대비, keyboardfocus, aria-live polite(반복 정상알림난발없음), reduced-motion, 스크롤바숨김 유지. 최소1040x720에서목록/선택도구/상세패널과겹침없음. 기능을숨기지않고안내와버튼만필요시드러낸다.

TDD 및 실제 Electron smoke(--isolated --packaged): no snapshot noGET;200same CURRENT;409CHANGED;내용변경CHANGED;partial/badjson/401/403/timeout 확인필요; throttling/concurrent no repeatedGET; pendinglogout/채널/필터/context 변경 late discard;busy POST작업중noGET;probe가loaded page/selected/detail/문서검증을훼손하지않음. 가짜clock으로cadence실행,renderer실제flow에mocknetwork만 적용하여changed선택유지·명시reload·실패상태·busy·hidden/다른페이지 noGET·필터유지·light/dark/minwidth 검증. 기존209회귀. 변경 파일목록 및 신규모듈보고. main-owned package/version/installedtests/docs 수정금지. subagents/commit/push/실APIwrites금지. task report에 실제RED/GREEN 명령결과와범위·우려명시.

### Task 2: 검토·설치·기록

메인이 독립 검토, 전체시험·패키지·0.37.0 설치본 읽기전용 감지/로그인/UI 검증. 전체계획/상세보고 업데이트하고 명시변경만commit/push. 실제새이벤트/새주문을 만들지 않아 live변경양성은합성시험으로구분. 다음단계는 전체검색/내보내기 차이 및 출고용장비 실제인수 계획 유지.
