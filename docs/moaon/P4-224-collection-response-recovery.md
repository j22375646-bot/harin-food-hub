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

## Final installed and public release evidence
- Final release 0.223.0: desktop/dist/distribution-20261028-041827-956. Earlier build candidates were not published.
- Package verification PASS: 166 exact source files; app.asar SHA256 973bbc6f612515be3ac34c56cdb0278385ebfc2c4b5f93bf7451f86c6266648a.
- Local installed release/current.json/shortcuts point to D:\GPT\Apps\Moaon\releases\0.223.0; existing user app processes preserved. Restart after active shipment work completes.
- Installed real Main transport module + preload + UI in a visible right-monitor isolated fixture: automatic timer recovery PASS, one initial lost-response POST and two GETs, zero additional POSTs, existing row retained, completed result with worker offline stays complete, retry unlocked, new list automatically applied. Recovery layout widths 1440/1040/900 no overflow; old applied-list suffix suppressed. No real order writes.
- Installed standard collection/list application regression PASS, including selection and issuance deferral, existing-list retention, error retry, themes and three widths.
- Installed three-channel diagnostics regression PASS: 11 existing scenarios across three channels, light/dark and three widths; no technical error codes exposed, equal chip heights and no overflow.
- Public GitHub moaon-stable published; Ed25519 feed signature verified, installer HTTP 200 and GitHub digest matches. Bytes 114473160; installer SHA256 747d67157563ae7faae3e49faa754db8c9127666e32a3af403966d97b32d2a26. Authenticode remains NotSigned.
- All three stages of this recovery follow-up complete. The prior six-stage performance roadmap remains complete. Live authenticated use of the new receipt protocol begins after the user restarts into the new app; the simulated response-loss UI test is not represented as a production-user operation.
