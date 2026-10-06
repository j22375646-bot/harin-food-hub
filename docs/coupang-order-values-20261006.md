# Coupang order totals and initial delivery capture — 2026-10-06

Root cause: seller orderPrice is the line total, but mapper multiplied it by shippingCount again. Unit price now uses salesPrice or derives total/quantity. Money objects, zero, missing price and mixed-item totals are covered. Existing raw evidence corrects read projections without blindly dividing amounts by quantity.

Production database repair: 77 orders/78 items inspected, 7 order totals and 8 item amount records corrected with original-value and updated_at guards; 15 updates, zero skips. Encrypted rollback backup: D:/GPT/tmp/coupang-amount-backup-1791261320901.json. Reported shipment 739639497195528: 176000 -> 88000; repeated audit after provider resync has zero differences.

Delivery information: mapper encrypts receiver fields from the original order list with the existing operation encryption, stores ciphertext in raw_data.moaonReceiver; unified read decrypts server-side, preferring existing authoritative order detail. Plain receiver is still stripped. No extra provider detail request if collection supplied complete data. Missing/expired source data continues through bounded detail fallback. Not every historical order provides an address.

Deployment:
- Canonical main 917cde9977ee1527d8eeb02b118368950f054821. Git-triggered Vercel production dpl_H2U8px2iBAHnkdqXKBSD6DsGDTZv READY; GitHub status for this SHA confirms same deployment. CLI direct deploy returned Not authorized; Git deployment succeeded.
- Worker /opt/harin-food-hub/current was 014c195, so did not fast-forward all unrelated newer code. Applied only mappers.js/order-values.js patch from above SHA on fix/coupang-values-20261006, resulting local commit 0b7c2de. Preserve this patch in future worker updates. Active sync and operation queues both checked empty before service restart. Service active and heartbeat ONLINE afterward.
- Read-only provider resync succeeded: 31 orders, 32 items. 12 stored rows have complete encrypted receivers (10 DEPARTURE, 1 DELIVERING, 1 FINAL_DELIVERY); one older ACCEPT row has no encrypted receiver. No invoice issuance/registration test.

Validation: relevant suite 148/148; build passed. Full suite 2610/2613: unrelated tenant barrier/recovery failures. Isolated retry 63/64, remaining existing tenant recovery-provider assertion fails; these modules were unchanged. Installed 0.186.0 UI synthetic fixture verified 88,000원 and 2개, no 176,000원. Actual database values were checked separately. No desktop code/release required.
