# Completed history regression — server 1.87.3

The tracking-first classifier downgraded channel DELIVERED/PURCHASE_DECIDED records to WAITING_FOR_CARRIER when carrier observations were absent, failed, queued, not found, or stale. This also bypassed the existing 30-day terminal display window and inflated pending work.

Preserve terminal channel completion after cancellation precedence, before carrier transitions. Carrier results still own movement for nonterminal orders. A completed order without a matching delivered carrier badge shows CHANNEL completion evidence rather than an obsolete reservation badge. No database rows, invoice registrations or shipment actions are changed.

Validation:
- New regression cases failed before the fix and passed after it; Cafe24, Naver and Coupang, missing/failed/queued/not-found/in-transit observations, old history and pending counts covered.
- Focused final 77/77 tests passed. Full initial run: 3168 total, 3151 passed, 14 failed, 3 skipped. Twelve failures encoded the old terminal downgrade, one required release notes, one unrelated race-barrier timing assertion failed under load. Updated expectation/release tests passed; timing test passed separately (1/1). Do not describe this as a clean full-suite run.
- Default local Turbopack build blocked by the existing node_modules junction outside project root; next build --webpack passed.
- Visible right-monitor Electron smoke passed against source and installed 0.180.0 app.asar with isolated fixtures: waiting 1, recent completed 1, old completion absent. No real orders written. Desktop binaries are unchanged; server response supplies the correction.
- Production count comparison blocked: Vercel env pull returns masked database settings. Exact remaining live count is not verified. Temporary pulled settings removed.

Scope limitation: nonterminal orders without confirmed tracking still use the existing registration workspace with a check-required tracking badge; this patch does not add a separate unknown-tracking workspace.
