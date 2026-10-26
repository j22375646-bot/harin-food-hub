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
- Installed-code test, actual installer recovery and public release checks are recorded separately in D:/GPT/Temp/moaon-update-restart-210. User's running executable was observed at D:/GPT/Apps/Moaon/releases/0.206.0/MoaonPreview.exe before recovery; staged 0.209.0 was not proof of a running update.

Plan: this interrupting repair has three steps (implementation, verification, deployment/application). The separate performance roadmap remains 3 of 6 complete, with stage 4 row rendering/selection/scroll preservation next.
