# Marketing studio platform tabs — desktop 0.177.0

Adds the Marketing Studio navigation entry with Blog, YouTube, TikTok and Instagram tabs. Each platform has a clearly labeled illustrative preview, expandable preparation guide and next integration step. The existing shell, theme tokens and title treatment are reused; no additional internal sidebar is added.

Scope: navigation and preparation UI only. No account connection, content generation, scheduling, posting, credential storage or new server API is implemented. Existing assistant/advertising functions are retained. Blog means Naver for this first preparation screen. No external subscription was created.

Verification:
- Electron isolated visible window on right display: all four tabs, guides, keyboard navigation, route return, light/dark and 760/1040/1440 widths passed. No renderer exceptions or horizontal overflow in tested sizes.
- Security resource allowlist tests: 4 passed.
- Signed package verified (151 files); packaged and managed installed 0.177.0 UI tests passed. Ed25519-signed update published to GitHub moaon-stable. Local managed install and shortcut updated. Installer SHA256: A21308AE9ECC7D146A7EF7E3F24DB7B1EA882C6C858247AB95D6A1A778141D38.

Test screenshots and logs are under D:/GPT/tmp/content-studio-*. This is an isolated UI test, not a production-user account connection test.

