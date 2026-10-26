# 0.208.0: Per-order shipping recovery buttons

Requested scope: add buttons matching the existing shipping status popover controls, with actions appropriate to the current processing step.

This small change has three steps: implement state-specific controls, verify source and installed package behavior, and publish the signed update. The separate performance roadmap remains 3 of 6 stages completed; this request does not complete its fourth stage.

## Behavior

- Existing status recheck, order detail and continuation/result controls remain available.
- A fourth control uses the same secondary-action styling. Failed registration with a known invoice shows `등록 다시 시도`; pending registration shows `등록 이어가기`. Both invoke the existing Main-owned continuation workflow, with fresh order/request verification and final confirmation when a write is needed.
- Eligible orders cancelled before issuing or not started show `발급 다시 시도`. It invokes the existing issue-and-register workflow, including its durable checkpoints, fresh order checks and confirmation. It does not bypass the original journal or create another request on unknown results.
- Failed/uncertain issuance shows `발급 결과 확인·이어가기`, which invokes only existing-request continuation, not fresh issuance. This version does not add forced reissuance of already issued or ambiguous requests.
- Registered completion, failed status synchronization, unbound invoice completion and active normal processing do not offer another recovery mutation. Active duplicate clicks are blocked.
- All actions remain in the nonmodal per-order popover. Buttons wrap inside the existing width rather than overflowing the viewport.

## Verification

- Full existing code suite: 546 passed, 0 failed. After fixing the new control selector collision with the existing retry-time fact field, affected state/contract/connection tests: 22 passed.
- New visible right-monitor isolated Electron UI test checks registration continuation, never-started issuance path, unknown issuance without a new issue call, hiding retries after completion, duplicate clicks, navigation during work, matching button styles, both themes, and no horizontal overflow. Uses only synthetic IPC fixtures; no real order writes.
- Source UI passed. Installed-package test and public release verification are recorded separately in D:/GPT/Temp/moaon-retry-actions-208.

Files: desktop/ui/shipping-progress.js, desktop/ui/app.js, desktop/test/shipping-retry-actions-ui.cjs; package version 0.208.0.
