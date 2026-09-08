# P5-03 — 저장 주문 페이지 이동과 재연결 안정화

P5-02 handoff의 조회 범위 확대 및 재연결 검증을 실행한다. 권위 기준은 P5-02 인도 범위와 기존 Windows UI 규칙이다. 운영 인증 실조회 대조는 사용자 로그인을 기다리는 별도 검증 조건이며 합성 결과로 대신 완료 처리하지 않는다.

## Global Constraints

- 기존 하린식품 OWNER 호환 조회만. 운영 Next.js/API/auth/DB 수정, 타사업장 가입, 송장 발급/인쇄/수집/다운로드 추가 금지.
- 기존 메모리 session, sandbox, 정확한 Main 창/frame IPC 검증, 비밀정보·수취인정보 미전달, 명시적 sample/live 분리 유지.
- 임의 URL/쿼리/cursor를 renderer에서 받지 않음. 새로운 preload 메서드도 인자 없는 nextPage(), previousPage()만. 페이지 cursor는 Main 내부에만 저장.
- 현재 사용자 인증 검증 없이 실데이터 성공을 주장하지 않음. 실제 앱을 사용 중인 사용자의 창/세션을 임의로 종료하지 않음.

### Task 1: 스냅샷 기반 페이지 조회와 재연결

Owner files: desktop/connection-policy.cjs, hub-connection.cjs, preload.cjs, ui/app.js, ui/index.html, ui/styles.css, test/connection.test.cjs. Parent owns package/version/README, test/connection-smoke.cjs, test/smoke.cjs, reports and packaging. No extra agents.

1. TDD baseline b9d3e47. Fixed first URL remains `https://harin-cafe24-sync.vercel.app/api/orders/page?stage=ACTIVE&platform=ALL`. Main constructs subsequent URL only with `&offset=<nonnegative safe integer multiple of20>&snapshot=<64 lowercase hex>` in that order; offset may be0 for returning to first page. Policy accepts exact canonical fixed URL or exact bounded numeric+snapshot form for Main GET only, rejects duplicates/extra query/arbitrary origin/userinfo/hash, retains remote login restrictions. Build reusable focused URL helper in policy file rather than duplicated parsing. Do not change server.
2. Existing server response includes `{ok,orders,total,offset,nextOffset,snapshot,partial}`. Require offset equal requested, snapshot64hex and equal existing cursor on page navigation, nextOffset null or offset+20 strictly less than total, integer safe bounds, orders <=20, total>=offset+orders.length (allow zero firstpage). Reject malformed inconsistent paging metadata as UNAVAILABLE; no fake zero. Preserve allowlisted DTO and cap; add only offset and hasPrevious to renderer DTO, never snapshot/rawcursor. Unknown amount staysnull.
3. Connection stores latest validated {offset,nextOffset,snapshot} only, not raworders. refresh() resets to firstpage; nextPage()/previousPage() use saved metadata and fetch exactly one page. No automatic background looping/prefetch. Empty cursor or boundary must not fetch; return safe non-ready instruction if invoked outside UI. On any read failure,403/401,409, disconnect, close invalidate cursor. 409 gives SNAPSHOT_CHANGED fixed Korean explanation asking fresh first page. Do not combine pages or show stale rows. Navigation actions dedupe pending operations (no accidental double next). Requests timeout15s, bound5MiB unchanged.
4. Fix earlier stale activeRead risk: disconnect detaches old promise and increments generation, finally cleanup is identity-guarded so late old read cannot clear newer read. Session clear gate still prevents new requests until cleared. Abort-ignoring delayed old result must not block a fresh successful read or replace cursor/data. Login cancel and did-fail-load distinct safe results covered; remote loadfail/disconnect closes child deterministically so blocked close cannot leave orphan login or pending connect. Existing successful root intercept verifies fresh GET as before.
5. UI: use existing secondary button styles to add previous/next and refresh controls in orders workspace. Stable selectors `data-action=hub-nextPage`, `hub-previousPage`, `hub-refresh`. Live state enables bounds; hide page buttons in sample/error/connecting. Display current range e.g. `21–40 / 저장된 활성 주문 45건`, `현재 페이지 검색` scope explicit. Search remains local currentpage; keep existing detail fields/readability. Update first20-only copy throughout live chrome to page-based accurate descriptions. On navigation clear list/detail/search before awaiting, errors remain empty with firstpage refresh/reconnect actions visible; 409 must allow refresh without forcing login. Selection state never spanspages. Preserve sample3, dark/light, min1040, exact hidden override, no other design changes.
6. Cover focused policy/metadata/20+20+5 pages/previous/refresh reset/bounds/409/auth/partial/duplicate navigation/abort late concurrency/cancel/loadfailure tests. Run unit suite20 existing plus new once final; syntaxcheck. Do not launch Electron while user app is open; parent coordinates runtime. Commit owned files only and write ignored detailed task report with red/green evidence.

## Parent delivery

Version0.3.0, synthetic realElectron UI sequence pages1/2/3 and previous, currentpage search/detail clear, 409 recovery,401clear, sample restore; real unauthorized/login isolation only after user app safely closed or isolated test profile/instance. Pack NSIS, source/asar equality, preserve existing0.2 output. Report authenticated production proof separately; no new paid resources. Regression existingweb suite final. Independent task and final review.
