# P4-179 Assistant UI first

Desktop 0.147.16. Add the 업무비서 workspace with home, connections and briefing views. Hermes/Telegram preparation guides and example dialogs are interactive. Briefing time/weekdays/topic selection updates a format preview and saves a validated, non-secret device-local draft. Clearly state that no scheduling/delivery begins. Disabled credential and connection controls await secure backend integration; no token storage or new external requests. Next phase: authenticated Moaon read APIs, then Hermes hosting and Telegram pairing.

Also fix shared launcher report top-margin leaking into Gemini header: header-specific zero margin and 44px height, vertically aligned with search/profile/theme controls.

Validation: 452 desktop tests passed. assistant-ui-smoke passed 18 view/theme/width combinations (700/1060/1660), draft persistence, guide modal close, unavailable connection controls, no page errors and header center alignment. New assets use explicit protocol allowlist entries.

Installed 0.147.16 real profile: all three tabs and four header-control centers verified; no external connections or sends. Package 119 files verified. Distribution distribution-20260916-014526-828. Screenshots D:/GPT/tmp/p4179-installed-home.png, connections.png, briefing.png (same prefix).
