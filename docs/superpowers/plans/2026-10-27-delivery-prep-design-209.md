# 0.209.0 delivery preparation status design

User requested a redesign of the plain delivery auto-preparation text. Three steps: compact state component, source/installed visual verification, signed update publication. This is a UI refinement outside the separate 6-stage performance roadmap (3 complete, 3 remaining).

The status is now a compact card: icon, short title and caption, tabular progress count, and a thin progress track. Preparing uses a spinning ring; completed uses a check; partial completion shows a warning icon and an explicit needs-check count. Existing app theme tokens supply the palette. Reduced motion disables spinning and progress transitions. Backend concurrency details are removed from display copy.

No delivery transport, worker count, selection eligibility, invoice issuing or registration logic was changed. Current progress callbacks supply the new DOM presentation. Leaving the active order scope hides it and changing session clears it.

Source visible isolated Electron verification passed for all three states in light and dark themes, height below 100px, no overflow, reduced motion and scope/session reset. No real order writes. Installed-code acceptance and release verification are recorded in D:/GPT/Temp/moaon-delivery-design-209.

Files: desktop/ui/app.js, desktop/ui/ui-polish.css, desktop/test/delivery-prep-design-ui.cjs. Version 0.209.0.
