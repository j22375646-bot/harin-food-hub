# P4-218 — Collection failures, diagnosis, and retry recovery

## Request and confirmed cause
The collection strip kept Cafe24 at an undifferentiated confirmation-required state. A confirmed Cafe24 failure was mapped to CHECK_REQUIRED; GET progress polling updated only the existing Naver/Coupang requests. The terminal predicate could therefore never unlock a new collection attempt. The last observed Cafe24 ORDERS_REALTIME SUCCESS was 2026-10-27 16:00:33.952 KST. Subsequent first-error details had been discarded, so the initial provider failure cannot be reconstructed or claimed as token expiry, rate limit, or timeout.

## Implementation
- Server emits bounded channelDiagnostics and safe global errorCode, retains legacy fields, logs only failure code and HTTP status.
- Shared server/app catalog distinguishes authentication missing/expired, permissions, API rate limit, timeout/delayed queue, network failure, database failure, server configuration, invalid request, provider 5xx, unknown result, confirmed failure, and partial CS collection.
- Main process retains request-identity validation and does not expose provider payloads or customer data. Known Cafe24 failures become terminal FAILED; retries unlock after all known worker requests finish. An ambiguous transport timeout never unlocks duplicate requests.
- Three existing compact chips retain equal sizing, stage colors, visible safe codes and hover explanations/action guidance. No new outer panel. Partial CS failure explicitly says the orders completed.
- Added the exact local protocol resource registration for the catalog script.
- Existing collection -> freshness check -> automatic application and deferred selection/issuance safeguards remain.

## Verification
- Server diagnostic and route isolation tests: 16 passed, including all-failed HTTP 503, provider 429 classification, worker failure classification and raw-error removal.
- App transport/connection/security tests: 139 passed.
- Visible right-secondary-monitor isolated Electron checks: eight diagnostic states, light/dark, widths 1440/1040/900, retry enabled, equal chip height, no overflow, no renderer errors; real order writes zero.
- Catalog copies SHA256: 3669c5799c252f53f7cbfddf40dab80304c7d71ad6df4f659b1b46f333094dd8.
- Server production: deployment dpl_JxYUAWGHX3JVkxaQWrji2Zz2ERkE READY, canonical alias harin-cafe24-sync.vercel.app; source 71f266a41db2d32f6e6ac9b37ea6e65458152f71.
- Packaging, installed-source UI checks, public update signature/hash verification: recorded below after completion.

## Scope and progress
This repair has three steps: diagnosis, implementation, release verification. The separate six-stage performance roadmap remains three completed / three remaining; next is stage four rendering, selection and scrolling. The actual authenticated user's Cafe24 recovery must be observed after restarting the new app; fixture results are not production-provider success.
