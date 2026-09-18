# P4-212 — Coupang reply visibility and completion verification

Desktop 0.173.0, server 1.84.1.

- Wing login ID defaults to harinfood, is read-only until explicitly edited, and is saved locally for the Harin business on this PC. No password storage.
- Reply status polls every five seconds while active. It shows receipt, processing, source verification, elapsed time and delayed processing guidance. Detached/account-reset panels stop polling.
- Server exposes safe timing/reason fields, not raw error payloads. Invalid/auth/access/busy rejection is distinguished from uncertain receipt.
- API SUCCESS alone no longer means the inquiry is answered: status requests enqueue an idempotent read-only CS_REALTIME collection and require a post-send answered snapshot before presenting completion. A failed read never retries the customer reply.
- Existing final user confirmation, fresh-source preflight and duplicate suppression remain.
- Corrected obsolete CS footer claiming no reply connection exists.

Validation: 35 related backend tests passed, plus the authenticated transport-to-route test. Electron source and packaged-runtime fixture tests exercise changed-inquiry rejection, draft recovery, saved Wing ID, explicit send, polling through processing/verification/completion, and duplicate suppression. Production build and deployment verified separately.

Operational evidence: the production reply operation query returned no REPLY_ONLINE requests. Inquiry ONLINE:160964787 remained unanswered. This proves no recorded queue receipt, not a proven network/credential cause. No live customer reply was submitted during these tests. The running prior desktop was not forcibly closed because the user may have an unsaved answer. End-to-end live delivery remains to be verified from the updated app after the user reviews and confirms the actual answer.
