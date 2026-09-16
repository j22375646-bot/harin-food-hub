# P4-199 assistant workspace and configuration verification

Desktop 0.160.0; server 1.78.0.

Grouped the twelve existing navigation destinations into daily work, assistant settings, and knowledge/help. Reused existing view/save handlers. Overview now reads BOT_LIST and AUTO_READ: saved/applied revisions and a fresh runtime report determine the displayed state. Missing or stale evidence remains unverified. Local briefing drafts are explicitly separated as previews. Obsolete disabled onboarding placeholders are replaced with working links. Bot connection forms are expandable. Shared Moaon palette, light/dark themes, reduced-motion support and 700/1660 layouts are preserved.

Verification:
- 459 desktop regression tests passed.
- Source and packaged Electron navigation/apply-state/preview/responsive tests passed; existing case settings/actions test passed.
- Real saved-login desktop form submitted unchanged WORK bot settings: revision 1 -> 2. Subsequent BOT_LIST showed applied_revision 2, RUNNING at 2026-09-16T02:48:49Z.
- Real unchanged WORK automation form saved revision 0 -> 1; time 09:00 and enabled schedule preserved. Server AUTO_PULSE returned revision 1 and the same settings.
- Compared all five server profiles to authorized BOT_CONFIG without printing credentials: revision, token, recipient, allowed users and SOUL response instructions all matched, both before and after the save test.
- Timer active; service completed successfully at 11:48:53 KST, exit 0. No test Telegram notifications sent and no operational order/customer/ad writes performed.
- Production version header 1.78.0 verified; unauthenticated cron 401. Signed stable 0.160.0 published. Installed app launched on right display without focus theft.

Settings scope: bot response/connection settings sync through Hermes (~2 minutes), scheduling uses the worker's current stored configuration, menu configuration is fetched on a subsequent menu request, and local briefing previews do not change scheduling. This test does not claim a fresh real 09:00 delivery or evaluate generated AI response quality.
