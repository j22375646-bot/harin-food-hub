-- Candidate MOAON membership control schema.
-- This file is not an auto-applied migration and must not be run against production
-- until P1-03 supplies and verifies a restricted PostgreSQL connection role.

create schema if not exists moaon_control;

revoke all on schema moaon_control from public;

create table if not exists moaon_control.tenants (
  id uuid primary key,
  display_name text not null check (display_name = btrim(display_name) and display_name <> ''),
  status text not null check (status in ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists moaon_control.memberships (
  tenant_id uuid not null references moaon_control.tenants(id),
  user_id uuid not null,
  role text not null check (role in ('OWNER', 'OPERATOR', 'VIEWER')),
  status text not null check (status in ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  version integer not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, user_id)
);

create table if not exists moaon_control.invitations (
  id uuid primary key,
  tenant_id uuid not null references moaon_control.tenants(id),
  invite_email text not null
    check (invite_email = lower(btrim(invite_email)) and invite_email <> ''),
  role text not null check (role in ('OPERATOR', 'VIEWER')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  status text not null check (status in ('PENDING', 'ACCEPTED', 'REVOKED')),
  accepted_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz,
  foreign key (tenant_id, created_by)
    references moaon_control.memberships(tenant_id, user_id),
  foreign key (tenant_id, accepted_by)
    references moaon_control.memberships(tenant_id, user_id),
  check (expires_at > created_at),
  check (
    (status = 'ACCEPTED' and accepted_by is not null and accepted_at is not null)
    or (status in ('PENDING', 'REVOKED') and accepted_by is null and accepted_at is null)
  )
);

create table if not exists moaon_control.audit_events (
  id uuid primary key,
  tenant_id uuid not null references moaon_control.tenants(id),
  actor_user_id uuid not null,
  action text not null check (action in (
    'INVITATION_CREATED',
    'INVITATION_ACCEPTED',
    'INVITATION_REVOKED',
    'MEMBERSHIP_UPDATED'
  )),
  target_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table moaon_control.tenants enable row level security;
alter table moaon_control.memberships enable row level security;
alter table moaon_control.invitations enable row level security;
alter table moaon_control.audit_events enable row level security;

revoke all on all tables in schema moaon_control from public;
revoke all on all sequences in schema moaon_control from public;
alter default privileges in schema moaon_control revoke all on tables from public;
alter default privileges in schema moaon_control revoke all on sequences from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema moaon_control from anon';
    execute 'revoke all on all tables in schema moaon_control from anon';
    execute 'revoke all on all sequences in schema moaon_control from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema moaon_control from authenticated';
    execute 'revoke all on all tables in schema moaon_control from authenticated';
    execute 'revoke all on all sequences in schema moaon_control from authenticated';
  end if;
end
$$;
