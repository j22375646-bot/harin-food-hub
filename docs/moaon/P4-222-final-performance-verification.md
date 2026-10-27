# P4-222 — Final integrated performance release verification (stage 6)

## Result and scope
All six defined performance-development stages are complete. This final stage added a repeatable installed-code UI gate and refreshed the full verification evidence. Application runtime sources and version remain 0.221.0; no new runtime patch or installer was required by this verification. The existing public installer and exact installed payload were verified again.

## Development
- Added desktop/scripts/verify-performance-release.cjs: verifies the installed app.asar against declared application sources, then runs nine isolated Electron UI suites serially on the right monitor, with per-suite logs, duration, exit status, bounded timeout and a resumable JSON receipt tied to the payload hash.
- All test profiles/temp files are rooted under D:\GPT. The gate does not use production passwords or issue/register real customer orders. Timeout cleanup targets only the child test process tree.
- Updated the inline-login test to use the configured D-drive Electron runtime and an explicit launch timeout.

## Fresh verification
- Full desktop node:test suite: 567 passed, zero failed/skipped/cancelled, duration 125121.889ms.
- Installed payload 0.221.0: PASS, all 166 declared files exact; app.asar SHA256 4337365a5de5af2ef966b41f9141b5b525c13e4424c6c5ea551655155782b4b2.
- All nine installed-code visible right-monitor suites PASS: isolated inline login, slow order read, automatic collection/list application, three-channel plain-language diagnostics, incremental rendering, resource lifecycle, shipment popup/toggle/recovery, update restart drain, and read budget/background collection.
- Synthetic slow order response: READY / REGISTER / one row after 18342ms. This is a mocked response, not a production account measurement.
- Renderer comparison on 80 fixture rows: median retained render 12.1ms vs full rebuild 53.9ms, seven samples in the same runtime. Unchanged row creation zero; one changed order creates one row; selection/scroll/popover/filter/logout checks PASS.
- 80-page / 1600-order fixture: current DOM and render cache 20, shipment state/lookup/invoice caches 200 each, route history 50. Explicit-GC renderer JS heap 3,050,368 bytes after 40 pages and 3,294,944 after 80 (delta 244,576). Not total Windows memory or an hours-long authenticated soak.
- In-flight mocked UI shipment job survives tab changes and progress IPC, then completes. Actual production invoice writes zero.
- Update restart test uses the real update state machine and gate with an installer spy: waits for active work, installs once, duplicate blocked; real installer executions zero.
- Read budget: three concurrent team reads coalesce into one GET; background orders and CS collection both remain enabled.
- Resume gate was exercised successfully without rerunning already passed suites for the same payload.

## Read-only operating checks
- Production /login HTTP 200, 526ms in this probe; no authenticated account/order-session assertion.
- Public 0.221.0 feed Ed25519 signature verified, installer HTTP 200, GitHub digest matches, bytes 114471827. Installer SHA256 6079d5fcac80b2db5b50c0e3b8c2bd8a10839835fc5cbc9700968e9f5c0ab925. Windows Authenticode remains NotSigned.
- Supabase operating records: Cafe24 ORDERS_REALTIME SUCCESS finished 2026-10-27 18:11:47 KST, 56 received rows; Coupang ORDERS_REALTIME SUCCESS 18:08:53 KST, 101 rows.
- Naver queue records: SUCCESS 18:09:22 KST; next request created 18:11:49 was RUNNING at the read. A running collection is not a completed or failed result.
- Actual running user executable observed under releases/0.219.0. Installed/current shortcut release is 0.221.0. Restart after current shipment work completes is still needed to apply this release to that existing user session. No forced termination.

## Re-run
Run from D:\GPT\moaon with the project environment loaded:

    node desktop/scripts/verify-performance-release.cjs --archive D:\GPT\Apps\Moaon\releases\0.221.0\resources\app.asar --output D:\GPT\Temp\moaon-final-performance-222

Add --resume to continue a previous run only if the payload hash matches. Detailed receipt: D:\GPT\Temp\moaon-final-performance-222\receipt.json. Full unit log and public-feed/login health receipts are copied into that folder.

## Final plan status
Total six stages, current stage six, completed six, remaining zero: the defined development plan is complete. No additional feature is silently appended to it. Optional follow-up is a separately scoped real-use diagnostic/longer observation effort if actual symptoms recur; automated fixture verification is not represented as hours-long live-account operation.
