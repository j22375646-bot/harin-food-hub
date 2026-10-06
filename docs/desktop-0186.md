# Desktop 0.186.0 — automatic delivery preparation

Shipment-before-issue pages automatically prepare missing Cafe24/Coupang delivery details after loading. No order selection or preparation button is required. This runs on loaded pages (20 orders per page); it is not an unattended server-wide historical backfill.

- Existing complete receiver data is skipped; missing details use at most three concurrent reads.
- Selection remains available while preparing. Shipping mutations stay disabled until preparation completes; order conditions are refreshed before issuing as before.
- One attempt per loaded order identity/address snapshot in the session. Failures remain check-required and can be retried explicitly. The attempt cache is bounded to 500 entries, never written to disk, and cleared on logout/auth changes.
- Results summarize ready and check-required counts. Successful reads trigger a single page refresh and preserve selected IDs.

Concurrency audit: desktop shipment transport is an authenticated API adapter, not a shared browser issuance form. However scripts/coupang-local-worker.js processPendingOperations awaits each processOperationRequest and claimNextOperation selects one row. Issuance remains sequential in this release. True parallel provider execution requires a separate worker concurrency change and deployment verification; no throughput claim is made here.

Validation: 477 desktop unit tests passed. Visible isolated Electron fixture uses 12 orders with only one selected, verifies automatic fetching of all 12, concurrency cap 3, one failed item without retry loop, explicit retry success, selection preservation and logout cleanup. No real invoice issuance or registration used as a test. Packaged/installed runs recorded during release.
