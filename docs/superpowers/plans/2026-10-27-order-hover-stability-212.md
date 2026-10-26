# 0.212.0 stable order hover

User requested removing the slight bottom line and shaking when hovering orders.

The existing normal row rule removed its bottom border while the hover rule restored a complete 1px border, changing row height. Hover also added an outlined whole-row pseudo-element. This CSS-only change reserves a constant 1px transparent border, removes hover shadow/outline and movement, and keeps a quiet background response. Selected-order borders and keyboard focus remain.

Three steps: CSS fix, source/installed UI verification, signed update publication. This does not complete stage 4 of the separate performance plan (3 of 6 complete).

Visible isolated source Electron test passed: 24 hover round trips across light/dark themes; all order rectangles and scroll geometry unchanged; no hover outline; checkbox selection toggles on repeated clicks. The test uses visible rows so Playwright's own scrolling to an offscreen row is not confused with layout instability. No real order writes.

Evidence: D:/GPT/Temp/moaon-hover-stability-212. Installed package, phase-color regression and public release verification are recorded separately there. Only CSS and version metadata changed in the packaged application.
