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
- Source UI and installed 0.208.0 app.asar UI both passed using development Electron, a separate profile, synthetic IPC and the right monitor without native focus. This is not a real-order acceptance test of the user's running EXE session.
- Package verification: 165 files match, app.asar SHA256 fc77909e17aced4adfb41d917ad323d8a7e56be4b771866c1deeda542509ff1e. Installer: 114,464,316 bytes, SHA256 19216d5f85799e8f922360a45ee3d0b617407f2c962e2aac5e800d753438bb66.
- Local version 0.208.0 staged and launchers updated; user's running app was not forcibly closed. GitHub moaon-stable release published. Public re-download verification evidence is stored in D:/GPT/Temp/moaon-retry-actions-208/public.
- Build orchestration encountered Windows PowerShell 5 UTF-8 parsing failures after building the NSIS installer and after copying the local package. Final update signing and launcher activation were completed using PowerShell 7 after package verification. No signing checks were disabled. Windows Authenticode remains NotSigned; update authenticity uses the existing pinned Ed25519 key.

Files: desktop/ui/shipping-progress.js, desktop/ui/app.js, desktop/test/shipping-retry-actions-ui.cjs; package version 0.208.0.
