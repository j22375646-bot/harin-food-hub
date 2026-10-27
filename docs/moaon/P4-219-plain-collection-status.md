# P4-219 — Plain-language collection status for all channels

## Scope
Remove technical error codes and HTTP numbers from the visible collection chips and their hover explanations. Keep the compact three-chip layout, colors, and motion. Apply the same diagnosis and guidance to Cafe24, Naver, and Coupang.

## Changes
- Removed error-code sublabels and obsolete CSS; details contain only the explanation, next action and observation time.
- Replaced developer-facing guidance asking users to report codes with plain instructions to check connection settings or ask the administrator for help.
- Added explicit existing queue-expiration messages, cancelled requests, explicit IP access restrictions and malformed-response diagnosis. Generic permission errors are not guessed to be IP restrictions.
- CANCELLED worker requests are terminal failures and allow retry after the other known requests finish. Still-running delayed workers remain nonterminal and cannot start duplicate collection.
- Kept original request ID binding and per-channel success retention. No database changes or real invoice tests.

## Verification
- App connection/collection/security tests: 147 passed, including Naver and Coupang progress-read failure, expiration, cancellation and delayed-running cases.
- Server catalog/route tests: 22 passed, including a negative IP restriction classification case.
- Right-monitor visible isolated Electron checks: 11 statuses x 3 channels x 2 themes x 3 widths (1440/1040/900), no visible technical codes/HTTP numbers, Korean action guidance, enabled retry for confirmed terminal failure, equal heights and no overflow.
- Production server release and signed app release evidence recorded below.

## Progress
This follow-up has three steps: wording/layout, cross-channel diagnostic coverage, release verification. The separate six-stage performance roadmap remains three completed and three remaining; stage four is rendering, selection and scrolling. Live authenticated provider success is distinct from isolated fixtures and is not asserted by these checks.

## Release evidence
- Production deployment dpl_6FWxwejETtrAUgtZBCMdrXETMUpX READY, canonical harin-cafe24-sync.vercel.app, SHA 2662a342edac4caeda81a0d55703ad28f4564594.
- Final package folder: desktop/dist/distribution-20261027-164310-558; earlier candidate was not published.
- Payload verification PASS: 166 files, app.asar SHA256 f6f3dc6e35169e8843fbc843ffcffe3fc22e8d65525af32b183ff326386cc976.
- Installed 0.219.0 app.asar visible right-monitor isolated UI verification PASS: 11 statuses, all three channels, two themes, three widths; no visible technical codes and no order writes.
- Local current.json and shortcuts point to 0.219.0; running older user processes are preserved and need restart.
- GitHub moaon-stable published; public feed Ed25519 verified, installer HTTP 200, GitHub digest matches, bytes 114470815, SHA256 d0934a7e359565d31d245ff89033f55b18def28b767513594a7c59e26b27bb37. Authenticode remains NotSigned.
- All three follow-up stages complete. Separate performance roadmap unchanged; next stage four rendering/selection/scroll.
