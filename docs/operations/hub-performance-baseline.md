# Hub date processing CPU baseline — 2026-09-07

This is a deterministic synthetic benchmark of production JavaScript builders, not live browser or end-to-end navigation performance. It reads no database, sends no requests and contains no personal order data. Runtime: Node v24.19.0, win32. Baseline production code: `4cf5dcf` (Task 1 PWA changes do not affect these functions).

Run from the repository root with Node 24:

```powershell
node scripts/benchmark-hub-date-processing.js
```

The script runs each case five times, verifies deep equality between samples, and hashes the full JSON output with SHA-256. Elapsed values measure only builder execution; fixture creation, module import, equality checks and hashing are outside the measured interval. There is no discarded warm-up sample. Machine load and concurrent tasks affect these samples; no time threshold is a test gate.

All cases use `asOf: 2026-09-07T10:00:00Z`. Main uses 2,000 synthetic NAVER PAYED orders, each with `order_date: 2026-09-07T01:00:00Z` and `paid_amount: 30000`. Unified cases use 1,000 such orders, with either PAYED or DELIVERED status. Shipping uses 2,000 inputs alternating Friday 15:00 and 15:01 KST, with Monday September 7 a known holiday, plus one cutoff schedule.

| Case | Before samples (ms) | After samples (ms) |
| --- | --- | --- |
| Main sales, 2,000 orders | 229.499, 212.853, 206.569, 224.839, 272.282 | 7.099, 6.103, 4.514, 4.605, 6.844 |
| Unified paid, 1,000 orders | 274.684, 284.094, 259.188, 200.303, 214.537 | 43.815, 23.173, 27.871, 33.976, 23.338 |
| Unified completed, 1,000 orders | 445.494, 313.965, 308.221, 292.170, 267.131 | 33.667, 37.609, 35.997, 28.433, 26.850 |
| Shipping, 2,000 estimates | 401.069, 498.828, 394.613, 390.918, 415.450 | 46.309, 62.219, 37.930, 41.653, 35.914 |

The full output hashes below are identical before and after. Main remains 2,000 orders / 60,000,000 revenue. Each unified case retains all 1,000 orders and 30,000,000 amount; paid visibleDefaultTotal is 1,000 and completed visibleDefaultTotal is 0. Unified window remains August 9–September 7, 2026. No rows or fields were removed to obtain these timings.

| Case | Before = after full-output SHA-256 |
| --- | --- |
| Main sales | `53eb9a552c7081ec9b1e81b0973f60cedb49dfe0bead04a47c7a04510189dc80` |
| Unified paid | `2e7bba4330c51a9c128a56d03a88949c41bde7049f226bac0733dd3e2574192d` |
| Unified completed | `98d3e47ea50352e1253dfd3226228fd5799be820a731b5d6f6a283dbc0a42451` |
| Shipping | `853b3d12b354509ef7180a910d4e39bcc10ecc11b183504b3b91459e920cab97` |

Only fixed `Intl.DateTimeFormat` instances moved to module scope: one in sales history, three in business calendar, two in unified orders. Locale, options, parsing, validation, cutoff and holiday algorithms remain unchanged. This retains the existing distinction that a shipping estimate includes 15:00 in same-day shipping while the cutoff countdown advances at exactly 15:00. Existing null handling is also preserved: sales treats null as invalid; calendar Date parsing treats null as the Unix epoch. Formatter reuse stores neither business results nor network responses.

Verification:

- RED: `node --test test/hub-date-performance.test.js` — 4 behavior tests passed, 3 resource tests failed. Sales constructor count grew from 3 to 124 across batches. Calendar/unified already constructed 8/7 formatters in the first two-row batch.
- GREEN: `node --test test/hub-date-performance.test.js test/main-sales-history.test.js test/shipping-reference.test.js test/unified-orders.test.js` — 54/54 passed.
- Resource tests instrument real ICU construction in isolated child processes and call real builders for 2 then 120 rows, requiring no constructor growth after first batch and no more than six combined module formatters. No production test hook or wall-clock assertion is used.
- `npm test` — UI guard passed (existing debt 518); full suite 1,951/1,951 passed, 0 skipped, approximately 14.9 seconds. Node emitted `MODULE_TYPELESS_PACKAGE_JSON` warnings in existing mixed-module tests; focused suite had no warnings.
- `git diff --check` — passed. Git reports existing LF-to-CRLF checkout normalization warnings.

PWA build, authenticated browser navigation, production deployment, and physical phone behavior are separate controller checks and are not established by this CPU benchmark.
