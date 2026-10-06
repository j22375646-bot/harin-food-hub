# P4-57 task 2 — Desktop finance cards report

## Outcome

- Added the main-process-only fixed `GET` finance read for the immutable Harin tenant.
- Added a strict bounded transport projection for `month`, `generatedAt`, and the three finance metrics. Values remain finite `number` or `null`; no coercion or fallback zero is used.
- Added a no-argument preload/IPC method with trusted-renderer enforcement, in-flight deduplication, deadline/cancellation, and generation-based logout discard.
- Added the Today finance panel before the orders overview with the three requested Korean labels, explicit `PARTIAL`/`BLOCKED` treatment, true zero and negative rendering, month/check time, and the rolling-balance estimate warning.
- Finance loads only after a live Today entry, reuses a five-minute revisit cooldown without polling, supports manual refresh, and is cleared/hidden on logout.
- Bumped desktop package and lock version to `0.41.0` and included `finance-transport.cjs` in packaged files.

## TDD evidence

### RED

Command:

```text
node --test test/finance-transport.test.cjs test/connection.test.cjs
```

Observed: 5 failures. The finance module and connection method did not exist, and the exact finance GET was denied by the remote-request policy.

### GREEN

Scoped transport/lifecycle command:

```text
node --test test/finance-transport.test.cjs test/connection.test.cjs
```

Observed: 91 passed, 0 failed.

Real Electron UI command:

```text
node test/finance-ui-smoke.cjs --isolated
```

Observed: PASS for zero, negative, partial, blocked, invalid, error, five-minute revisit cooldown, manual refresh, 1440/1040 widths, light/dark themes, and logout clearing.

Requested desktop full test (run once):

```text
npm test
```

Observed: 241 passed, 0 failed.

`git diff --check` passed; Git printed only the repository LF-to-CRLF working-copy warnings.

## Task files

- `desktop/finance-transport.cjs`
- `desktop/connection-policy.cjs`
- `desktop/hub-connection.cjs`
- `desktop/preload.cjs`
- `desktop/ui/index.html`
- `desktop/ui/app.js`
- `desktop/ui/styles.css`
- `desktop/test/finance-transport.test.cjs`
- `desktop/test/finance-ui-smoke.cjs`
- `desktop/test/connection.test.cjs`
- `desktop/package.json`
- `desktop/package-lock.json`

## Remaining concerns

- No live credential, production endpoint, packaged artifact, installer, build, deploy, or push was exercised in this task, as requested.
- The balance card is intentionally labelled as an estimate and explicitly says actual settlement/deposit is not proven.
- `desktop/test/installed-finance-smoke.cjs` belongs to parent release verification and was intentionally not staged.

## Final review fix wave

- Finance reads now own a separate abort controller. Order scope, channel, and filter generation changes discard only the stale finance result as `CANCELLED`; they do not turn the ancillary read into a global disconnect or clear live orders.
- The renderer promotes only genuine finance `LOGIN_REQUIRED` and `FORBIDDEN` results into global authentication state. Ancillary cancellation/unavailability remains local to the finance panel; explicit logout still clears and hides the panel.
- The exact finance URL is permitted only while `readFinance` owns the active request. The permit is absent before the request and cleared after success, failure, timeout, or abort.
- `generatedAt` now requires an ISO-8601 date-time with seconds and an explicit `Z` or numeric offset; permissive date-only parsing is rejected.
- RED evidence: the focused suite failed on navigation returning `DISCONNECTED`, an always-open finance allowlist, and acceptance of `2026-09-09` as a timestamp.
- GREEN evidence: focused finance tests passed 8/8; the Electron UI smoke passed with pending-finance navigation preserving live orders; the final desktop suite passed 244/244.
