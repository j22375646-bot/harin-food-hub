# P4-169 Gemini general conversation

Owner request: global Gemini assistant for general questions, optional report selection, profile greeting and suggestions, file attachments, thinking animation and progressive answer display. CLOVA remains separate on Analysis.

Implementation: authenticated /general-chat GET/POST/DELETE, owner/session fencing, service-only RLS table moaon_general_chat_turns with actor/tenant scoped reads and deletion. Reuses managed Gemini configuration and shared free-project request budget; no CLOVA or paid fallback. Uses last five turns as model context; UI loads latest thirty saved turns. Chosen reports are server-projected aggregate Naver snapshots, never implicit page data. Attached PNG/JPEG/PDF/TXT/MD/CSV files are capped at three and two MB total. File contents stay out of history responses; retained server-side for follow-up context and removed with the conversation. General questions have no report requirement or advertising-only classifier.

UI: global top entry, profile-aware greeting with anonymous fallback, selectable suggested questions, optional report picker and upload chips. Close preserves current conversation, draft and in-flight request. New conversation resets optional attachments; logout clears renderer state. Thinking uses reduced-motion-aware dots. Answer reveal animates an already received answer, not provider token streaming. Text is rendered with textContent. No web-search or external-action tools are enabled.

Validation: 451 desktop tests; 9 focused general tests plus 3 market request regression tests; source and packaged Electron general chat smoke, CLOVA and public-market regressions at 700/1040/1440 light/dark. Source Webpack build passed (local Turbopack cannot follow the existing dependency junction); Vercel production builds passed. SQL confirmed RLS enabled, anon/authenticated denied, service_role insert enabled. Cold live checks identified missing sin1 region for the new endpoint; vercel.json now pins the route beside the control database.

Package: 0.147.6, desktop/dist/distribution-20260915-031655-718. ASAR SHA256 13da70f9ff2ede1953d2e0d814d885d6a2c5b844536d49ed9d10d29b947eb5e2, 117 files verified. Installer SHA256 59BBDFF5D4E43CF4B77A4F5187133A174A5F5D0207A7646EAB58573416A30975.

Live verification: production sin1 deployment READY; real owner-session Gemini answered a report-free general question and correctly read the unique test word from an uploaded TXT file. No real operational writes or key changes. Profile greeting displayed the actual owner name.
