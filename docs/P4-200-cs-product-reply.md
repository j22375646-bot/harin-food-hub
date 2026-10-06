# P4-200 customer service count, product context and Coupang online replies

Server 1.79.0 / desktop 0.161.0.

- Sidebar count uses the complete fetched pending CS list, independent of visible filters. Unknown/failure displays a dash; capped lists display a plus. Reads on overview refresh are limited to once a minute and do not replace a detail being edited.
- Coupang inquiries retain product, seller product and option identifiers. Product name is joined from the existing seller product catalog; failures do not hide the inquiry. Online answered=false is labeled 미답변 instead of an empty source status.
- Product and Wing links use main-process fixed-domain generation with bounded numeric identifiers. A per-inquiry Wing URL was requested from the user; no unverified deep-link pattern is invented. The product button is not represented as an exact inquiry deep link.
- Online inquiry replies use the existing fixed-IP operation queue via owner-authenticated team commands and existing workspace authorization. Exact source revision and explicit confirmation are required. A prior reply operation (including failed/uncertain outcomes) blocks a second automatic POST. UI separates pending/running/success/unverified, requires Wing login ID and confirmation, and preserves copy-only preparation for other channels and call-center inquiries.

Evidence:
- 475 regression, source projection, transport, reply contract and existing Coupang action tests passed.
- Source and packaged Electron fixture tests verified count 1, product details, no send before final confirmation, one queued request, and duplicate button lock.
- Production version 1.79.0; unauthenticated cron 401. Signed stable 0.161.0 published.
- Installed 0.161.0 opened on right display without focus theft. Actual inquiry ONLINE:160843615 rendered count 1, 작두콩수세미차 (1.2gx30티백), reply controls and no prior send. No live customer reply was sent.
- Official Coupang product inquiry reply endpoint was checked. The linked product URL was verified against product 9492352215. Real successful customer delivery remains untested because no reply text was authorized. Wing single-inquiry direct navigation awaits a confirmed URL.
