# Desktop 0.182.0: invitation and waiting-order worklists

- Settings has a dedicated invitation tab. Its button uses trusted main-process clipboard IPC to copy the public stable release URL and Windows installation/login instructions. No recipient is contacted and no business access is granted by the link.
- Waiting/completed/in-transit selections no longer display issuance eligibility warnings or automatic issuance button. Active-order safeguards and document validation remain.
- A4 preview previously fixed five orders per page and rejected overflow. It now tries five down to one per page, preserving readable font sizes, exact order/content integrity checks, fresh-data validation, and explicit print confirmation. Orders too large for a single page remain blocked.
- Shipping result text wraps and allows buttons to flow without clipping. Waiting status prints in Korean.
- Verification: 475 desktop unit tests passed. Electron fixture with 12 long multi-item waiting orders reduced to four orders per A4 page, retained all 12 rows, no auto-print, preserved sandbox, and verified the real invitation clipboard output. No live order write or physical printer output performed.
- The reported live 12-order payload was not available; the overflow path was reproduced with synthetic long bundle orders. No claim that external registration latency or the earlier two Cafe24 registration outcomes have been resolved.

Active-order Electron fixture additionally verified selectable Naver orders, disabled issuance, direct issuance IPC rejection, and successful mixed-channel A4 preview.
