# Tracking-based delivery stages — server 1.87.2

## Problem and behavior
Cafe24 N30 and other channel shipping/completion states previously overrode carrier evidence. Invoice registration alone therefore moved reserved parcels into Shipping.

Seller delivery now uses successful carrier observations: ACCEPTED/NOT_FOUND or missing/failed observations remain WAITING_FOR_CARRIER; IN_TRANSIT becomes SHIPPING; DELIVERED becomes DELIVERED. Cancellation still wins. Invoice mismatches do not supply delivery evidence. Channel shipping rows without a supported invoice remain visible in waiting and cannot be reissued.

Page counts and scope selection use the normalized stage consistently. Channel-only shipping badges were removed. Pending/failed tracking refreshes retain the previous successful observation for the same invoice, with its original checkedAt and a refresh-status note. Retrieval remains bounded to metadata plus selected payloads.

## Evidence
- Regression cases reproduced channel N30 incorrectly overriding accepted tracking before the fix.
- 115 targeted tests passed, including all three seller channels, cancellation, mismatched invoices, tracking refresh and dispatch guards.
- Installed desktop 0.176.1, isolated visible Electron window on right display: corrected server-model fixtures rendered waiting, moving and delivered scopes. No real shipping writes. This is not an authenticated live-user UI check.
- Production SQL confirmed HR-C24-528CDB39, HR-C24-4905086B, HR-C24-ED3E5887 are N30. Latest tracking operation metadata contains successful reads. Carrier payloads were not independently decoded in this run; no claim is made that these three parcels currently have no physical movement.
- Local default Turbopack build cannot resolve the existing node_modules junction outside the workspace root; webpack validation is used instead.

## Limits
Uses stored tracking results, not continuous carrier push. The existing supported tracking connector is ePost; unsupported/missing tracking does not prove movement. Older channel-completed orders without carrier proof can return to waiting until tracking is available. Rocket Growth remains outside the seller shipping workspaces. No channel status, invoice or delivery data was manually rewritten.

## Release
Pending production verification.
