# 0.210.0 restart after update

User reported repeated refusal after clicking the saved/restart button and explicitly requested repair and updating the running app.

The old gate refused restart whenever any work IPC was active, including short-lived background reads. Repeated clicks could repeatedly collide with polling. The dialog closed before the result and gave a generic work/window message. This was reproduced with in-flight gate work; the user's exact in-flight operation was not observable from the old running app.

## Changes

- A restart request may reserve the gate and wait for existing work to finish while refusing new work. The final gate acquisition is atomic; no active work is cancelled or falsely marked complete.
- Waiting is displayed in the existing dialog. Restart cannot be submitted twice. Work completion leads to one installation dispatch without another click.
- After 60 seconds, waiting ends safely, normal work resumes and a specific work-timeout message is displayed. A late completion, error, disposal or stale drain callback cannot dispatch installation.
- An open child window still blocks installation with a specific message. Existing signature/file checks, write safety and version rules remain enforced.
- UI polling does not overwrite an explicit in-flight update action with an older result.

## Verification

- Full code suite: 549 passed, 0 failed. Focused updater/signature suite: 18 passed, including atomic drain, duplicate request, timeout, disposal, active work protection, window block, signature and installer integrity.
- Visible source Electron test on right monitor: real gate and update state machine with synthetic updater backend; waiting dialog retained, accept disabled, one installer spy call after work completion. No real installer executed in that test.
- Installed 0.210.0 app.asar passed the same real-state-machine/gate test using development Electron and an installer spy. Package verification: 165 files, SHA256 dc8c1ff2240496afa1145937d286239b21d4bb26f9db99947437a4494b5fbae6.
- Published moaon-stable 0.210.0, downloaded its public manifest/metadata/installer, and verified pinned Ed25519 signature and SHA512. Installer 114,465,231 bytes, SHA256 fdc7d5331ea9d901edcdf9224c091d2c5fd900a4d82a12f48bd135aa8b5d4c27. Windows Authenticode remains NotSigned, independently of the pinned update verification.
- User explicitly requested updating the app. After verification, ran the normal NSIS installer silently with force-run and the explicit D:/GPT/Apps/Moaon/releases/0.210.0 target. No manual termination of user processes or real order operations were used. Running executable changed from the observed 0.206.0 path to the 0.210.0 path; PE product version 0.210.0.0 confirmed. The actual user's authenticated order screen is not covered by the synthetic test.
- Evidence is recorded separately in D:/GPT/Temp/moaon-update-restart-210. A staged package alone was not treated as proof of the running update.

Plan: this interrupting repair has three steps (implementation, verification, deployment/application). The separate performance roadmap remains 3 of 6 complete, with stage 4 row rendering/selection/scroll preservation next.
