# P4-57 backend report

## Outcome

- Added read-only `GET /api/moaon/businesses/[tenantId]/finance`.
- Reused the Phase 28 main loader and main adapter; no finance formula was copied into the endpoint.
- Extracted the immutable legacy Harin owner check and reused it for both orders and finance.
- Kept authorization before the Supabase/main-loader read, repeated authorization after the read, and discarded results if workspace identity changed.
- Added no database writes, deployment, push, or client changes.

## Response contract

```json
{
  "ok": true,
  "month": "YYYY-MM",
  "generatedAt": "ISO-8601",
  "metrics": {
    "sales": { "value": 0, "status": "READY" },
    "profit": { "value": -1000, "status": "READY" },
    "balance": { "value": null, "status": "BLOCKED" }
  }
}
```

- `sales`: Phase 28 current-month payment sales. It is `READY` only when the loader's monthly pacing source is `READY`; a finite value from incomplete source evidence is `PARTIAL`.
- `profit`: Phase 28 calculated profit after the existing cashflow evidence gates.
- `balance`: Phase 28 rolling-30-day estimate. A present estimate remains `PARTIAL`; it is not settlement or payment actual.
- Metric values are finite numbers (including zero and negative values) or `null`. Missing/invalid numbers become `{value:null,status:"BLOCKED"}`.
- Only `READY`, `PARTIAL`, and `BLOCKED` are emitted. Raw rows, source names, reasons, tokens, and internal model fields are not returned.
- `month` prefers the loader's KST month, avoiding a UTC month-boundary mismatch.

## Authorization

The request must be a same-origin GET with exactly one valid `harin_dashboard_session` cookie, no query string, and a valid UUID path. Before any finance data access, the resolved context must pass `workspace.read` and satisfy all three bindings:

1. requested tenant equals resolved tenant;
2. tenant equals immutable Harin tenant `a3452bca-e259-40ed-a93d-b8bcc5c1b9e0`;
3. role equals `OWNER`.

The context is resolved and checked again after the finance read. Tenant, user, session, role, or membership-version drift prevents a successful response.

## Verification

Red phase: the two new test files failed because the finance request and summary modules did not exist.

Green/regression command:

```text
node --test test/workspace-finance-request.test.js test/workspace-finance-summary.test.js test/workspace-orders-request.test.js test/phase28-main-adapter.test.js test/financial-audit-regressions.test.js
```

Result: 42 passed, 0 failed. `git diff --check` passed (Git only reported the repository's LF-to-CRLF warning for the modified orders request file).

## Remaining concerns

- The endpoint intentionally invokes the existing full Phase 28 main loader (remote query budget 37). This maximizes formula/evidence consistency but is heavier than a dedicated financial loader. No extra HTTP hop was added.
- No live credentials or production server were used, so live auth/data behavior is not claimed.
- Full repository suite and Next production build were left to parent integration as requested.
