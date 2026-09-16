# P4-197 same-period advertising revision comparison

Server 1.76.0; desktop 0.158.0.

The authorized worker claim returns its own succeeded parent's stored summary. A new revision stores before/after comparisons alongside the new report; the parent is unchanged. Campaign sets, dates, observation completeness and expected coverage must match for numeric deltas. Unknown values stay unknown; data additions/losses are labeled. Zero baselines never produce infinite relative percentages. ROAS/CTR absolute differences use percentage points. The interface explains that re-querying the same period is not a comparison of different performance periods and does not establish the cause of a change.

Desktop history contains a readable comparison table with collection times and coverage. HTML exports include the comparison; Telegram completion and report details include a compact summary. Existing reports created before this release remain unchanged; another revision creates the comparison.

Validation:
- 17 advertising unit/integration/isolated database tests, 459 desktop regression tests, 8 Python menu tests passed.
- Packaged Electron tests verified comparison rendering, +50%p display, 700/1660 layouts and settings persistence. Installed 0.158.0 launched on right display without focus theft; actual dark-theme comparison visually inspected.
- Live job 1739c09b-c7c1-47f6-8f03-eaa903b772e8 succeeded, Telegram delivery SENT. Parent ede8283a-5ad1-4920-b8cc-febe11713b46 preserved. Original and new coverage 33/33, all compared metrics unchanged. Original query 2026-09-16T01:34:29.522Z; new query 2026-09-16T01:54:31.489Z.
- Production READY; x-harin-version 1.76.0; unauthenticated cron remains 401. Managed Hermes integration updated and timer active. Signed stable 0.158.0 published.

Changes with nonzero deltas, missing values and mismatched scope were verified in isolated tests, not by altering live advertising data. No budget/bid mutations.
