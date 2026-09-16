# Advertising assistant implementation plan

Approved scope: connect Naver read APIs to Telegram report requests, persistent report storage, schedules, failure notifications, Moaon settings and guides. No advertising mutations.

1. Add a strictly scoped advertising contract, owner/worker RPC authorization, idempotent jobs and schedule settings. Exercise with isolated PostgreSQL tests before migration.
2. Add Naver-only collection and report generation. Validate observed fields and date ranges, retain unknown values, distinguish ad-attributed revenue from profit. Report creation must not execute the legacy cross-channel action generator.
3. Connect the existing Hermes timer to claiming jobs and at-most-once delivery. Failed/uncertain jobs stay visible. Add Telegram period actions and archive, preserve existing bot menus.
4. Add advertising settings in Moaon: manual periods, fresh collection, daily/weekly schedules, failure notification switch and execution history. Add detailed guidance.
5. Run unit/SQL/Python and Electron UI checks, verify live Naver access and one report, package/sign/release, install and show on secondary screen, verify production, commit/push.

Later increments from the approved roadmap: campaign selection and statistically guarded change detection, monthly reports and revisions, independent external heartbeat monitoring. Do not present these as active until implemented and verified.


Second increment (2026-09-16): monthly previous-month reports on day 2; daily recent-seven versus previous-seven day change monitoring with minimum spend/clicks and comparable campaigns; daily external Hermes pulse check through the existing 07:00 KST Naver cron. This is daily monitoring, not real-time availability monitoring. Preserve existing preferences; new switches start disabled pending live verification. Operational thresholds do not imply statistical significance. Test dedupe, incomplete data, month boundaries and stale/recovery transitions; verify installed desktop and deployed cron authorization.

Third increment: campaign selection snapshotted per queued job; explicit parent-linked fresh report revisions with repeat-submit deduplication; desktop and Telegram actions. Verified against real one-campaign and all-campaign revision jobs. See P4-196 report.
