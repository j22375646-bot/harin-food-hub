# Moaon login outage recovery, 2026-10-26

## Confirmed cause and limits

- Supabase REST returned HTTP 503 / PGRST002 for dashboard_users, dashboard_sessions, and dashboard_login_attempts. Auth health alone remained 200 and was not sufficient evidence of recovery.
- Direct management SQL remained reachable before restart. A PostgREST authenticator query `SELECT name FROM pg_timezone_names` ran for over 45 seconds. This identifies an initialization bottleneck, but does not establish its underlying infrastructure cause.
- Production login logged reason=unavailable. Four unexpired, unrevoked session records remained; this does not prove that any particular browser still held its cookie.
- Proxy previously converted every session validation rejection to null and returned 401 or redirected to login, incorrectly classifying a storage outage as an authentication rejection.

## Changes and deployment

- Commit 9034a2b6 separates failed validation from confirmed invalid/expired sessions. Failure returns private/no-store 503 SESSION_CHECK_UNAVAILABLE with Retry-After:15, no cookie removal, no forwarded identity, and no login redirect.
- Commit f9ad7dec adds an eight-second validation deadline and aborts session lookup/touch queries. A late validation result cannot authorize a timed-out request. Existing real expiration, role restrictions and CSRF checks remain enforced.
- Production deployment dpl_FVLuZmoBfN8JCchm38WEPqQVKGN1 is READY and canonical production alias points to it. Next build and managed route checks passed.
- Supabase project was restarted through its normal Restart project control. No database version, plan, compute size, credentials or permissions were changed.

## Verification

- Server focused login/session suite: 39 passed, 0 failed. Includes storage outage, confirmed expiry, public login redirect, deadline, cancellation and late identity checks.
- Installed 0.207.0 app.asar with development Electron, separate profile, synthetic 503: UNAVAILABLE; synthetic persistent cookie retained; no OS focus acquisition. Displayed on right monitor. This is not an authenticated acceptance test of the user's installed EXE session.
- Existing isolated persistence test: cookie survives normal restart and is removed only by explicit disconnect. Read scheduler: 3 passed.
- Installed app.asar public production login GET, visible right monitor: passed; one password field, no horizontal overflow at 640/1040/1440 widths, no Node/bridge exposure. No password input or login POST.
- After restart: project ACTIVE_HEALTHY; Auth health, Auth admin user read, and all three dashboard REST reads returned 200 in approximately 0.3–0.6 seconds.
- Stored-order read model: PASS, 166 orders in 3,407 ms; ACTIVE 0, REGISTER 1, IN_TRANSIT 25, COMPLETED 140. Aggregate-only stored reads; no real collection, invoice issuance/registration, or writes to orders.
- User's actual login acceptance remains awaiting their reply. Existing session records are not substituted for real cookie verification.

## Plan position

Original performance plan: 6 stages, stages 1–3 completed, 3 remaining. This iteration is an interrupting login recovery fix, not completion of stage 4. Next performance work remains stage 4: narrower order-row rendering and preserving selection/scroll. The infrastructure initialization issue needs further observation if PGRST002 returns; the app classification fix does not guarantee database availability.

Evidence: D:/GPT/Temp/moaon-auth-recovery-20261026. Reports distinguish server tests, isolated installed-code verification, and real user-session acceptance.
