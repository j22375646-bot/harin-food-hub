# P4-210 — Signed-in assistant visual audit and polish

Final desktop release: 0.171.0. Server unchanged at 1.84.0.

Inspected the installed signed-in app across all 13 assistant tabs, not only mock screens. Read-only tab navigation; no live save, send, approval, order or report generation was performed.

Changes:
- Consistent readable helper text, heading hierarchy, label spacing, buttons and checkbox sizing.
- Advertising report dates in paired fields; automation options in responsive cards.
- Bot cards no longer stretch to the tallest adjacent card; editors use consistent hit areas.
- Menu editor rows and Telegram preview use separate visual groups with aligned reorder controls.
- Case summaries show Korean channel labels, distinct titles and status labels.
- Review empty states, selected filters, permission form spacing and full-width guide alignment improved.
- Narrow navigation wraps whole buttons rather than splitting Korean names.

Evidence:
- D:/GPT/tmp/p4210-live-before.json: signed-in initial 13-tab inspection.
- D:/GPT/tmp/p4210-live-results.json: 78 signed-in layout checks (13 tabs x 700/1060/1660 widths x light/dark), zero overflow and page errors.
- D:/GPT/tmp/p4210-after-*.png: actual account screenshots, kept outside repository.
- Isolated Electron regression verifies account boundaries, link/verify/unlink/save, delayed responses and contextual guides. Package matches 149 source files.

The account display name `???? OWNER` comes from stored account data, not a font/rendering error. It was not silently renamed by this UI change.
