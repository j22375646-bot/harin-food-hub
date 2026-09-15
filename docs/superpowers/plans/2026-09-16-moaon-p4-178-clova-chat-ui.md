# P4-178 CLOVA chat visual parity

Desktop 0.147.15. Reuse Gemini chat presentation for CLOVA via explicit shared CSS selectors: header, lavender user bubbles, open assistant responses, greeting, compact tools, grouped input and circular arrow. Add provider-specific waiting dots, Enter send / Shift+Enter newline with IME guard. Preserve mounted panel between renders to avoid repeated panel entrance effects. Retain report-only scope, evidence actions, history, limits and draft restoration; no model/provider changes or new attachment support.

Validation: insight-ai-app-smoke passed including light/dark layouts at 700/1040/1440, short heights 500/600, existing generation/history/cancellation and draft workflows. Added Enter/Shift/IME and panel identity checks. general-chat-app-smoke passed including attachments, restoration and logout. Distribution distribution-20260916-010407-851.

Installed verification: 117 packaged files passed; real owner profile on right monitor, light/dark, open/close and unsent draft preservation passed. No provider request sent. Screenshot D:/GPT/tmp/p4178-installed-panel.png.
