# P4-208 — Beginner assistant setup guide

Desktop 0.168.0; server remains 1.84.0.

- Added three-step entry card to personal notifications, linking directly to the beginner guide.
- Rewrote regular-user guide into five actionable steps: start bots, verify own recipient, save schedule, test image delivery, request separate AI conversation access.
- Added safe existing bot launch buttons and numeric ID help. Numeric ID lookup still requires the operator; UI does not pretend it can automatically discover it.
- Updated outdated family notification and advertising briefing FAQ. Preserved advanced Hermes/server guides and shared administration boundaries.
- Refined cards, typography, spacing, help disclosures, responsive layout, and dark theme using existing tokens.

Validation: source and distribution Electron tests passed account separation, stale-response isolation, link/verify/unlink/save, guide entry/search, and 700/1660 light/dark overflow checks. Package source verification passed 149 files. Mock UI tests did not send live alerts or change real schedules.

Installed version and signed release verified separately. Live account verification depends on the existing login session; no password automation.
