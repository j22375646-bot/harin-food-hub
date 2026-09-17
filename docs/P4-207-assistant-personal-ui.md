# P4-207 Assistant personal settings UI

Desktop0.167.0, server remains1.84.0. Assistant landing opens personal notifications. Shared administration and knowledge/help navigation use disclosure groups. Existing save and permission boundaries remain in place.

The personal view shows the current account, saved schedules, recipient proof status, and six consistent cards (five briefing bots plus new orders). Verified connection details start collapsed; bot links, two-step verification and unlink remain available inside. Cards use readable time inputs, native checkbox semantics styled as toggles/day chips, and clearly labelled test buttons. Unsaved changes activate the save bar; without edits it stays in normal flow. Shared Moaon typography/lavender tokens and balanced full borders are retained; motion only animates toggle state and respects reduced motion.

Permission-dependent routes are hidden until account identity confirms OWNER; unauthorized accounts retain personal settings/help. No token, schedule, database or server automation was changed by this UI phase.

Verification: source and packaged Electron account A/B, save/link/verify/unlink, stale response, common-navigation reopening,700/1660 light/dark layout checks;5 desktop request/queue regressions. Installed production login remained expired before release: login page visible with password field. Automated tests use labelled sample accounts, not a production login.
