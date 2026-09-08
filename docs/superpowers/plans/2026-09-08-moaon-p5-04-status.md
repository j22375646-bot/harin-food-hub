# P5-04 — 저장 주문 상태별 조회

사용자가 0.3.1 로그인 연동 확인을 보고했다. 기존 인계의 배송 상태·상세 확대 중 이번 범위는 상태별 목록 조회와 한글 상태 표시다. 서버 buildOrderPage/orderStageIds의 기존 분류를 그대로 사용한다.

## Global Constraints

- Desktop only, no server/Next/auth/DB changes, no external writes/printing/sync, no provider credentials or receiver PII added. Preserve 0.3.1 native login fix, memory-only session, exact sender/frame IPC, network allowlist, 20-item pagination, unknown amount null, sample/live separation.
- Fixed scopes ACTIVE=송장 발급 전, REGISTER=송장 등록 후, IN_TRANSIT=배송중, COMPLETED=완료·취소. Completed is collected stored range, not guaranteed last 30 days or all historical orders. Rocket growth exclusion stays server-owned. Do not infer status from amount or invent delivery evidence.
- Main constructs exact URLs, renderer never supplies URLs/cursors/scope strings. Only no-argument fixed actions. Keep current UI shell, readable text, existing button styles; no broad redesign.

### Task 1: 상태 조회 및 표시

Ownership: desktop/connection-policy.cjs, hub-connection.cjs, preload.cjs, ui/app.js, ui/index.html, ui/styles.css, test/connection.test.cjs, test/connection-smoke.cjs and new test/status-smoke.cjs if useful. Parent owns package/version/README/reports/packaging. Do not spawn subagents. Worktree .worktrees/moaon-foundation branch codex/moaon-p5-04-status.

1. TDD reproduce absent scope support then extend canonical builder with optional scope default ACTIVE. Allow only fixed four scopes in exact URL `https://harin-cafe24-sync.vercel.app/api/orders/page?stage=SCOPE&platform=ALL` and existing canonical offset/snapshot suffix. Existing two-argument buildOrdersPageUrl works unchanged. Reject unsupported scopes, duplicate/extra/reordered params, noncanonical paths, arbitrary origins. GET only Main remains; retain login policy.
2. Add no-argument bridge/controller actions viewActive, viewRegistered, viewInTransit, viewCompleted. Fixed IPC methods never accept supplied scope. Main stores current scope default ACTIVE and attaches trusted scope to successful result DTO (not raw server scope). Refresh remains current scope, previous/next remain same scope. Scope switching resets offset/snapshot and invalidates old in-flight generation/aborts and detaches old operation so delayed old response cannot replace new cursor. Disconnect resets ACTIVE. Failed scope read clears cursor; first-page refresh retries same selected scope. Late responses cannot clear newer active read. No automatic background reads.
3. Add existing-style four buttons in Orders header with data-action hub-viewActive/hub-viewRegistered/hub-viewInTransit/hub-viewCompleted. Hide in sample/disconnected, allow live/error except auth? no reads bypass auth. Disable during connecting. aria-pressed reflects selected scope, not successful old scope. Scope action clears old list/search/detail immediately. Refresh/next/previous preserve chosen scope. Scope info in range/title/nav/detail describes selected stored scope rather than always active; completed description explicitly includes cancellation and only collected data. Search stays current page.
4. Replace raw stage labels in live rows/detail/search with deterministic Korean mapping PAID 결제완료, PREPARING 준비중, READY_TO_SHIP 출고대기, WAITING_FOR_CARRIER 배송대기중, SHIPPING 배송중, DELIVERED 배송완료, CANCELLED 취소. Unknown -> 상태 확인 필요 (raw value may remain searchable but not mistaken for known status). No receiver fields. Use existing styling; no colored-left-only selection accent.
5. Extend tests for each allowed scope canonical URL; malformed rejection; current-scope refresh/pagination; delayed old read after scope switch; disconnect reset; error retry; exact nine no-argument IPC/preload methods; Korean live label and sample unchanged. Real Electron isolated synthetic tests demonstrate changing scopes with page reset and selection/search reset; no owner password/production writes. Existing login-submit-smoke must continue passing. Implementer runs focused RED/GREEN and final desktop suite, commits owned files, reports evidence. Parent runs independent tests and packaging.

## Parent delivery

Version 0.4.0. Read-only stored scope expansion is not a promise of newly collected/live carrier data. Run task review and whole-branch review, desktop unit and Electron tests, root regression, package and verify installed artifact when user app can safely close. Preserve existing output and user session until update. Report owner-confirmed old connection separately from new scope synthetic proof. No new paid resources.
