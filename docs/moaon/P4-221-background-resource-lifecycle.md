# P4-221 — Shipment cache and background resource lifecycle (performance stage 5)

## Confirmed findings
- The 200-row shipment presentation cache was pruned only inside a successful remote merge. Locally mounted registered invoices and local job results could accumulate across visited pages while remote reads were unavailable.
- Related lookup/invoice maps were not pruned together with evicted rows.
- Shipment polling checked document visibility but not the selected route; idle shipment reads could continue from another page. The elapsed-time interval also considered historical cached pending rows outside the current watch list.

## Changes
- Apply the existing cache limit on watch changes as well as successful merges; prune related lookup and invoice entries together. Preserve the current watched IDs and local batch IDs. Only the presentation cache is pruned; server records and active Main operations are untouched.
- Stop idle shipment polling when the order view is hidden. Resume promptly on route/visibility return.
- Retain polling for an active local job or watched server pending/running job while hidden, with a minimum 15-second cadence. This never executes invoice issuance or registration.
- Pause one-second presentation timers off-screen; restart when the order view returns. Historical cached pending rows alone no longer keep the interval running.
- Add read-only aggregate resourceUsage counts for deterministic verification; no invoice/order identifiers or customer data in that diagnostic.
- All automatic order collection, issuance, registration, confirmation and provider validation code in Main remains unchanged.

## Source verification
- Connection, collection, shipment state and lifecycle unit tests: 162 passed. Separate shipment-progress contract/transport/connection/state suite: 25 passed (suite overlap exists; do not add as unique tests).
- Lifecycle tests cover hidden idle pause, immediate resume, hidden server work at 15 seconds, bounded local-only cache without a successful merge, active batch preservation and reset.
- Visible right-monitor isolated Electron fixture: 80 pages / 1600 orders, current DOM rows 20, order render cache 20, shipment state/lookup/invoice caches 200 each, route history bounded to 50.
- Same fixture after explicit renderer GC: JS used heap 3,100,336 bytes after 40 pages and 3,283,108 after 80 pages (delta 182,772). This is renderer JS heap, not total Windows process memory or an hours-long soak test.
- Hidden idle shipment reads zero after the current read settled; resume checked. Mocked UI issuance action stayed busy across a settings-tab change, consumed progress IPC, and completed registered without resetting the action generation. Network issuance was replaced by a test handler; real order writes zero.
- Existing popup/toggle/state recovery and collection -> change -> automatic list application regressions passed.

## Progress
Performance roadmap stage 5 of 6. After installed payload and signed public release verification, five stages are complete and one remains. Stage 6 is integrated performance/regression verification including longer operating observations; no claim of hours-long authenticated production operation is made by this accelerated fixture.
