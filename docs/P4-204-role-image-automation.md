# P4-204 - Role-specific image automation

Server 1.82.0; signed desktop 0.164.1.

WORK/SOLO retain their schedules and section scopes; AD retains its separate report collection/scheduling pipeline. SUP and STUDY now use the same claimed, revision-checked scheduled/test delivery pipeline with distinct image headings, accents and content. The automation page exposes four independent schedule cards and an AD report-settings shortcut; recipients remain in the existing bot connection editor.

- SUP: enabled bot freshness/status, failed and uncertain general briefing deliveries over 24 hours. This is not source-channel collection monitoring or an independent outage detector. Advertising delivery details remain in advertising automation.
- STUDY: pending proposal count, published knowledge count, up to three knowledge titles updated in seven days. Knowledge sharing OFF returns an explicit unavailable state. No proposal bodies, chat memories or credentials are disclosed.
- SUP/STUDY include role menu buttons plus the existing bound draft/reminder actions. Menu authorization and action user/chat/message/revision checks remain enforced.
- New schedules remain OFF per the user's explicit choice. WORK remains ON at 09:00, revision 1; SOLO remains OFF, revision 0. SUP/STUDY are OFF, revision 0. AD schedule was not changed.

During installed verification, simultaneous assistant reads hit the transport's single-request permit and appeared as authentication errors. A bounded read queue now serializes reads, drops queued work across session generations and never retries writes. This follow-up is desktop 0.164.1.

Verification:
- 46 focused Node tests passed, including isolated Postgres slot/section validation, preserved settings, knowledge gating, safe projections, claims, bound callbacks and unauthorized access denial.
- 12 Python automation tests passed, including role content, missing data, multipart photo/buttons and uncertain-send dedupe.
- 123 connection/read-queue regression tests passed; queued reads cannot cross logout/session generations.
- Source and packaged Electron role settings/history checks passed at 700/1060/1660 in both themes. Workspace navigation smoke passed.
- Installed 0.164.1 owner session loaded all four schedules plus AD shortcut; displayed on right monitor without focus theft.
- Production header 1.82.0; migration applied with RLS and no anon/authenticated RPC execution. Hermes installer completed; timer active, service success/0.
- Real authorized test photos: SUP message 5, STUDY message 4, SOLO message 13. All three recorded SENT and action-card binding; remote instrumentation confirmed photo=true. Actual user button clicks were not performed. WORK/AD were not resent in this phase.
- Signed stable 0.164.1 published, installed and verified. SHA256 BC2D496173F1D98BF123CB63BFD10FCB0BDECED65F19E92451644D5932EA498D.

Evidence under D:/GPT/tmp: p4204-regression.log, p4204-connection-tests.log, p4204-final-packaged-ui.log, p4204-live-send.log, p4204-final-publish.log, p4204-installed-SUP.png and p4204-installed-STUDY.png.

Database privilege reference: https://supabase.com/docs/guides/database/functions
