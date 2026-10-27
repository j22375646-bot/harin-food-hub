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

## Release evidence
- Source automatic collection -> change -> list application regression PASS; current selection/issuance deferral and error retention preserved.
- Version 0.222.0 built in desktop/dist/distribution-20261027-222539-355.
- Package payload PASS: 166 exact files, app.asar SHA256 f02bd2651130058f9ae530983adae9d21f1d4172ce7a756bf9f591ddf5e41109.
- Installed release/current.json/shortcuts updated to D:\GPT\Apps\Moaon\releases\0.222.0; existing running user processes preserved.
- Installed app.asar visible right-monitor design test PASS: all three states, both themes, widths 1440/1040/900, full-width bar, correct count/progress semantics, finite complete motion, reduced motion, no overflow, scope/session reset. All fixture data; real order writes zero.
- GitHub moaon-stable published, public feed Ed25519 verified, installer HTTP 200 and digest matches. Bytes 114472322, installer SHA256 9cf932dbacfa419591f712727ac1415b05a91b04de0d3b5a39c5cdefe7794db0. Authenticode remains NotSigned.
- All three design-follow-up steps complete. Restart after any active shipment work finishes to load the release in an existing user window. Earlier six-stage performance plan remains complete.
