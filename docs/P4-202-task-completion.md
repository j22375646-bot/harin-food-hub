# P4-202 - Complete task and checklist together

Server 1.80.1; desktop 0.162.1.

Root cause: COMPLETE only changed task.status, leaving unchecked children disabled in the completed UI. A BEFORE INSERT/UPDATE trigger now checks every child whenever status is DONE, in the same transaction for both desktop and Telegram writes. It is security-invoker with an empty search path and no public/anon/authenticated execution grant. Existing session, membership, revision and row locking rules are unchanged. REOPEN retains checked items, which can then be individually unchecked.

The migration repaired one existing active DONE task from 0/3 to 3/3. Original completion actor/time were preserved; revision advanced from 6 to 7. No incomplete task was completed. Deleted rows were not backfilled. The real installed UI shows three checked/disabled items and a 3/3 progress label.

Verification:
- 467 Node tests passed, including isolated Postgres trigger/backfill/rollback/reopen/mixed-check/empty-check tests and team auth/conflict regressions.
- Focused Electron completion test: partial -> complete all -> reopen with progress -> individual uncheck -> complete all.
- Production database has zero active DONE tasks with unchecked children.
- Production version header 1.80.1 verified.
- P4-201 real WORK image briefing test completed after login: photo delivered, action card bound to Telegram message 17, delivery SENT. Schedule unchanged; no customer-facing operational message sent.
- Packaged Electron completion test passed. Installed 0.162.1 launched on right display without focus theft and verified the repaired task. Signed stable 0.162.1 published.
