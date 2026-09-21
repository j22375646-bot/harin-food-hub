# Gemini blog drafting — desktop 0.179.0

Blog workspace reuses the existing authenticated general-chat Gemini endpoint. No provider keys or production server configuration were changed. Each generation has a separate conversation/request UUID, no report attachment, and model gemini-3.5-flash-lite, which is already supported by the existing contract. Inputs and generated answers are stored in the existing Gemini conversation history; the UI discloses this.

Users enter confirmed product facts, purpose/audience, and tone; Gemini returns title/body/checks. Results are validated and rendered as text, previewed separately, then applied explicitly. Replacing an existing draft requires confirmation. Existing manual editing/copy/save/load remains available. Prompts ask the model not to invent product claims, certifications, experiences or health effects. This is a drafting instruction, not an automated factual/compliance guarantee.

Status UI distinguishes login, configuration, disabled provider, permissions, quota, in-flight request, malformed response, timeout and storage failures. Duplicate clicks are locked; session changes clear input/output and prevent late responses from restoring content. It does not cancel unrelated general-chat work, retry automatically or enable paid fallback. No automatic publication was added.

Verification:
- 10 unit/security tests passed, including prompt compatibility with the live IPC contract and strict output shape/limits.
- Isolated visible Electron UI passed with controlled provider-response fixtures: connection, generation, explicit apply, replacement cancel, empty input, quota and malformed responses, duplicate lock, logout race, light/dark layouts at 760/1040/1440.
- Existing Blog workspace navigation, files, clipboard and logout regression passed.
- Live Gemini generation under the owner's authenticated account has not been tested in this turn. Fixture tests do not establish current provider/key availability.

Screenshots: D:/GPT/tmp/blog-ai-*.png. Only the right secondary monitor was used.

Release verification: 4ba444e pushed. Desktop 0.179.0 Ed25519 signed release published to moaon-stable; local managed shortcut updated. Packaged archive matched 155 source files. Packaged and installed isolated Gemini UI fixture tests both passed. Installer SHA256: 61ECE987B3E17FBE9F7FEEA035D7B08CBE1AF2B42F740E515DFFD5ED2A4770EC. Distribution: desktop/dist/distribution-20260921-190241-209. These tests do not claim a live provider response.
