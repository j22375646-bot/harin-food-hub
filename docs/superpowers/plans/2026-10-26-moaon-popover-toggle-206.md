# Shipping progress popup re-click fix / 0.206.0

The user's re-click failure was reproduced in Electron: a second real DOM click
left `:popover-open` true. The badge was outside the native auto-popover and had
no invoker association. Browser light-dismiss closed it on pointer interaction;
the manual click handler then observed a closed popup and opened it again.

The badge now declares its native popover target and toggle action. Its click
handler only stops order-row propagation. The browser owns mouse and keyboard
toggle behavior; the toggle event synchronizes aria-expanded and positions an
opened panel. Outside click, Escape, scroll/resize and session reset remain.

Verification:

- The new Electron regression failed before the fix on the second click, then
  passed three close/reopen rounds, aria-expanded checks, Enter/Space, switching
  badges, outside click and Escape. Six progress states and both themes remain
  covered; no invoice writes or order reloads.
- Relevant progress state/transport/contract/connection tests:22 passed.
- Build and release evidence: D:\GPT\Temp\moaon-popover-toggle-206.
- Build directory: desktop/dist/distribution-20261026-183452-904.
- Installed-payload and public-download acceptance are recorded after completion.

Overall performance roadmap is unchanged:3/6 completed,3 stages remain. This is
a focused UI correction; stage4 changed-row rendering and preserved view is next.
