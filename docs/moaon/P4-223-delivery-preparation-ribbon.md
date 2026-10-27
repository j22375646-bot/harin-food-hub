# P4-223 — Animated delivery-preparation ribbon

## User direction
Polish the delivery-information preparation strip with clean, gentle motion. The follow-up explicitly prefers the existing long progress bar and visible order counts; preserve both.

## Changes
- Keep the full-width progress bar and accurate done/total counts; make the count pill and typography clearer.
- Refine the compact ribbon with state-tinted surface, rounded icon and restrained border. Keep loading/complete/attention geometry stable.
- Loading: gentle icon orbit and a flowing highlight in the progress fill. Complete: SVG check draws once and a short opacity settle, then stops. No JavaScript animation timers added.
- Respect reduced motion for the spinner, orbit, fill and completion check.
- Existing preparation counts, eligibility, collection, invoice issuance and registration logic are unchanged.

## Source verification
- Visible right-monitor isolated Electron UI: loading/complete/attention, light/dark, widths 1440/1040/900; all passed. Full-width semantic progress and correct value/aria-busy checked, no overflow, height <=64px, completion animation single iteration, reduced motion and scope/session reset passed. Real order writes zero.
- Visual inspection of light complete and dark loading captures confirmed the long bar and visible count remain.
- Existing automatic collection/list application regression and final installed/signature evidence recorded below.

## Plan
This design follow-up has three steps: design/implementation, state/theme/width verification, installed release verification. The earlier six-stage performance roadmap remains complete and is not reopened by this UI follow-up.
