# Task 1 report: server-only Supabase TOTP provider boundary

## Status

- Implemented the inactive server-only `createSupabaseStepUpProvider(...).verifyTotp(...)` boundary with the installed `@supabase/supabase-js@2.55.0` / `@supabase/auth-js@2.71.1` SDK.
- Added real ES256 signing/JWKS fixtures with only the HTTP transport synthesized.
- No production route, existing auth/business file, credential, dependency, SQL, or persistence integration was changed.

## RED / GREEN evidence

All commands used `C:\Program Files\nodejs\node.exe` from the `moaon-foundation` worktree.

1. RED: `node --test test/tenant-supabase-step-up-provider.test.js`
   - Expected `MODULE_NOT_FOUND` for `../lib/tenancy/supabase-step-up-provider.js`.
   - 1 test, 0 pass, 1 fail.
2. First GREEN: same command.
   - Controlled real-SDK success flow passed: 1 test, 1 pass, 0 fail.
3. Validation RED: same command.
   - 28 tests, 25 pass, 3 reported failures (two failing child cases plus their parent): unconfirmed-email and malformed-factor classification exposed.
4. Validation GREEN: same command.
   - 28 tests, 28 pass, 0 fail.
5. Response-classification RED: same command.
   - 57 tests, 54 pass, 3 reported failures (two failing child cases plus their parent): invalid challenge ID/type were incorrectly classified as policy rejection.
6. Response-classification GREEN: same command.
   - 57 tests, 57 pass, 0 fail.
7. Deadline/refresh/concurrency GREEN initially reached 66/66, but SDK printed caught custom-fetch exceptions. The transport boundary was changed to return sanitized synthetic error responses instead of throwing into SDK fetch internals.
8. Final clean GREEN: `node --test test/tenant-supabase-step-up-provider.test.js`
   - 80 tests, 80 pass, 0 fail, 0 skipped; no SDK diagnostic output; duration about 1.8 seconds.
9. Syntax checks: `node --check lib/tenancy/supabase-step-up-provider.js` and `node --check test/tenant-supabase-step-up-provider.test.js` both exited 0.

## Covered behavior

- Exact config/input own keys, one-time getter copies, canonical HTTPS origin, trimmed bounded keys/tokens, UUID v1-v8 normalization, six ASCII digits, browser refusal, and zero network for invalid input.
- Original and renewed ES256 signature verification through SDK `getClaims`, exact issuer/audience/role/subject/session/anonymous/time rules, identical provider session, `aal2`, and fresh TOTP AMR.
- `setSession` user plus fresh `getUser` checks before challenge, and another fresh `getUser` check after verify; confirmed email, active non-anonymous user, and exactly one verified TOTP factor are required.
- Exact challenge/verify method, path, body, Authorization, redirect policy, shared abort signal, one challenge and one verify, with no automatic retries.
- 401/403 and 422 rejection versus other HTTP/malformed/timeout unavailability, fixed sanitized public errors, and no token/code/provider body in error properties, message, or cause.
- Overall deadline, clock rollback, late response, no post-deadline dispatch, source/renewed residual lifetime, blocked implicit refresh before injected transport, and concurrent two-user isolation.
- Frozen exact minimal evidence/session output, supplied `now`, verified timestamp, and JWT-capped evidence expiry.

## Installed SDK side effects observed

- `setSession` performs an authoritative `/auth/v1/user` request and writes the source session to the SDK's request-local memory storage even with `persistSession:false`.
- MFA `verify` reads that stored source session, sends challenge verification with the source access token, then overwrites SDK memory storage with the renewed session and emits its internal MFA notification.
- An SDK `setSession` can attempt `POST /auth/v1/token?grant_type=refresh_token` if its own wall clock sees the JWT as expired. The boundary returns a synthetic non-retryable 400 response before calling the injected transport; the test observed zero actual refresh requests and no console diagnostics.
- `getClaims` uses SDK process-global JWKS caching keyed by SDK storage key. This retains public signing keys, not provider sessions or submitted secrets.
- Every verification creates a separate SDK client; `stopAutoRefresh()` and the operation AbortController are finalized without signout or provider-session destruction.

## Self-review and mutation reasoning

- Removing signature verification makes the tampered-token test reach a write and fail.
- Relaxing exact keys, UUID/code/token constraints, or getter sanitization makes invalid-input network/count and TypeError assertions fail.
- Trusting verify `body.user`, removing either fresh user check, or weakening factor equality makes identity/factor cases fail.
- Removing session equality, `aal2`, AMR freshness, challenge validation, or expiry capping makes literal signed-fixture cases fail.
- Removing the allowlist, deadline/response recheck, abort propagation, refresh block, or no-retry behavior changes observed paths/counts and fails the deadline/late/refresh cases.
- Reusing one SDK client across calls allows session/token crossover and fails the simultaneous two-user router assertions.

## Limitations

- The transport and Supabase responses are synthetic. This does not prove MFA enrollment or successful authentication against a real Supabase project.
- The provider is intentionally inactive: no public route, hub-session binding, durable provider-session storage, revocation race handling, or database evidence issuance exists in this task.
- A verification request already dispatched when the deadline fires may complete remotely. The boundary rejects the late result and does not retry, sign out, or claim a known remote outcome.
- Request-local SDK memory and process-global public JWKS cache are SDK behaviors; there is no durable credential storage added by this implementation.
