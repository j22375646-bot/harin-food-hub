# 0.209.0 delivery preparation status design

User requested a redesign of the plain delivery auto-preparation text. Three steps: compact state component, source/installed visual verification, signed update publication. This is a UI refinement outside the separate 6-stage performance roadmap (3 complete, 3 remaining).

The status is now a compact card: icon, short title and caption, tabular progress count, and a thin progress track. Preparing uses a spinning ring; completed uses a check; partial completion shows a warning icon and an explicit needs-check count. Existing app theme tokens supply the palette. Reduced motion disables spinning and progress transitions. Backend concurrency details are removed from display copy.

No delivery transport, worker count, selection eligibility, invoice issuing or registration logic was changed. Current progress callbacks supply the new DOM presentation. Leaving the active order scope hides it and changing session clears it.

Source and installed 0.209.0 app.asar visible isolated Electron verification passed for all three states in light and dark themes, height below 100px, no overflow, reduced motion and scope/session reset. Development Electron, separate profile, right monitor without focus; not the user's authenticated EXE session. No real order writes. Affected state/scheduler regression tests: 20 passed; app.js syntax check passed.

Build completed with normal build-distribution.ps1 under PowerShell 7. Package verification: 165 files, SHA256 84c9b02b4b4be12a03061470adef953c5b3aafe1fb6340cae6dfc54136367b2a. Installer: 114,464,633 bytes, SHA256 6d1cf4c4105745ce78f3e63abdd862016bd822007df52c313b6dc468eb95894e. Pinned Ed25519 update signature generated; Windows Authenticode remains NotSigned. Local package staged and launchers updated without closing the user's running app. Public distribution evidence is recorded in D:/GPT/Temp/moaon-delivery-design-209/public.

Files: desktop/ui/app.js, desktop/ui/ui-polish.css, desktop/test/delivery-prep-design-ui.cjs. Version 0.209.0.
