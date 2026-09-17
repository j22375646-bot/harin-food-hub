# P4-209 — Full-width assistant workspace and contextual guides

Desktop 0.169.0, server unchanged at 1.84.0.

- Replaced internal left navigation with three horizontal menu groups, preserving tab handlers and role-based visibility.
- Expanded the content to full available width; personal notification cards use three columns on wide screens, two on medium screens, one on narrow screens.
- Added a collapsible contextual guide to each of 13 tabs, with three steps and an accessible HTML example illustration explicitly labeled as sample, not real data.
- Redesigned entry banner, active tabs, cards and guide panels with existing light/dark theme tokens.
- Preserved account isolation, permissions, saves, notification recipients and schedules. No server or live notification mutation.

Validation: source and distribution Electron flows passed account switching, stale responses, link/verify/unlink/save, guide search/navigation, all 13 contextual guides, and 700/1660 light/dark overflow. Screenshots reviewed. Distribution package and installed runtime validation recorded after build.
