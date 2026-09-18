# P4-213 — Assistant scope, UI and multi-account audit

Desktop 0.174.0. Server stays at 1.84.1; no live preference, recipient, permission or schedule mutations.

## Findings verified against code, isolated tests and production read-only metadata

- Personal preferences are keyed by tenant/user; sessions supply the actor. Recipient proof uses a six-digit challenge and verified personal chat IDs are unique. New profiles start with schedules off. Five role schedules and new-order settings are independent per account.
- Personal task summaries use the recipient user, not the read-key issuer. Personal settings do not change the bots' shared prompt, menus, knowledge or API collection.
- Shared schedules target the configured shared bot recipient. Legacy migrated destinations skip shared bot briefing/new-order/daily-ad delivery; weekly/manual ad delivery is separate. Multiple enabled roles can still produce multiple messages.
- Current production: three active OWNER memberships, two preference rows, one verified destination. Last three days: WORK five SENT records, AD one SENT record. These are server delivery acknowledgements, not a new handset test.
- Five bots reported RUNNING with saved/applied revisions matching on this audit; each currently has one allowed Telegram user. WORK supports up to 20 allowed users; SOLO/STUDY/SUP/AD contracts restrict AI conversation to one configured user. The separate SOLO task binding also remains single-user.
- The production proxy restricts app access to OWNER. Preference API/UI unit fixtures for other roles must not be described as production non-admin login support. Existing three family OWNER accounts can have separate preferences, but can all edit shared configuration.
- Full personal AI memory/instructions and multi-user AI operation for the four single-user bots are not complete. Documentation explicitly distinguishes these from notification personalization.

## UI / guide

- All 13 views show personal/shared/local-preview/help scope. Shared work items are no longer grouped as personal settings.
- Added side-by-side personal/shared notification explanation with migration exceptions.
- Personal account connection checklist derives account, verification and saved schedules from returned state. Returning verified users do not see the large beginner banner; help remains one click away.
- Added FAQs for another Telegram account, another Moaon login, current role limits, AI conversation vs notification authorization, and shared scheduling.
- Added /start copy action and per-bot AI access limits. Refined active navigation, forms, cards and responsive layouts in both themes.

## Validation

24 preference/API/isolated SQL/delivery tests passed, including cross-account binding, revocation, recipient constraints and duplicate prevention. Electron preference test switches identities, checks state clearing and delayed responses, verifies all 13 tabs and captures layouts. Dedicated bot, shared automation, advertising and full Hermes guide tests cover save/confirmation, navigation, copy controls, input validation and responsive light/dark states. Older UI tests were refreshed to supply an authenticated OWNER fixture rather than bypassing the current preference role gate.

Actual family passwords were not entered and their live settings were not changed. Cross-login screen checks used isolated fixtures; production status was checked read-only. Actual onboarding of the remaining family Telegram accounts still needs each person to /start and complete recipient verification; adding them to WORK AI access requires their numeric IDs.
