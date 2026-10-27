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

## Release completion
- Installer built: Moaon-0.218.0-Setup.exe, 114470450 bytes, SHA256 b67d3f09aca41a774507cb99db9b53b674a7140b0b4e64fe28b83fe1948bd46c.
- Package payload: PASS, all 166 files match source; app.asar SHA256 04f169e53cc3568474a156ced3f7d7e08d0822351baf095573685afad9d0adb9.
- Local installed release: D:\GPT\Apps\Moaon\releases\0.218.0; current.json and shortcuts updated. Existing running 0.217.0 process preserved; user restart is required for that session to load the new version.
- Installed app.asar + real Main/preload/UI in isolated visible right-monitor fixture: PASS, same 8 codes / 2 themes / 3 widths, retry enabled and equal chip sizing; no real order writes.
- Existing collected -> change check -> automatic list application regression: PASS, including issuance/selection deferral, old list retention during loading, and failure retry.
- GitHub moaon-stable published; public feed Ed25519 signature verified, installer HTTP 200, GitHub SHA256 digest matches.
- Windows Authenticode remains NotSigned; Ed25519 verification is the update trust check.
- This repair: all three stages complete. Live Cafe24 provider success after the new authenticated session restarts remains unverified; last production order sync observed before restart was 16:00:33 KST. No first-failure cause invented.
