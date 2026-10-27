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

## Additional regression and final reconciliation
- Remove obsolete/replaced nodes before arranging retained nodes. Replacing one order does not move unaffected following rows and does not dismiss their popovers.
- Added a specific assertion that a second order's popup remains open when only the first order's DTO changes.
- Final source retention test PASS; 80-row render medians: reused 15.8ms vs full rebuild 69.2ms in the same runtime (seven samples each).
- Shipping progress toggle regression PASS: repeated toggle, keyboard, outside click, another badge, six states, phase retained through timeout and successful recheck, two themes; real writes/order reloads zero.

## Final release verification
- Version 0.220.0; final artifact folder desktop/dist/distribution-20261027-171540-390. Earlier candidate was not published.
- Payload: PASS, 166 exact source files; app.asar SHA256 b64749b256b9373ede58c2243dffd503d28cdb53b8fd1c743f87a5c7d23e09fc.
- Installed release/current.json/shortcuts: D:\GPT\Apps\Moaon\releases\0.220.0. User's existing running processes preserved; restart required to use new release.
- Installed app.asar visible right-monitor isolated retention test: PASS, zero unchanged-row creation, one changed-row creation, popover/selection/scroll retained, filter eviction and logout clear, no real order writes. Installed median render 23ms vs full-rebuild comparison 123.6ms (same 80-order fixture; device load affects absolute times).
- Installed app.asar automatic collection application regression: PASS, includes issuance/selection deferral, existing rows retained on slow/failing reads, retry, themes and three widths.
- Public moaon-stable release: published; Ed25519 signature verified; installer HTTP 200, GitHub digest matches, bytes 114471694; installer SHA256 ef9ec87be173e1f20537bb1130bb3390e6bf95f6784a04d85bb7812337337cca. Authenticode remains NotSigned.
- Performance roadmap: stage four complete, four of six complete, two remaining. Next is stage five long-running memory/background resource checks. API/schema/provider-issued shipment behavior untouched by this stage.
