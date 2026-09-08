# P4-12 server runtime composition implementation

## Scope

- Added lazy server-only business-list runtime composition using the dedicated control database, dashboard identity client, and `auth.admin`.
- Kept request guards ahead of all runtime initialization.
- Wired the Node route to one reusable runtime composition without caching user results.
- Added an explicit opt-in, read-only control connection diagnostic. It queries role identity and permitted aggregate counts only; it never reads `audit_events`.
- No credentials, database writes, tenant bootstrap, UI changes, deployment, push, or live mutation were performed.

## TDD seams

The task brief pre-agreed these public seams:

1. `Request -> Response` through `createBusinessListRuntime().handle`.
2. Runtime resource cleanup through `createBusinessListRuntime().close`.
3. Diagnostic execution through `checkMoaonControlConnection`.

## Red evidence

Command:

`node --test test/business-list-runtime.test.js`

Observed before implementation:

`Error: Cannot find module '../lib/tenancy/business-list-runtime.js'`

Result: 0 passed, 1 failed (test file could not load the missing production module).

## Green evidence

Command:

`node --test test/business-list-runtime.test.js test/moaon-control-connection-script.test.js test/business-list-request.test.js test/business-list-service.test.js test/control-database-config.test.js`

Result: 24 passed, 0 failed. This includes the existing signed-cookie/two-user SQL isolation test.

Command:

`git diff --check`

Result: passed; only Git LF/CRLF conversion notices were emitted.

## Diagnostic invocation

The diagnostic is intentionally disabled unless `MOAON_CONTROL_DB_DIAGNOSTIC=1` is present. With production environment injection, run:

`vercel env run -e production -- cmd /c "set MOAON_CONTROL_DB_DIAGNOSTIC=1&& node scripts/check-moaon-control-connection.js"`

It emits JSON containing only `currentUser`, `sessionUser`, and counts for tenants, memberships, and invitations. Failures emit a sanitized allowlisted code and exit with status 1. Sensitive Vercel variables may be unavailable to `vercel env run`; that is a deployment-environment limitation, not permission to print or bypass credentials.
