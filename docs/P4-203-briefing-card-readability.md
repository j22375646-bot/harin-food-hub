# P4-203 - Mobile briefing card readability

Server 1.81.0; desktop 0.163.0.

Replaced repeated text rows with larger task metric tiles and one table per channel. Order and inquiry counts remain separate columns; unavailable fields remain `확인 필요`. Removed repeated headings, formatted image timestamps in Asia/Seoul, and retained the key-owner task scope and source freshness notes. WORK, SOLO and AD use separate accents. Advertising metrics have larger tiles. Long content retains an explicit full-detail notice.

The app preview is explicitly sample data. Existing delivery, action binding, schedules and recipient settings are unchanged. Rendering remains deterministic from stored data; photo-send ambiguity does not trigger duplicate fallback messages.

Verification:
- 17 focused tests passed, including PNG rendering, grouping, missing values, Korean time, advertising delivery, multipart markup and no retry after ambiguous photo delivery.
- Source and packaged Electron automation UI checks passed in six width/theme combinations.
- Inspected the card at 360px width and rendered SOLO/AD examples, including unknown values.
- Signed stable desktop 0.163.0 published and installed on the right display without focus theft; installed preview inspected.
- Production version header 1.81.0 verified.
- Authorized WORK test d446a6be-5070-45c3-83b1-732d512cd4af reached SENT, Telegram message 18, with action card binding. Only WORK was live-delivered; SOLO/AD were rendered/tested with fixtures. User reading or clicking the new message has not been verified.

Evidence: D:/GPT/tmp/p4203-tests.log, p4203-ui.log, p4203-packaged-ui.log, p4203-publish.log, p4203-phone.png, p4203-ad.png, p4203-solo.png and p4203-installed.png.
