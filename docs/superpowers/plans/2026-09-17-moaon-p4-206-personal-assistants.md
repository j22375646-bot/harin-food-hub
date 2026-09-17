# P4-206 Personal assistant settings implementation plan

Goal: Shared bots remain administrator-managed; each authenticated active member owns notification preferences and verified private Telegram destination. Never overwrite another member's settings.

Architecture: Add account-keyed preferences and personal delivery ledger beside legacy bot configuration. Actor comes from session. Legacy notifications remain until explicit owner migration and no duplicate legacy/personal sends. New members default OFF. Private memories and conversational instructions are subsequent work; do not imply implemented isolation there.

- [ ] Implement account/session/membership-fenced SQL preferences, validation, revision conflicts, recipient verification, and tests.
- [ ] Implement authenticated PREF_* API and desktop contract/transport, member access for these actions only.
- [ ] Implement personal settings UI with shared connection management distinguished and own recipient/role schedules.
- [ ] Implement worker personal image delivery and recipient ownership verification; same image renderer, per-user dedupe, no automatic retry after uncertain send.
- [ ] Verify three-account isolation, permission revocation, schedules, disabled users, recipient switching and no duplicate old notifications.
- [ ] Run focused Electron and server tests, build, deploy migration/server, signed app release and installed UI verification.

Ruling: Initial development isolates preferences/notifications; private AI memory and task-data attribution must not be claimed as completed. Task summaries must resolve recipient actor or omit personal tasks.
Ruling: Existing shared administrator settings remain available; no automatic broadcasts to new members.

Completion ledger:
- Account-fenced SQL/API, UI and worker implemented and verified with isolated tests.
- Existing read-key owner migrated, schedules retained, legacy duplicates suppressed.
- Production DB/server/Hermes and signed desktop release completed.
- Remaining user-dependent verification: installed app redirected to login; request sent for user login. Private AI memory/instructions remain explicitly deferred.
