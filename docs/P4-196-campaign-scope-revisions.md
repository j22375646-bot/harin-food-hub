# P4-196 campaign scope and report revisions

Released server 1.75.0 and signed desktop 0.157.0.

- Owner-authenticated campaign catalog, explicit selection, all-campaign default. Preserve saved schedule configuration. API only reads selected campaign statistics; missing IDs fail closed.
- Queue rows snapshot campaign IDs at insertion. Manual dedupe includes canonical selection. Older manual dedupe values migrated to retain all-campaign idempotency.
- Revisions retain original date range and saved scope, require a succeeded parent within 90 days, and create one child per parent. Original report remains. Subsequent revision starts from the child. Private Telegram authorization unchanged.
- Desktop archive and Telegram report details offer revision actions. Report HTML and history display scope and parent. Revisions create a fresh report; change-detection reports revised this way become ordinary fresh summaries, not a new scheduled change alert.

Verification:
- Advertising tests 12, desktop regression 459, Python bot menu 7 passed.
- Source and packaged Electron UI verified, including saved campaign selection and responsive layout. Actual installed 0.157.0 launched on right display without taking focus; dark theme visually inspected.
- Actual Naver catalog: 33 campaigns.
- Live one-campaign job 062c009e-d126-4eae-b9fb-ff47305aadce: SUCCEEDED, 1/1 rows, delivery SENT.
- Live revision ede8283a-5ad1-4920-b8cc-febe11713b46: SUCCEEDED, 33/33 rows, delivery SENT, parent 4b0dfda8-8969-4e2e-8e27-f3afe4b65405 preserved. Repeated submission yielded exactly one child.
- Temporary selection restored to original all-campaign scope immediately after enqueue; existing daily/weekly/monthly/change/watchdog settings retained.
- Production READY after transient authorization failure and verified-account retry. Hermes installer updated existing managed profiles; signed stable release published.

No bids, budgets or campaign activation settings changed. Finer-grained external monitoring and richer revision comparisons remain future work.
