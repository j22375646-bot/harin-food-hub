# 0.213.0 shared order empty state

User requested decorating the plain no-orders text and applying it to waiting and in-transit pages too. Shared rendering now covers all four scopes: ACTIVE, REGISTER, IN_TRANSIT, COMPLETED.

- Small parcel SVG, current tab/page caption, short heading and guidance, within a soft dashed-outline card using existing theme colors.
- Filtered results use a magnifier and a reset button connected to the existing search/filter reset control.
- Unavailable/unverified data uses an attention icon and connection guidance, never a fabricated zero-order result. Existing connecting spinner remains.
- The empty container is a status section rather than a paragraph, allowing valid heading, icon, paragraph and button markup. Order retrieval, collection and invoice behavior are unchanged.

Three stages: presentation, source/installed verification, signed release. Separate performance roadmap remains 3/6 complete; stage 4 rendering/selection/scroll preservation remains next.

Visible isolated source UI verified all four scopes in both themes, SVG presence, no overflow, working search reset and unavailable-not-empty classification; no real order writes. Source app.js syntax check passed. Installed-package and public release evidence is recorded separately under D:/GPT/Temp/moaon-empty-design-213.

Installed 0.213.0 app.asar passed the same visible test using development Electron, a separate synthetic profile and right-monitor placement; this is distinct from the authenticated running EXE session. The test window explicitly labels its data as isolated verification. Search-contract regression: 2 passed. Package verification: 165 files, SHA256 9f66a0c6b53a49d4daa062e647a0914d1dfecd8e1777ad28d9dfe9dd3afe0292. Distribution desktop/dist/distribution-20261027-025913-327, installer 114,465,779 bytes, SHA256 71f967d645e19b9881f8be30c0a73398cb6c8796a6ff02adcc10e6f76c18c532. Pinned Ed25519 signing retained; Windows Authenticode NotSigned. Local release and launchers staged without forcing a restart of the user's app.
