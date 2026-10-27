# P4-220 — Stable incremental order rendering (performance stage 4)

## Scope and preserved work
App renderer only. Preserve 0.219.0 collection wording, all three channel diagnostics, collected -> change -> automatic application, existing shipment progress state and safe issuance gates. No server/API/schema modifications. Initial tracked tree was clean; unrelated untracked assets were left untouched.

## Changes
- Reconcile the visible order page by unique order ID and serialized projected DTO, app mode, local date and change-indicator state. Unchanged rows reuse their actual DOM nodes and bound handlers. A changed DTO creates a fresh row with current values/handlers.
- Reorder existing nodes only as needed; remove rows outside the current view. Missing/duplicate IDs use uncached rendering, avoiding incorrect row aliasing.
- Preserve unchanged loaded images, focused controls and shipment popovers across routine renders. Reuse channel selector options.
- Bound cached data to the current visible page and clear it on session change/logout. No persistent customer-data cache added.
- Replace repeated selection lookups with a per-render order map and a visible-ID set. All issuance, registration, count, invoice and address conditions remain unchanged.

## Verification so far
- Visible right-monitor isolated Electron 80-order test: unchanged rows recreated 0; exactly one changed order recreated 1; other row identity retained; popup remains open; repeated row click selects/deselects; scroll unchanged; sorting/filter eviction and logout clearing passed; no operating writes.
- Same fixture and runtime median of seven render calls: stable 16.1ms, full-rebuild comparison 74.3ms. This compares UI rendering only, not production network/startup speed.
- Connection, collection and security tests: 147 passed.
- Collection -> change detection -> automatic apply regression passed, including selection/issuance deferral, failed read retention/retry, themes and widths.
- Three-channel plain-language diagnostics regression passed: 11 states x 3 channels x 2 themes x 3 widths; no visible technical codes and no overflow.
- Shipment toggle regression and installed/release results recorded below.

## Plan
Performance roadmap stage 4 of 6: renderer/selection/scroll. Completion requires installed-code verification and signed public update feed verification. Following work: stage 5 long-running memory/resource checks, then final integrated performance/regression verification. Earlier 0.218/0.219 follow-up repairs remain complete.
