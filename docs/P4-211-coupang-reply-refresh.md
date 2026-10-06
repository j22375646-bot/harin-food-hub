# P4-211 — Coupang reply stale snapshot recovery

Desktop 0.172.0. Server unchanged. The backend rejects CS_REPLY_SEND when the displayed updated_at no longer matches the inquiry row. Periodic ingestion refreshes this timestamp even when the visible question is unchanged.

- Immediately before enqueueing after explicit user confirmation, re-read CS and compare inquiry ID, availability, body, title, content status and product context with the reviewed snapshot.
- If identical, submit with the latest sourceUpdatedAt; backend stale-source validation remains intact.
- If changed, missing, answered or unreadable, do not enqueue. Offer a latest-inquiry refresh and preserve answer text and Wing login ID in the current session.
- Fence preflight completion against account reset or detached detail. Pending/successful/uncertain operations retain duplicate protection.

Validation: source and packaged Electron CS test covers changed question blocking, zero sends before confirmation, refresh/reopen preserving draft and Wing ID, timestamp-only refresh succeeding with the latest timestamp, and pending duplicate lock. Three backend reply tests passed. No actual customer reply was sent.

The user's running 0.171.0 had no reachable CDP connection, so it was not forcibly closed to avoid losing an in-progress draft. New signed build is installed for next launch; live customer send remains user-confirmed.
