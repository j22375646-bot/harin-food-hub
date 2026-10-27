# P4-224 — Recover collection results after a lost response

## Confirmed problem
The app waits for a bounded response. If the initial POST exceeded that deadline, it lost the server-generated worker IDs, reset the platform display to uncertain, and had no identity for GET status recovery. The duplicate-request lock was correct but had no recovery path. Scheduled reads could continue, while the visible collection strip stayed delayed.

## Implementation
- Main creates a private UUID before dispatch. It is sent only to the fixed authenticated collection endpoint and never exposed in the renderer snapshot.
- Server first claims a durable receipt in moaon_order_collection_receipts. The primary key makes a repeated POST for the same UUID return the existing receipt rather than run another collection.
- The receipt stores only bounded channel outcomes and worker request IDs. It contains no customer address, phone, API key or provider error payload.
- New desktop requests use a compact response and omit the expensive full unified-order center query. Existing web/legacy requests retain their prior contract.
- GET by the exact receipt UUID can return initial processing state, later acquire the actual worker IDs, and recover Cafe24 plus Naver/Coupang outcomes. It never starts a collection or issues/registers an invoice.
- Main retains the original identity after timeout, confirms completion before releasing the lock, and preserves the existing order list. Receipt mismatch/read failure remains locked. An authoritative NOT_FOUND allows only a retry of the same UUID, protected by server uniqueness.
- Visible recovery is polled automatically and shows a Korean result-checking label with the progress button available. An older applied-list message is suppressed during the new recovery cycle; aria-busy remains a proper boolean.
- Confirmed completed channel results remain complete even if the worker heartbeat is currently offline. Unknown/missing queue results are never fabricated as success.
- The integrated performance gate now includes the response-loss recovery scenario.

## Server and DB verification
- Relevant server catalog/recovery/route tests: 26 passed. Covers durable claim, duplicate POST while the first is running, GET progress/completion, no full-center query, exact worker linkage, private error removal, missing results, invalid input and unauthorized requests.
- Production migration applied through Supabase. RLS enabled; anon/authenticated direct reads denied; service_role select/insert/update granted.
- SQL service-role insert/update verified inside a rollback transaction. Verification row count afterwards zero.
- Actual production-project PostgREST read of the new table returned HTTP 200 using the existing local server configuration; credentials were not printed or changed.
- Server deployment dpl_AXKrvK8ZPBut7VfH2su8vuSLSM8T READY on canonical harin-cafe24-sync.vercel.app, source c8876c5ec058908376eb5dcb2547241f3c75fcc2.

## App source verification
- Full app suite: 572 passed before the final worker-offline completion edge case; final relevant connection/collection/recovery suite: 149 passed, including that edge case.
- Visible right-monitor isolated Electron source test: one lost POST response, two automatic GET checks, zero additional POSTs, existing orders retained, completion releases retry, change applied automatically to the list. No real order issuance/registration. The final installed run additionally checks completed recovery with worker offline and layout widths.
- Other test/build candidates are not release proof. Final payload, installed test and signed public feed are recorded below.

## Limits and progress
This follow-up has three stages: diagnose, implement/test server+Main+UI, installed release verification. Earlier six-stage performance work remains complete. Durable recovery applies to requests made with the new protocol; old client requests had no receipt UUID. An existing running app must restart after active shipment work to load the new release. Unknown results stay guarded rather than being declared successful just because time passed.
