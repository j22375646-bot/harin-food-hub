# P4-198 operational follow-up tracking

Server 1.77.1; desktop 0.159.1. Supersedes the initial 1.77.0 / 0.159.0 per-item notification behavior after user feedback.

Tracks invoice-not-issued orders and unanswered inquiries by channel and source identifier. Missing records and source failures never imply completion. Users can mark an item in progress, snooze for 30 minutes, or resume tracking from the automation center and Telegram details. Ten-minute scans use stored Moaon data, not live channel refresh. Run and action history remain visible.

Terminology: 확인할 일 / 확인 항목. Each delivery claims all eligible pending updates atomically and sends one bounded, channel-separated summary with 전체 확인하기. Per-item actions remain in the list/detail menu. Each contributing event records the batch outcome; uncertain sends are not retried automatically. Recipient revision checks and quiet hours are preserved. This change does not merge scheduled briefings across bots.

Validation:
- Four source/contract/database/service tests passed, including four updates claimed together, no second claim, exactly one send, and uncertain delivery handling.
- Nine Python menu tests passed; callback identity and revisions preserved.
- Electron automation center settings/actions and 700/1660 layouts passed.
- Initial live verification registered three order follow-ups and one inquiry; duplicate scans did not create additional records. The initial four individual notifications were delivered before the batching correction. No existing notifications were deleted or resent to test the correction.
- No live order issuance, shipment, customer reply, advertising bid or budget changes.

Future automation phases (management recovery, recurring personal workflows) are not part of this release.

Release evidence: production x-harin-version 1.77.1 (unauthenticated cron 401); managed Hermes installer active; signed stable 0.159.1 published. Packaged UI verification passed. Installed app 0.159.1 opened on right display without focus; authenticated live read retained four active follow-ups.
