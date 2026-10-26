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
- Installed0.206.0 payload on the right secondary monitor passed the same complete
  toggle regression with synthetic replies:three close/reopen rounds, keyboard,
  switching badge, outside/Escape dismissal, six states and two themes. Package
  comparison passed165 files; SHA256
  5d6b0568dc15454900a818290033eab7f3635eb6ee73625c1c2cd5d571dc6577.
- Mixed20-order/two-process integration passed, including partial data retention,
  session expiry clearing and late-response discard at1060/1440 widths/both themes.
- Public moaon-stable0.206.0 was published and the114462861-byte installer fully
  downloaded again. Pinned Ed25519 manifest, metadata and installer digest passed.
  Installer SHA25603e76dec2c45464c7d2e5b443cf1c721a469875cefdf67afc153a4db49435dbf.
  Windows Authenticode remains NotSigned, independently of update verification.
- The running user's app was not forcibly terminated. Complete tray quit/relaunch
  or applying the update is required for an older running process.

Overall performance roadmap is unchanged:3/6 completed,3 stages remain. This is
a focused UI correction; stage4 changed-row rendering and preserved view is next.
