# Order read recovery and badge containment / 0.205.0

## Observed cause

The real 0.204.0 executable was running when the user reported intermittent empty/error order views. A read-only production-data pipeline probe returned all three channels READY and 166 normalized orders, but took 17.789 seconds. Both the list adapter and business-order request previously had 15-second deadlines. A successful slow read could therefore be discarded. The home overview also fetched four scopes, each loading the same full stored data set. This is evidence of a deadline/load mismatch, not evidence that update signing or a new payment failed.

## Repair

- Server `order-read-model.js` shares overlapping stored-list data reads by server DB instance, clones each consumer's normalized results, and removes work on success/failure. It does not cache successful results, credentials, request authorization, or shipment preflight.
- Owner/business/session checks still run independently before and after each response. Business request deadline is 30 seconds; Main list, background list and freshness deadlines are 45 seconds. Shipment and other write deadlines/retry rules were not changed.
- The list includes four bounded overview pages. The app projects safe preview fields and uses one GET for all four counts; older servers keep the compatible fallback. Unauthorized overview stops before further scope requests.
- HTTP503/504 order failures now give a specific explanation. Production logs and Server-Timing contain only aggregate read timing/counts, no order details or credentials.
- Badge status now starts with an explicit animated `송장 상태 확인 중…` state. Unknown/error records do not become successful registrations; existing records survive failed rechecks. Unstarted orders without a stored invoice do not acquire a false completed badge.
- The full order row, including its timing/progress rail, shares one selection/hover outline. Negative rail margins were removed. Badge sizing is consistent, and the invoice number uses a solid separate background, border and contrasting digits in selected rows.

## Verification

- App unit suite: 543 passed, zero failed. The new regression first failed on the actual refresh path with a 10ms old budget/22ms response, then passed for page, background and freshness after all three timers changed.
- Server focused suite: 28 passed; after aggregate instrumentation, 16 relevant request/read/export tests passed again. Tenant revocation, identity changes, invalid input and deadline fences remain covered.
- Installed 0.205.0 payload: 165 source files verified, SHA256 7e2f4169233b9a2f5d757c496874bddeea70e9e516b049986d14ebd2e46e6be4.
- Right-monitor installed-payload UI accepted an 18-second artificial response in approximately18.25s, showing one REGISTER row. This is a synthetic transport test, not a real-user session claim.
- Installed badge UI: initial held loading state, six progress states, row-height preservation, popover Escape/outside dismissal, failed-recheck preservation, two widths, two sidebar modes and both themes; no real invoice writes. Mixed20-order/two-process integration also passed.
- Production server: 8a4dcd634086b6726bf0b12f41661814d7d7a9b3 deployed as dpl_gqrryaDrQVgrC4Fb536kid15N71W, READY and canonical production alias verified. Real authenticated runtime logs show data reads of1568/1589/2683ms with partial:false. These are server data-handler times, not end-to-end app timings.
- Local live read-model check against production data:3906ms,166 normalized orders, ACTIVE0/REGISTER1/IN_TRANSIT25/COMPLETED140, all sources available. No invoice/registration or key writes.
- Build: desktop/dist/distribution-20261026-182147-537. Installer114463090 bytes; SHA256075b953f7f3c93ff48e13f149aeee68e91411d56165b22b97193d5f9b4606e6b. Release acceptance recorded after public download verification. Windows Authenticode is NotSigned; pinned Ed25519 update verification remains enabled.

## Plan status

The six-stage performance plan remains3/6 completed and3 stages remaining. This incident repair does not mark partial row updates, the full server read-model optimization, or prolonged regression testing complete. Next planned stage4 remains changed-row rendering and preservation of selection, scroll and open detail.

Evidence directory: D:\GPT\Temp\moaon-order-read-incident-20261026. Existing running user app was not forcibly closed. Actual user's 0.205.0 session outcome still needs confirmation after update/relaunch.
