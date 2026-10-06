# Moaon 0.187.0: bounded parallel shipping

## Behavior

- Desktop executes at most two approved order workflows concurrently. A free
  lane takes the next selected order; slow or timed-out orders do not consume
  another lane's deadline.
- Existing order fingerprints, exact invoice checks, durable issuance/action
  journals, native confirmation, and GET-only pending recovery remain intact.
- Authentication loss stops both lanes. Exact request permits and tracking
  permissions use reference counts so overlapping requests cannot revoke each
  other's authorization prematurely. Batch completion waits for both lanes.
- Progress shows two columns. Results retain per-order completion or
  check-required state; uncertain operations must not be reissued.
- The fixed-IP worker claims requests serially using the existing database CAS.
  It overlaps only EPOST_LIVE_ISSUE/HUB_ORDER requests with distinct targets,
  at most two. Other operation types remain exclusive. Unexpected failure
  joins in-flight work before returning; the pool does not retry writes.
- EPOST_OPERATION_CONCURRENCY=1 restores sequential worker execution. This
  scheduler assumes the existing single worker service; it does not introduce
  cross-process target locks or authorize adding additional workers.

## Deployment and verification

- Canonical server change: f07000b6. Lightsail targeted patch commit: 75fc59e,
  retaining the previous amount/receiver fix. Queue was idle before restart;
  service active, effective concurrency 2, heartbeat ONLINE after restart.
- Worker-focused tests: 44 passed, including 12 synthetic invoices, same-target
  exclusion, non-invoice exclusion, rollback setting and failure draining.
- Desktop unit tests: 480 passed. Coverage includes 12 orders with exact unique invoice mappings,
  slow-first-order overlap, isolated deadlines, timeout continuation, auth loss,
  and prior journal/restart/duplicate-write regressions.
- Isolated Electron UI verifies two visible progress rows, disabled duplicate
  clicks, 12 retained results (11 successful, one check required), and no
  horizontal overflow. Fixtures are labeled and make no real shipping calls.
- Real customer issuance/registration has not been used as a test. Provider
  latency and rate limits still affect actual throughput; no fixed speedup is
  claimed from synthetic tests.
