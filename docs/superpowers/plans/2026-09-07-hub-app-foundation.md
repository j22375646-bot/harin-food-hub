# Hub app foundation implementation plan

Goal: deliver the first deployable slice of the approved integrated roadmap: safe installation and measured, semantics-preserving computation improvements.
Architecture: retain Next server authentication, Vercel and all channel workflows. Installable PWA is progressive enhancement, not a native rewrite. Offline means a non-sensitive explanation only, never offline business actions.
Tech stack: installed Next 16.3 / React 19 / Node 24, node:test, existing CSS and icons.
Spec: canonical checkout `docs/audits/2026-09-07-hub-app-hermes-integrated-roadmap.md`, approved 2026-09-07. This deliverable covers R0 baseline, bounded R1 computation improvement and R2 installation foundation; phone push, real external setup, observed learning and paid Hermes trial retain their separate prerequisites and must not be reported complete.

## Global Constraints

- Preserve existing UI, authentication/session/logout/deep links, channel boundaries and financial calculations. Unknown is not zero.
- No platform writes, real labels, refunds, customer messages, bid changes, paid resources, raw customer data in reports, or credentials in source/logs.
- Never cache authenticated HTML, API, RSC or tokens in service-worker storage; never queue mutations offline. No static export or auth bypass.
- No forced refresh, skipWaiting or clients.claim that interrupts active forms. No notification permission request or fake push readiness in this slice.
- Changes use apply_patch, regression-first tests, focused tests, whole suite, review, build and deployment verification. Preserve unrelated files.

## Task 1: Installable hub foundation

Read the Global Constraints above as binding requirements (included here): preserve UI/auth/channel/math, no platform writes or secrets, no private service-worker caches or offline mutation replay, no forced refresh, no push permission/fake readiness.

Files: create app/manifest.js; app/_pwa/pwa-registration.js; public/hub-sw.js; public/hub-offline-v1.html; install icons under public/icons/; reproducible icon generator under scripts/ if needed; test/hub-pwa.test.js; docs/operations/hub-app-installation.md. Modify app/layout.js metadata + invisible registration, proxy.js ONLY exact public manifest/offline paths, next.config.js worker/offline cache headers. Do not change other proxy authorization behavior. Prefer existing app/icon.svg artwork; generate PNGs deterministically via installed sharp (no external image or package). Generator is source edited via apply_patch; generated binary outputs are mechanical artifacts.

1. Read bundled Next progressive-web-apps.md and metadata manifest guidance before code. Inspect auth/public path and current CSP.
2. RED tests exercise real worker in node:vm with controlled caches/fetch/events and real generated manifest object (import via controlled transform if needed). Cover navigation failure returning offline explanation; successful navigation unchanged; API/private/non-navigation GET not cached; all mutations untouched; no forced activation; install failure remains fail-safe; exact manifest public while private route still auth required.
3. Manifest: stable id '/', start_url '/', scope '/', name '하린식품 허브', short_name '하린허브', lang ko, standalone display, existing brand colors; PNG 192 and 512 icons and Apple touch 180. Include manifest/apple metadata without changing existing title or theme behavior.
4. Worker scope '/': cache ONLY exact versioned offline HTML (no data) and versioned own icons if useful; no generic static/runtime cache. Network-only same-origin document GET falls back ONLY on network rejection, not 401/403/500. Do not intercept API, RSC, non-document GET, external URL or mutation. Offline hint must explicitly state data cannot be refreshed and shipping/refund/other writes need connection, with a normal retry link to '/' and existing theme-compatible CSS without external dependencies. Do not copy authenticated page/URL content into cache.
5. Registration invisible, supported browser only, after load/idle, production only, updateViaCache none, no reload/skipWaiting/claim. Errors do not break hub; remove event/idle handlers on unmount. No auto-install prompt. Normal browser install menu is first UI. Keep current login flow/deep links.
6. Document Windows Chrome/Edge install/uninstall, phone home-screen steps and limitations, fresh-server-data requirement, manual update after saving work, and push not yet enabled. Test semantic manifest/icon dimensions/worker cache contracts rather than source-string-only assertions.
7. GREEN focused test, full suite once, diff check; commit own files only. Full report includes RED/GREEN output, files, tests, residual real-device verification needed. Do not deploy or bump version; controller handles final integration.

## Task 2: Measured date computation optimization

Global Constraints as above: preserve UI/auth, channels, financial amounts and exact date/calendar semantics. No external data writes, network cache or stale result reuse.

Files: lib/analytics/main-sales-history.js; lib/shipping-reference/business-calendar.js; lib/orders/unified-orders.js only if its live helpers benefit; test/hub-date-performance.test.js; scripts/benchmark-hub-date-processing.js; docs/operations/hub-performance-baseline.md. No broad unrelated refactor or removal of fields/rows.

Evidence: baseline controlled Node24 fixture with 2000 NAVER orders ('2026-09-07T01:00:00Z', PAYED, paid_amount 30000, asOf '2026-09-07T10:00:00Z') buildMainSalesHistory five runs 228/184/182/197/170 ms, totalRevenue 60000000 and totalOrders 2000. Each row creates a new fixed-locale Intl.DateTimeFormat. business-calendar.js similarly constructs fixed formatter per order.

1. Create repeatable benchmark script exercising real production functions with deterministic non-personal fixtures. Run on unmodified code and record elapsed samples plus output checksums, then compare after change. Do not assert fragile wall-clock thresholds in tests or equate synthetic CPU saving to browser end-to-end saving.
2. RED behavior + resource regression tests: KST midnight UTC boundary, month/year/leap-day, invalid/null handling matching existing contracts, shipping 15:00/15:01, weekend/holiday, unknown holiday confidence, input immutability. Demonstrate expensive formatter construction is bounded per module and not per row via isolated VM or child-process instrumentation; test actual builders, no production instrumentation helper.
3. Reuse fixed Intl formatter instances at module scope (or lazy once) instead of per row. Preserve identical locale/options, Date parsing, validation branches and all output. Do not alter shipping calendar algorithm/cutoff logic or implement new business policy. Avoid unused-helper work.
4. GREEN focused plus existing main-sales-history/business-calendar/unified-orders tests; full suite once; run benchmark five samples before/after and validate deep-equal outputs or deterministic checksums. Record provenance synthetic not live performance, Node version and fixture size.
5. Commit own files; report RED/GREEN and benchmark evidence. No deploy/version change.

## Controller validation and continuation ledger

Use isolated branch; task reviews and whole-branch review; run default Next build and whole tests; preserve baseline user files. Capture authenticated browser navigation timings for main/orders/CS/settlement/keywords (no credential automation); record unavailable login submission/physical phone checks honestly. Test manifest MIME/icons, public/protected routes, service-worker storage/offline/update behavior without real business writes; normal UI/dark theme regression. Release version and change log using existing format, commit/push/deploy approved by user's standing instructions; verify exact release SHA READY, public version and authenticated app behavior. Continue next roadmap prerequisites assessment, but do not purchase/install Hermes or claim actual phone push or 7/14-day outcomes.
