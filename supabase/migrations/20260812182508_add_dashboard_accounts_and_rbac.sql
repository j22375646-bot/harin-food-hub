begin;

create table if not exists public.dashboard_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null unique,
  display_name text not null,
  role text not null default 'VIEWER' check (role in ('OWNER', 'OPERATOR', 'VIEWER')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_users_email_lowercase check (email = lower(email)),
  constraint dashboard_users_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);

create table if not exists public.dashboard_sessions (
  id uuid primary key,
  user_id uuid not null references public.dashboard_users(user_id) on delete cascade,
  token_hash text not null unique,
  username text not null,
  display_name text not null,
  role text not null check (role in ('OWNER', 'OPERATOR', 'VIEWER')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  ip_hash text,
  user_agent text
);

create index if not exists dashboard_sessions_user_active_idx
  on public.dashboard_sessions(user_id, expires_at desc)
  where revoked_at is null;

create index if not exists dashboard_sessions_expiry_idx
  on public.dashboard_sessions(expires_at)
  where revoked_at is null;

create table if not exists public.dashboard_login_attempts (
  attempt_key text primary key,
  failed_count integer not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);

create table if not exists public.dashboard_access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_username text,
  target_user_id uuid,
  event_type text not null check (event_type in (
    'ACCOUNT_CREATED',
    'PROFILE_CHANGED',
    'ROLE_CHANGED',
    'ACCOUNT_ACTIVATED',
    'ACCOUNT_DEACTIVATED',
    'PASSWORD_RESET'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_access_audit_logs_created_idx
  on public.dashboard_access_audit_logs(created_at desc);

create index if not exists dashboard_access_audit_logs_target_idx
  on public.dashboard_access_audit_logs(target_user_id, created_at desc);

alter table public.dashboard_users enable row level security;
alter table public.dashboard_sessions enable row level security;
alter table public.dashboard_login_attempts enable row level security;
alter table public.dashboard_access_audit_logs enable row level security;

revoke all on public.dashboard_users, public.dashboard_sessions, public.dashboard_login_attempts
  from public, anon, authenticated;
grant select, insert, update, delete on public.dashboard_users, public.dashboard_sessions, public.dashboard_login_attempts
  to service_role;
revoke all on public.dashboard_access_audit_logs from public, anon, authenticated;
grant select, insert on public.dashboard_access_audit_logs to service_role;
revoke update, delete on public.dashboard_access_audit_logs from service_role;

comment on table public.dashboard_users is
  'Server-only dashboard account profiles. Authorization role is never sourced from user_metadata.';
comment on table public.dashboard_sessions is
  'Revocable server-side dashboard sessions. Only a SHA-256 hash of the signed browser token is stored.';
comment on table public.dashboard_login_attempts is
  'Hashed account and source keys for server-side login rate limiting; no raw IP or password is stored.';
comment on table public.dashboard_access_audit_logs is
  'Append-only audit trail for dashboard account and authorization changes.';

commit;
