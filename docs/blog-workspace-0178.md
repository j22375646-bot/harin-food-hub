# Blog workspace — desktop 0.178.0

The Blog tab now provides a Naver home-address probe, a validated link to the default browser, title/body editing with live preview and character limits, clipboard export, and JSON draft save/load. The five-step guide distinguishes Moaon authentication, Naver login, public-page access, ownership and publication. No automatic or scheduled publishing, Naver credentials, AI generation or photo upload is implemented.

Naver retired its blog-writing API on 2020-05-06: https://developers.naver.com/notice/article/7527 . Publication is completed in Naver's own editor. A successful public probe does not mean that login or ownership has been verified.

Connection probe permits only HTTPS Naver blog home URLs or restricted blog IDs. Requests use a fixed PostList endpoint, manual redirects, a 12-second timeout and bounded response reading. IPC requires the trusted renderer and validates payloads. Drafts are plain user-selected JSON files, not a shared global account store. Screen values clear on the existing session-change event, and late operations cannot repopulate another session.

Validation before packaging:
- 8 unit/security tests passed: URL allowlist, draft validation, probe success/challenge/redirect/network failures, IPC trust and app-resource boundaries.
- Isolated Electron UI passed four-tab navigation, Blog guide, preview, invalid URL rejection, actual clipboard copy, actual file write/read (test-only dialog paths), session clearing, and 760/1040/1440 light/dark overflow checks. Right secondary monitor only.
- Actual network probe of previously supplied public reference blog kims2369 succeeded at 2026-09-21T08:05:16.733Z. A nonexistent test blog was correctly unconfirmed. These are public-page tests, not the owner's account connection or publishing tests.
- Browser inventory showed Cafe24 only. The owner's Naver blog home URL was requested and is still pending; no password or post was submitted.

Screenshots: D:/GPT/tmp/content-studio-*.png and D:/GPT/tmp/blog-editor.png.
