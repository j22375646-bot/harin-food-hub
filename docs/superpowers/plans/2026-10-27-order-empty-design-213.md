# 0.213.0 shared order empty state

User requested decorating the plain no-orders text and applying it to waiting and in-transit pages too. Shared rendering now covers all four scopes: ACTIVE, REGISTER, IN_TRANSIT, COMPLETED.

- Small parcel SVG, current tab/page caption, short heading and guidance, within a soft dashed-outline card using existing theme colors.
- Filtered results use a magnifier and a reset button connected to the existing search/filter reset control.
- Unavailable/unverified data uses an attention icon and connection guidance, never a fabricated zero-order result. Existing connecting spinner remains.
- The empty container is a status section rather than a paragraph, allowing valid heading, icon, paragraph and button markup. Order retrieval, collection and invoice behavior are unchanged.

Three stages: presentation, source/installed verification, signed release. Separate performance roadmap remains 3/6 complete; stage 4 rendering/selection/scroll preservation remains next.

Visible isolated source UI verified all four scopes in both themes, SVG presence, no overflow, working search reset and unavailable-not-empty classification; no real order writes. Source app.js syntax check passed. Installed-package and public release evidence is recorded separately under D:/GPT/Temp/moaon-empty-design-213.
