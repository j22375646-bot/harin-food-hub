# Registered invoice history stays complete / 0.207.0

## Root cause and repair

The renderer retained REGISTERED in its state map, but gave syncError priority
over the completed label/color/reason. A timed-out recheck after navigation
therefore replaced a successful badge with an attention badge. A freshly mounted
row also ignored the verified registered invoice already present in the Main
order DTO and waited for a separate progress endpoint.

- Registered labels/colors and their historical success explanation now take
  priority. Failed latest reads appear in a separate note without erasing success.
- A Main order DTO with a REGISTERED invoice and a valid13-digit number restores
  completion immediately. Missing registration times stay explicitly unknown;
  neither current time nor another order-operation time is used as completion time.
- Local REGISTERED events/results keep their actual invoice number. Different
  invoice numbers invalidate the old proof; an issued-only invoice cannot borrow
  completion from local or unbound server history.
- The same terminal registered request cannot regress to pending. Session/scope
  resets still clear proof, and late responses retain their existing fences.
- Presentation changes do not issue or register shipments, or change collection
  schedules. All real-operation checks remain in Main.

## Automatic collection checked read-only

App Main schedules new collection requests approximately every120seconds, subject
to an active request, user shipping work, availability and recovery. Pending work
is checked before starting another request. Background monitoring runs independently
of the displayed tab and remains active while the app stays running in the tray.
It is not instantaneous provider push delivery.

Production DB check at2026-10-26 19:22:24 KST:

- Cafe24 ORDERS_REALTIME:70 successes in the preceding two hours; latest19:22:18.
- Coupang live-refresh orders-live requests:30 successes; latest19:22:18.
- Naver live-refresh orders-live:naver requests:26 successes, latest19:19:26;
  a new19:22:09 request was RUNNING. One earlier17:44 failure remained in history.
- Worker heartbeat19:22:18 was BUSY on NAVER_COMMERCE_SYNC, not offline.

The final19:26:03 KST read confirmed Cafe24 success19:24:26.415, Coupang
success19:24:26.574, Naver success19:25:31.162 and worker heartbeat19:25:34.833.

These are actual stored provider-job results, not evidence that a new customer
order necessarily arrived. No live order issuance, registration, test collection
request, API-key change or notification was performed for this check.

## Verification and release

- New regression tests first failed on completed color after timeout, terminal
  state regression, and loss of the local registered invoice number, then passed.
- Native UI covers three page round trips, timeout retention, Main stored proof,
  local invoice A success versus issued invoice B, unbound server success, and
  logout clearing. Synthetic transport only, no real writes.
- Evidence: D:\GPT\Temp\moaon-completed-state-207.
- Distribution: desktop/dist/distribution-20261026-192155-458.
- Full desktop unit suite:546 passed,0 failed. Mixed20-order/two-process native
  integration passed with partial retention, logout clearing, late-reply fences,
  both themes and1060/1440 widths.
- Installed0.207.0 on the right secondary monitor passed the new completed-state
  regression and existing mouse/keyboard/switch-badge toggle tests with mocked
  transport.165 packaged files matched source; app.asar SHA256
  934f25aae67b81326beccec09eef072c90b23f3293893f3689aa702a09244e41.
- The toggle test waits for the native asynchronous toggle event before checking
  explicit aria-expanded; the actual popup-close assertion remains immediate.
- Installer114463577 bytes; SHA256
  77f61579501e6e1fb558238429858ffa6418217116949d23794c68c889887cb6.
  Windows Authenticode remains NotSigned; pinned Ed25519 updates remain required.
- Published moaon-stable0.207.0 and fully re-downloaded the public installer.
  public-receipt.json confirms the pinned Ed25519 manifest, metadata, byte count
  and installer SHA512 all passed. No existing user's running app was forcibly
  terminated; it was still0.206.0 at the final process check and needs update/
  complete tray quit and relaunch for the presentation fix.

Overall performance roadmap remains3/6 complete with3 stages remaining. This
targeted correction does not complete stage4 changed-row rendering/view retention.
