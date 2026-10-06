# Startup latency and server-disabled diagnosis — desktop 0.180.0

Two independent issues were observed:
1. Installed 0.179.0 loads electron-updater synchronously before loadURL. Hundreds of transitive module files block the main event loop. First packaged-mode measurement: updater require 2781ms, maximum event-loop lag 3277ms, ready-to-show 8027ms. Repeated old-version measurement: updater 1529ms, lag 2427ms, ready-to-show 4485ms.
2. Production login and orders both returned HTTP 402 with Payment required / DEPLOYMENT_DISABLED. Authenticated Vercel team metadata showed plan=hobby, status=active, softBlock.reason=FAIR_USE_LIMITS_EXCEEDED and blockedDueToOverageType=fluidCpuDuration. No billing, plan, spend limit or account-security setting was changed. This cannot be resolved by deleting the local session.

Fixes:
- Bundle the unchanged Windows NsisUpdater 6.8.9 dependency graph into one checked-in runtime file using pinned esbuild 0.25.12. License notices and a reproducible build script are included. The existing signed manifest, metadata validation, download verification and pre-install verification remain unchanged. Third-party updater packages remain declared. No signature bypass was added.
- Identify HTTP 402 as SERVER_DISABLED in the initial order connection. Display actionable Vercel billing/usage guidance while retaining stored login. No automatic retry or production mutation is added.
- Update the existing preload allowlist test for already-shipped blogWorkspace/openAssistantBot methods.

Validation:
- 137 connection/update/signature tests passed, including an explicit 402 case.
- Visible isolated startup profiling uses the right secondary monitor and packaged-mode initialization, including the real updater constructor. Only automatic update polling is disabled in this test harness; production updating is unchanged. No real customer order action occurs.
- New packaged runtime: ready-to-show 1489ms, event-loop lag 513ms. Source runtime updater require 133ms. Measurements are same-PC observations with caching/OS variance, not universal latency guarantees.
- The new packaged runtime made a real read-only request to the blocked server and displayed SERVER_DISABLED with the correct guidance. Prior runtime displayed generic UNAVAILABLE.
- App archive verified against 157 declared source files.

Evidence: D:/GPT/tmp/startup-before.json, startup-before-warm.json, startup-after-source.json, startup-after-packaged.json, startup-unit.log.

Server connectivity remains blocked until the Vercel usage restriction is resolved by the account owner. Upgrade/payment is not performed by this work.

Release: commit ecac31b pushed; Ed25519-signed desktop 0.180.0 published to GitHub moaon-stable and local managed shortcut updated. Installer SHA256 5B0827F2519CF88D13899F51A98D44BC0D4C222E3E5D8336029762359376BDED. Managed installed runtime repeat: ready-to-show 1195ms, maximum event-loop lag 564ms, real server still SERVER_DISABLED. No unresponsive event occurred in these isolated runs. The user's running old-version process was not forcibly closed. Evidence: D:/GPT/tmp/startup-after-installed.json. Raw Vercel diagnostic responses were removed after recording only the relevant plan/block reason.
