# Moaon performance phase 3 / 0.204.0

## Scope and decisions

The connection incident took priority. Supabase was restarted through the existing authenticated dashboard with explicit user authorization. All three stored-order sources returned READY (166 normalized orders in 10.553s), account/session probes returned HTTP200 in 440/381ms, and the user subsequently confirmed that Moaon connected. These probes do not measure end-to-end authenticated UI latency. Pro and spend cap enabled were confirmed; no billing settings changed.

Ruling: share in-flight reads only, not cached successful authorization or bodies. Account generation and write invalidation must fence late responses. This sacrifices additional cache hits to preserve current access checks.

Ruling: keep the existing 15-second background team freshness budget and 60-second healthy order/CS/calendar checks. A failed calendar must not slow healthy order notifications. The original 50% overall idle-request goal is not established by these changes. The team polling baseline is approximately 10/min (foreground 6 + background 4); fresh foreground snapshots suppress background duplicates, approximately 6/min (40% reduction for this path). Hidden-renderer polling suspension is not included. Do not describe this as a 50% reduction of all app traffic.

## Implemented

- Main shares exact concurrent team READ operations, cloning replies for each consumer; writes remain independent and never automatically replayed.
- Team failures back off with jitter from 15 to 120 seconds. A successful retry resets the budget; account changes and mutations invalidate outstanding reads.
- A hard read deadline also settles transports that ignore abort signals.
- Background monitoring reuses trusted Main snapshots and takes over at snapshot expiry. Per-source read failures back off independently from 60 to 240 seconds; successful partial results keep their normal checks.
- Unchanged notification-state JSON no longer rewrites disk.
- User-requested shipping progress sits beside the shipping timing badge in a sibling status rail, outside the row-selection button. Native small popovers replace expanding rows, with viewport clamping, internal scrolling, outside-click/Escape dismissal and centered CSS chevrons. Existing status colors, animation, recheck and safe continuation behavior remain.

## Verification

- All desktop unit tests: 541 passed, 0 failed (unit-tests.log).
- Read-budget Electron UI: three overlapping exact READ calls produced one network GET; one foreground team GET during the following 17 seconds; order/CS collection remained enabled. Isolated mocked responses, no real user credentials.
- Shipping detail Electron UI: six states, retained phase after failed recheck, row height unchanged by popup, Escape dismissal, light/dark themes; no real writes or order reloads.
- Shipping integration Electron UI: 20 mixed orders, two fresh processes, widths 1060/1440, both themes, partial read retained, session expiry clears state, late reply discarded; no real invoice issuance/registration.
- Installed payload: D:\GPT\Apps\Moaon\releases\0.204.0\resources\app.asar, 165 source files verified, SHA256 5a4784166befe1e5104c561b10fddd8cca00c984d2f82902f5daffe9927c203e. Visible right-monitor isolated shipping-details/read-budget/native-tray tests passed against this payload. Native hidden polling preserved team/order/CS checks and tray hide/restore/quit. These use synthetic replies, not the user's session.
- Distribution: desktop/dist/distribution-20261026-175349-406. Public moaon-stable 0.204.0 published and installer fully re-downloaded: 114462237 bytes, SHA256 56f482bf73e63f67f47c7d579bf46d93b91800448a52d965da537ccfc8efb0f9. Ed25519 manifest, latest.yml consistency and installer SHA512 verified. Windows Authenticode remains NotSigned; it is separate from the app's pinned-key update verification.
- Test/build/public receipts: D:\GPT\Temp\moaon-read-budget-204. Existing user's running 0.203.0 process was not forcibly terminated; complete tray quit and relaunch applies the locally staged 0.204.0 shortcut.

## Plan status

Stages 1–2 were released in 0.203.0. Stage 3 is complete with the documented acceptance adjustment above, released in 0.204.0 (3/6 completed, 3 stages remain). Stages 4–6 remain: partial row updates and preserved view, server-side read reduction, and prolonged acceptance/performance comparison. Further performance improvements are not claimed from this iteration.
