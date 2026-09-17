# P4-206 Personal assistant notifications

Server 1.84.0 / desktop 0.166.0.

Shared Telegram credentials and Hermes conversation profiles remain administrator-managed. Each authenticated active member now owns a private verified recipient and independent five-role schedules plus new-order alerts. New members start OFF; a unique existing legacy recipient is migrated only to its active read-key owner. Legacy schedule delivery is suppressed for the migrated recipient even after unlink, preventing accidental reactivation. Explicit manual advertising reports remain deliverable.

Personal settings use session-derived actor identity, active membership/version checks, private positive chat IDs and a ten-minute six-digit challenge sent by the WORK bot. Attempts, starts, and tests are capped. RLS and service-only RPC prevent direct client table access. User mutations cannot choose another actor. Unlink disables all personal notification flags. A membership change invalidates the binding. Settings stay server-side and UI clears on account switch; stale responses cannot repopulate another account.

The timer dispatches up to four personal claims per tick. Claims are consumed before transmission; unknown results do not retry. Images reuse the existing deterministic renderer, with text fallback only before transmission. Own tasks use recipient user ID and key scopes. AD uses the latest completed stored advertising report with original period/age, and explicitly flags a period other than yesterday. Custom AD notification time does not move the shared collection schedule. Personal images link to Moaon; legacy draft/snooze callbacks are not reused across users. NEW_ORDER messages aggregate per channel; per-user order time cutoff excludes backlog and status-change notifications.

This phase does not automatically authorize additional people to Hermes AI conversation profiles, create private AI memories, or apply per-user conversational instructions. Telegram /start for each receiving bot is still required. The UI explains this boundary. All current family accounts have OWNER role: common connection management remains available to them, but personal preferences are actor-scoped.

Validation before release: 41 focused Node/SQL/PNG tests, 9 desktop tests, 12 Python tests, source and packaged Electron A/B account switch/link/unlink/stale-response tests, 700/1660 light/dark layouts. Next webpack production build passed; local Turbopack rejected the preexisting external node_modules symlink. Packaged archive verified 149 source files. No customer orders or replies were modified and no extra Telegram test messages were sent.

Production verification is recorded below after deployment.

Production verification:
- Supabase migration applied; one existing recipient migrated, WORK/AD09:00 and newOrders retained, SOLO/SUP/STUDY OFF.
- Vercel deployment dpl_DMVTfbd68oeuU4hKmdowwkS1oE7h READY; live x-harin-version 1.84.0.
- Hermes automation.py updated; timer active, service success/0; explicit worker tick CHECKED with failedSlots[].
- Local0.166.0 archive/source match verified and installed on right monitor. Authenticated account UI verification awaits login: saved session redirected to login. Packaged synthetic multi-account UI passed; this is not reported as authenticated liveUI proof.
