# P4-51 주문 조건 조회·기능 대조

기준18524fb / 0.35.0. 사용자 승인: 주문 페이지 먼저 마무리하고 웹 기능을 앱 전용 UI로 이식. 기존 서버/DB/API 사용.

## Global Constraints

추가 서비스·비용·운영 DB 변경 없음. 실제 송장 발급·플랫폼 등록·인쇄 금지, 테스트는 모의 외부 API와 읽기전용 설치본으로 제한. 개인정보 로그/스크린샷 금지. 채널 경계·권한·중복 방지·선택 최대20건·로그인·기존 문서 검증 보존. 기능 없이 UI만 완료 처리하지 않는다.

### Task 1: 서버 기준 지연·사은품 필터와 앱 UI

웹 lib/ui/phase28-adapters/orders.js buildOrderPage와 lib/tenancy/workspace-orders-request.js 및 실제 route parser를 읽기전용으로 대조. 기존 서버가 지원하는 delayOnly/giftOnly 조건을 앱 URL allowlist, Main, preload/trusted IPC, renderer에 연결한다. 추가 backend 변경 금지. 실제 parser와 호환되는 인코딩 사용. 필터는 현재 조회 단계/채널의 전체 주문에 서버에서 적용되고 페이지 이동·새로고침·현재페이지 재확인에서도 유지된다. 자유 검색·정렬·사전확인 분류는 현재 페이지 한정임을 명시한다. 네이버/Cafe24/쿠팡 및 로켓 제외 경계를 보존한다. 필터 on/off는 offset/snapshot/선택/상세를 초기화하고 늦게 끝난 이전 응답·로그아웃 결과를 폐기한다. 실패를 빈 정상 목록으로 처리하지 않는다.

bool 두 개의 엄격한 입력검증(추가필드/문자열/배열 거부), 고정 GET URL 제한을 유지한다. 별도 주입 URL/사업장 입력 없음. 문서·발급·등록의 fresh 검증에서 현재 필터조건 일치가 유지되어야 하며 결과 확인/주문찾기 같은 별도 복구조회는 필터 때문에 기존 대상이 사라지지 않도록 의도 구분. 비동기 작업 busy시 변경 차단. 현재 generation 메커니즘 재사용, 거대 리팩터링 금지.

UI: 기존 Pretendard·슬림 도구줄·라벤더 선택 톤 유지, 추가 필터 안에 '배송 지연만', '사은품 동봉만' 체크 컨트롤 그룹. 그룹에 '전체 조회 조건', 기존 정렬/사전확인은 '현재 페이지' 범위로 구분. 필터 적용 중 요약, 검색·필터 초기화는 서버조건 포함 한 번의 새 조회로 초기화. 최소1040×720에서 겹침 없이 접근, 키보드/focus·busy·스크롤바숨김·reduced motion 보존. 샘플에서는 실제 서버조건과 혼동하지 않도록 비활성 또는 분명히 구분. 명시된 서버 timingBadge와 gift 결과로 판정하며 클라이언트 임의 지연시간 계산 금지.

TDD: 실제 URL parser/allowlist, 유효/잘못된 bool·extra keys, query 지속과 pagination, 필터 변경 snapshot 해제/old response 폐기/logout, 작업중 변경 차단, reset 한 번 조회, 필터 변경 후 selection/detail 초기화와 채널교차, 현페이지 검색 구분을 시험. 실제 Electron UI smoke를 저장소에 추가(--isolated --packaged), 네트워크만 mock, 기존 Main/preload/renderer 그대로. RED 실패 확인 후 최소 구현. 신설 module 필요시 단일 책임 작은 파일 허용하며 패키지 포함 목록 보고. 개발/패키지버전·설치·문서보고는 메인 소유: 수정하지 말 것. subagent 추가/commit/push/실API writes 금지. focused tests + 전체205 baseline 검증 후 지정 report에 명령·RED/GREEN·변경파일·우려 기록.

### Task 2: 기능 대조와 릴리스

메인이 웹 주문 기능과 앱 기능의 코드 경로를 대조해 남은 차이와 실제 검증 여부 표 작성. 구현 독립 검토, 전체시험, 0.36.0 패키지, 설치본 읽기전용 필터·로그인·UI 확인. 전체 개발계획서/보고서 갱신, 명시파일만 commit/push. 프린터·실발급 종단간은 미검증으로 분리한다.
