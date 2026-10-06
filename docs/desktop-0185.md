# Moaon 0.185.0 — bulk delivery preparation and registration wait

- ACTIVE selection adds 배송정보 일괄 준비, up to 20 selected orders with at most three concurrent delivery reads. Reuses existing provider read path and refreshes selection after the batch. Invoice issuance remains sequential.
- Coupang invoice upload queues once and checks once before proceeding to the next order. At batch end, existing pending operation IDs are checked for up to 30 rounds under a 60-second shared deadline. Resume-only mode cannot POST a new action. Success requires fresh registered state with the exact invoice.
- Progress displays selected and registered counts.

Verification:
- Desktop unit suite: 477 passed, zero failed (D:/GPT/tmp/0185-full.log).
- New two-order pipeline test requires both uploads to be queued before first completion and asserts exactly two upload POSTs.
- Visible isolated Electron test: 12 synthetic orders, peak three reads, preserved selection; passed in source and built app.asar. No real order write.
- Package payload: 159 source files match, version 0.185.0.
- Legacy auto-shipping-ui-smoke could not reach order controls from the current entry screen; not claimed as passing. The temporary harness experiment was reverted.

Limits:
- Worker/provider throughput has not been measured on customer orders. PREPARE/ISSUE pending continuation and whole-list rereads are unchanged. Invoice issuing remains sequential; this is not unrestricted concurrent issuing.
- Pending requests can remain pending after the bounded check window; no completion is fabricated. Reopen/recheck existing work instead of reissuing.
