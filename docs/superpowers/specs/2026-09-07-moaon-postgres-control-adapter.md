# MOAON restricted PostgreSQL control adapter contract

Status: P1-03 candidate and local-native verification contract. This is not a
production migration, production composition, or proof of P2 business-data isolation.

## Server composition

`createPostgresControlDatabase` is composed only in trusted server code and receives
an explicit connection object. It has no environment, Supabase service-role, legacy
database-client, browser, request-body, role-name, or SQL fallback. Its frozen public
surface is `{query, transaction, close}`, matching `createTenantControlStore`'s
database dependency. No route currently composes it.

For non-loopback targets, pass an `ssl` object with `rejectUnauthorized: true`.
Connection URLs must not contain query parameters: node-postgres documents that
`sslmode`, `sslcert`, `sslkey`, and `sslrootcert` in a URL replace the explicit SSL
object. Session `options` are also rejected so a URL cannot inject `role` or timeout
changes. Non-TLS is accepted only with `localTestOnly: true` and a loopback host.

The adapter owns a pool bounded to 4 connections by default (maximum configurable
value 16), a 2-second connection wait, and finite statement, lock, and
idle-in-transaction timeouts. Each checkout rolls back residual work, runs
`DISCARD ALL`, installs timeouts, and validates the actual PostgreSQL session. Both
`current_user` and `session_user` must be `moaon_control_app`; privileged attributes,
`INHERIT`, memberships, and ownership of the control schema/tables are rejected.
Rejected or uncertain connections are destroyed. Transactions use one leased client
for `BEGIN`, callback SQL, and `COMMIT`/`ROLLBACK`; callback handles expire immediately
after callback completion. A failed `COMMIT` is not retried because its outcome is
ambiguous. Driver errors are replaced with safe adapter errors.

## Candidate role and credentials

`lib/tenancy/sql/control-role.sql` is a reviewed candidate outside migration folders.
It creates the fixed role as `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
NOREPLICATION NOBYPASSRLS`. If that role already exists with login, privileged
attributes, membership, or object ownership, the script fails instead of altering it
into shape. It grants only:

- schema usage;
- tenant read and the minimum primary-key column update privilege needed for row
  locking, paired with an RLS `WITH CHECK (false)` policy that blocks actual changes;
- membership and invitation read/insert plus updates to their mutable columns;
- audit insert.

There is no control-table `DELETE`/`TRUNCATE`, tenant insert/removal, audit update,
`SECURITY DEFINER`, `BYPASSRLS`, public-schema grant, or policy/grant for `PUBLIC`,
`anon`, or `authenticated`.

Provision the login credential separately in a secret manager after applying and
reviewing the candidate in an approved environment. Never put the password in the
candidate SQL, browser configuration, logs, source control, request input, or a
Supabase public/service-role client. Credential rotation must create a new pool and
close the old one; the adapter does not mutate roles or passwords.

## Native test operation

The dedicated command is:

```powershell
$env:MOAON_TEST_POSTGRES_URL = '<explicit loopback moaon_test_* supervisor URL>'
pnpm test:tenancy:postgres
```

It fails when the variable is missing or when the host is not `127.0.0.1`/`localhost`,
the database does not start with `moaon_test_`, the user is not the synthetic test
supervisor, or the URL contains query parameters. The harness validates every target
before connecting, creates one uniquely named disposable database, and drops only
that generated database and roles it created. The external controller owns the
PostgreSQL process.

The native suite applies `control-plane.sql` and the candidate role SQL only inside
that disposable database. It provisions a random test-only SCRAM login separately,
uses distinct backend connections plus barriers for races, and records backend PIDs.
Mock transport tests are reported separately and are not native evidence.

## Security boundary and remaining gates

The fixed-role RLS policies are defense in depth for this internal membership control
plane. They deliberately permit the fixed server role to reach control rows because
authorization is performed by the store's fixed queries and row locks. They are not
user-JWT policies and do not isolate orders, money, files, caches, reports, AI data,
or any legacy business route. Public onboarding and invitation routes remain closed
until P2 business-row isolation passes.

Hosted PostgreSQL/Supabase TLS and pooler behavior, secret provisioning/rotation,
SMTP and reset lifecycle, session invalidation after password/reset/account changes,
and P2 tenant isolation remain activation gates. Existing user passwords and the
legacy login are unchanged.

References: [node-postgres transactions](https://node-postgres.com/features/transactions),
[node-postgres Pool API](https://node-postgres.com/apis/pool),
[node-postgres SSL](https://node-postgres.com/features/ssl), and
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
