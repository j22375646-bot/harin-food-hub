# P4-205 - New orders only, daily image briefings

Server 1.83.0; signed desktop 0.165.0.

The case tracker previously notified DETECTED, RESOLVED, REOPENED and REMINDER events for both orders and inquiries. Grouping each scan still produced recurring notifications throughout the day. It now records all transitions but dispatches only ORDER/DETECTED once per stable channel/order identity. Legacy per-item dispatch is disabled. Same-scan new orders are grouped into one message.

Order timestamps are normalized with Korean timezone for timezone-less source strings. Only orders placed after notification activation, with a known timestamp, qualify. Existing backlog, missing timestamps, CS, reopen, resolve and snooze-expiry events do not notify. The migration skips previously pending events; history remains. The existing 08:00–20:00 sending window and approximately ten-minute scan interval remain.

Live configuration was changed through the installed owner's authenticated API:
- Case notification paused during migration/deployment and restored with the new-order-only policy.
- WORK daily 09:00 image briefing retained, generic count-change alerts OFF.
- AD daily 09:00 previous-day image report ON. Weekly, monthly, performance-change, failure and external watchdog notifications OFF. Campaign scope/thresholds preserved.
- SOLO/SUP/STUDY schedules remain OFF. No pending briefing snooze reminders existed.

Advertising image delivery was already implemented. Its successful reporting history and current image renderer/send path were verified; no extra test report or Telegram message was sent for this change.

Verification:
- 30 Node tests passed: isolated SQL state transitions, stale/unknown timestamp suppression, first-detection dedupe, legacy delivery disabled, mixed order/inquiry batch filtering, uncertain-send behavior, advertising and image rendering regressions.
- Source and packaged Electron cases settings/actions checks passed at 700/1660 widths.
- Production 1.83.0 verified; migration applied, zero pending non-new-order events.
- Signed stable 0.165.0 published and installed on the right monitor without focus theft. Owner-session UI verifies new-order switch ON and AD daily-only settings.
- Hermes timer active and last service run success/0. No simulated production order or customer write occurred.

Evidence: D:/GPT/tmp/p4205-tests.log, p4205-ui.log, p4205-packaged-ui.log, p4205-publish.log, p4205-installed-orders.png, p4205-installed-ads.png.
