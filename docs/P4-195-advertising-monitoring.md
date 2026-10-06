# P4-195 advertising automation follow-up

Released: server 1.74.0, desktop 0.156.0.

- Previous-month report on the second day at the existing configured time; date boundary covered in isolated PostgreSQL.
- Daily recent seven days versus prior seven days; equal campaign sets, complete observations, minimum 30 clicks and KRW 10,000 in each window. Warn at 30% cost/CPC increase or ROAS decrease. Thresholds are operational filters, not statistical significance. Partial/insufficient inputs hold; no fabricated zeros.
- External Hermes pulse check in the existing Vercel Naver marketing cron, daily approximately 07:00 KST. Fifteen-minute stale threshold applies at check time, not a fifteen-minute check interval. Independent of Hermes host, dependent on Vercel/database/Telegram. Transition alerts are at-most-once; ambiguous sends require investigation.
- Owner-authenticated manual change/monitor checks and visible settings/history/guide. Existing daily/weekly 09:00 settings preserved; monthly/change/watchdog enabled after install.
- Live monitoring exposed a legacy heartbeat reference. Corrective migrations now read the current multi-bot pulse for both watchdog and management menu. An initial stale test alert was false; subsequent healthy state and recovery delivery were verified.

Validation:
- 459 desktop regression tests, 11 advertising unit/integration/isolated SQL tests; Python menu 6 tests.
- Source and packaged Electron UI: schedule persistence, thresholds, mobile-width overflow. Installed 0.156.0 on right display without focus theft; dark theme inspected.
- Live change job 67878961-88da-4b6a-8b19-974b2d45829c: SUCCEEDED, 231/231 observations, Sep 9–15 vs Sep 2–8, cost +41.1%, notification SENT. This indicates cost change, not lost profit or a bid recommendation.
- External manual check: HEALTHY with current pulse; recovery SENT. Monthly future scheduled execution has not yet occurred; isolated date test validates September full-month period on October 2.
- Production READY, x-harin-version 1.74.0, unauthenticated cron 401. Hermes service success, timer active. Signed stable 0.156.0 published.

Remaining roadmap: campaign-specific filters, report revisions, finer-grained external monitoring. No advertising mutations added.
