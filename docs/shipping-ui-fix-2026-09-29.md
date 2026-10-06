# Shipping state and login chrome fix — 2026-09-29

Source: `a5f92d2`. Server: 1.87.4. Desktop: 0.184.0.

## Causes and changes

- Confirmed Coupang/Naver `DELIVERING` was incorrectly downgraded when postal tracking was absent or still at acceptance. Preserve channel-confirmed movement; Coupang `DEPARTURE` and Cafe24 invoice upload alone still require movement evidence.
- Naver's sibling `delivery.trackingNumber` and carrier were omitted. Preserve the delivery object and normalized fields.
- Coupang detail jobs took about 36 seconds in the observed live queue, but the desktop deadline was 15 seconds. Allow bounded 45-second polling, retain provider contact fallback, and show a bounded renderer retry state.
- Complete delivery details did not refresh issuance eligibility. Recheck the server once after retrieval. Never locally grant permission or bypass server blocks.
- The login brand extended below the secure view's 48px top boundary. Put logo and title wholly within that strip and hide the duplicate entry brand.

## Verification

- Server suite: 3,176 passed. Production build passed locally and on Vercel.
- Desktop unit suite: 476 passed.
- Source and packaged Electron checks: delivery refresh/rejection, detailed delivery UI, and inline login geometry in light/dark themes. Synthetic fixtures only; no shipment executed.
- Package integrity: 159 declared files matched source. Ed25519 release verified and published to `moaon-stable`.
- Installed `D:\GPT\Apps\Moaon\releases\0.184.0` reported 0.184.0, authenticated live mode, right monitor position `(2562,344)`.
- Canonical `/login`: HTTP 200, `X-Harin-Version: 1.87.4`. Deployment `harin-cafe24-sync-31ez3rqbf-j22375646-6156s-projects.vercel.app` READY. Initial post-deploy error-level scan returned no matching logs; this is not continuous monitoring.
- Live server response: four Naver orders from September 25–26 moved from REGISTER to IN_TRANSIT. IN_TRANSIT total became five. At verification, REGISTER contained four orders including a newly registered Coupang order; ACTIVE contained two externally fulfilled Naver orders.
- Three earlier Cafe24/Coupang pending orders were re-queried and remained carrier WAITING; they were not force-marked as moving.

## Worker deployment

The managed worker had a different full-file hash than the local checkout. Only the three matching Naver mapper expressions were patched; unrelated remote code was preserved. Original file is retained as `lib/naver-commerce/sync.js.pre-shipping-20260929` under `/opt/harin-food-hub/releases/managed-20260913`.

Active-job guards postponed restart while collection was running. Syntax and synthetic mapper checks passed, then `harin-coupang-worker` restarted and reported `MAPPER_PASS active`. A read-only provider resync was queued with idempotency key `shipping-delivery-fix-20260929` to refresh saved order data. No invoice issuance/registration was executed by the agent.

The resync completed SUCCESS at 2026-09-29 05:45:14.882 UTC. All four affected DELIVERING orders now have nonempty invoice numbers, compared with zero of four before the worker patch. Completed orders in the same date range also recovered their invoice fields.

## Boundaries

Carrier acceptance is not proof of physical movement. Real shipment issuance was intentionally not used as a test. Existing unrelated untracked files were preserved and excluded from the production deployment archive. Local installer publishing retains the current and previous app versions (plus any running older version).
