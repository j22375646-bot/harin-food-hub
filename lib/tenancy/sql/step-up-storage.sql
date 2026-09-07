-- P1-04-11-2 candidate, NOT an automatically applied production migration.
-- Trusted server only. Install after the dashboard account and auth-session-fence candidates.
begin;

create schema if not exists moaon_auth;
revoke all on schema moaon_auth from public, anon, authenticated;

create table if not exists moaon_auth.step_up_heads (
  session_id uuid primary key references public.dashboard_sessions(id) on delete cascade,
  current_operation_id uuid
);

create table if not exists moaon_auth.step_up_attempts (
  operation_id uuid primary key,
  session_id uuid not null references public.dashboard_sessions(id) on delete cascade,
  user_id uuid not null references moaon_auth.account_state(user_id) on delete cascade,
  account_generation integer not null check (account_generation >= 0),
  state text not null check (state in ('PENDING', 'VERIFIED', 'REVOKED')),
  started_at timestamptz not null,
  pending_expires_at timestamptz not null,
  provider_session_id uuid,
  factor_id uuid,
  verified_at timestamptz,
  expires_at timestamptz,
  sealed_session jsonb,
  check (pending_expires_at > started_at),
  check (state <> 'PENDING' or (provider_session_id is null and factor_id is null
    and verified_at is null and expires_at is null and sealed_session is null)),
  check (state <> 'VERIFIED' or (provider_session_id is not null and factor_id is not null
    and verified_at is not null and expires_at is not null and sealed_session is not null)),
  check (state <> 'REVOKED' or sealed_session is null)
);

create index if not exists step_up_attempts_session_idx
  on moaon_auth.step_up_attempts(session_id, started_at desc);

alter table moaon_auth.step_up_heads enable row level security;
alter table moaon_auth.step_up_attempts enable row level security;
revoke all on moaon_auth.step_up_heads, moaon_auth.step_up_attempts from public, anon, authenticated;
grant usage on schema moaon_auth to service_role;
grant select, insert, update, delete on moaon_auth.step_up_heads, moaon_auth.step_up_attempts to service_role;
grant usage on schema auth to service_role;
grant select (id, user_id) on auth.sessions to service_role;
grant select (id, user_id, status, factor_type) on auth.mfa_factors to service_role;

create or replace function public.moaon_begin_step_up(
  p_user_id uuid, p_session_id uuid, p_token_hash text, p_operation_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_state moaon_auth.account_state;
  v_session public.dashboard_sessions;
  v_head moaon_auth.step_up_heads;
  v_attempt moaon_auth.step_up_attempts;
  v_now timestamptz;
  v_pending_expires timestamptz;
begin
  if p_user_id is null or p_session_id is null or p_operation_id is null
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;

  select * into v_state from moaon_auth.account_state
    where user_id = p_user_id for share;
  if not found or v_state.blocked then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  perform 1 from public.dashboard_users where user_id = p_user_id and active for share;
  if not found then raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED'; end if;
  select * into v_session from public.dashboard_sessions
    where id = p_session_id and user_id = p_user_id and token_hash = p_token_hash for update;
  v_now := date_trunc('milliseconds', clock_timestamp());
  if not found or v_session.revoked_at is not null or not isfinite(v_session.expires_at)
    or v_session.expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;

  insert into moaon_auth.step_up_heads(session_id) values(p_session_id) on conflict do nothing;
  select * into strict v_head from moaon_auth.step_up_heads where session_id = p_session_id for update;
  if exists(select 1 from moaon_auth.step_up_attempts where operation_id = p_operation_id) then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  if v_head.current_operation_id is not null then
    select * into strict v_attempt from moaon_auth.step_up_attempts
      where operation_id = v_head.current_operation_id for update;
    if v_attempt.state = 'PENDING' and v_attempt.pending_expires_at > v_now then
      raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
    end if;
    update moaon_auth.step_up_attempts set state = 'REVOKED', sealed_session = null
      where operation_id = v_attempt.operation_id;
  end if;

  v_pending_expires := least(v_session.expires_at, v_now + interval '60 seconds');
  if v_pending_expires <= v_now then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  begin
    insert into moaon_auth.step_up_attempts(
      operation_id, session_id, user_id, account_generation, state, started_at, pending_expires_at
    ) values(p_operation_id, p_session_id, p_user_id, v_state.generation, 'PENDING', v_now, v_pending_expires);
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end;
  update moaon_auth.step_up_heads set current_operation_id = p_operation_id where session_id = p_session_id;
  return jsonb_build_object(
    'operationId', p_operation_id::text,
    'startedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(v_pending_expires at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end $$;

create or replace function public.moaon_commit_step_up(
  p_user_id uuid, p_session_id uuid, p_token_hash text, p_operation_id uuid,
  p_provider_session_id uuid, p_factor_id uuid, p_verified_at timestamptz,
  p_expires_at timestamptz, p_sealed_session jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_state moaon_auth.account_state;
  v_session public.dashboard_sessions;
  v_head moaon_auth.step_up_heads;
  v_attempt moaon_auth.step_up_attempts;
  v_now timestamptz;
  v_final_expires timestamptz;
  v_cipher text;
  v_cipher_bytes bytea;
  v_canonical_cipher text;
begin
  if p_user_id is null or p_session_id is null or p_operation_id is null
    or p_provider_session_id is null or p_factor_id is null
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_verified_at is null or p_expires_at is null
    or not isfinite(p_verified_at) or not isfinite(p_expires_at)
    or p_verified_at <> date_trunc('milliseconds', p_verified_at)
    or p_expires_at <> date_trunc('milliseconds', p_expires_at)
    or p_sealed_session is null or jsonb_typeof(p_sealed_session) <> 'object'
    or (select count(*) from jsonb_object_keys(p_sealed_session)) <> 5
    or not (p_sealed_session ?& array['v','keyId','iv','ciphertext','tag'])
    or jsonb_typeof(p_sealed_session->'v') <> 'number' or p_sealed_session->>'v' <> '1'
    or jsonb_typeof(p_sealed_session->'keyId') <> 'string'
    or p_sealed_session->>'keyId' !~ '^[A-Za-z0-9_-]{1,64}$'
    or jsonb_typeof(p_sealed_session->'iv') <> 'string'
    or p_sealed_session->>'iv' !~ '^[A-Za-z0-9_-]{16}$'
    or jsonb_typeof(p_sealed_session->'tag') <> 'string'
    or p_sealed_session->>'tag' !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
    or jsonb_typeof(p_sealed_session->'ciphertext') <> 'string' then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  v_cipher := p_sealed_session->>'ciphertext';
  if length(v_cipher) < 1 or length(v_cipher) > 50000
    or v_cipher !~ '^[A-Za-z0-9_-]+$' or length(v_cipher) % 4 = 1 then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  begin
    v_cipher_bytes := decode(
      translate(v_cipher, '-_', '+/') || repeat('=', (4 - length(v_cipher) % 4) % 4),
      'base64'
    );
    v_canonical_cipher := rtrim(replace(replace(replace(replace(
      encode(v_cipher_bytes, 'base64'), E'\n', ''), E'\r', ''), '+', '-'), '/', '_'), '=');
  exception when others then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end;
  if v_canonical_cipher <> v_cipher then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;

  select * into v_state from moaon_auth.account_state
    where user_id = p_user_id for share;
  if not found or v_state.blocked then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  perform 1 from public.dashboard_users where user_id = p_user_id and active for share;
  if not found then raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED'; end if;
  select * into v_session from public.dashboard_sessions
    where id = p_session_id and user_id = p_user_id and token_hash = p_token_hash for update;
  v_now := date_trunc('milliseconds', clock_timestamp());
  if not found or v_session.revoked_at is not null or not isfinite(v_session.expires_at)
    or v_session.expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  select * into v_head from moaon_auth.step_up_heads where session_id = p_session_id for update;
  if not found or v_head.current_operation_id is distinct from p_operation_id then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  select * into v_attempt from moaon_auth.step_up_attempts where operation_id = p_operation_id for update;
  if not found or v_attempt.session_id <> p_session_id or v_attempt.user_id <> p_user_id
    or v_attempt.state <> 'PENDING' or v_attempt.account_generation <> v_state.generation
    or v_attempt.pending_expires_at <= v_now
    or p_verified_at < date_trunc('second', v_attempt.started_at)
    or p_verified_at > v_now or v_now - p_verified_at >= interval '5 minutes'
    or p_expires_at <= v_now or p_expires_at > p_verified_at + interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  perform 1 from auth.sessions
    where id = p_provider_session_id and user_id = p_user_id;
  if not found then raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED'; end if;
  perform 1 from auth.mfa_factors
    where id = p_factor_id and user_id = p_user_id and status = 'verified' and factor_type = 'totp';
  if not found then raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED'; end if;

  v_final_expires := least(v_session.expires_at, p_expires_at);
  update moaon_auth.step_up_attempts set
    state = 'VERIFIED', provider_session_id = p_provider_session_id, factor_id = p_factor_id,
    verified_at = p_verified_at, expires_at = v_final_expires, sealed_session = p_sealed_session
    where operation_id = p_operation_id;
  return jsonb_build_object(
    'userId', p_user_id::text,
    'sessionId', p_session_id::text,
    'method', 'mfa',
    'verifiedAt', to_char(p_verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(v_final_expires at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end $$;

create or replace function public.moaon_read_step_up(
  p_user_id uuid, p_session_id uuid, p_include_session boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_state moaon_auth.account_state;
  v_session public.dashboard_sessions;
  v_head moaon_auth.step_up_heads;
  v_attempt moaon_auth.step_up_attempts;
  v_now timestamptz;
begin
  if p_user_id is null or p_session_id is null or p_include_session is null then return null; end if;
  select * into v_state from moaon_auth.account_state where user_id = p_user_id for share;
  if not found or v_state.blocked then return null; end if;
  perform 1 from public.dashboard_users where user_id = p_user_id and active for share;
  if not found then return null; end if;
  select * into v_session from public.dashboard_sessions
    where id = p_session_id and user_id = p_user_id for update;
  v_now := date_trunc('milliseconds', clock_timestamp());
  if not found or v_session.revoked_at is not null or not isfinite(v_session.expires_at)
    or v_session.expires_at <= v_now then return null; end if;
  select * into v_head from moaon_auth.step_up_heads where session_id = p_session_id for share;
  if not found or v_head.current_operation_id is null then return null; end if;
  select * into v_attempt from moaon_auth.step_up_attempts
    where operation_id = v_head.current_operation_id for share;
  if not found or v_attempt.session_id <> p_session_id or v_attempt.user_id <> p_user_id
    or v_attempt.state <> 'VERIFIED' or v_attempt.account_generation <> v_state.generation
    or v_attempt.verified_at is null or v_attempt.expires_at is null
    or not isfinite(v_attempt.verified_at) or not isfinite(v_attempt.expires_at)
    or v_attempt.verified_at > v_now or v_now - v_attempt.verified_at >= interval '5 minutes'
    or v_attempt.expires_at <= v_now or v_attempt.provider_session_id is null or v_attempt.factor_id is null
    or v_attempt.sealed_session is null then return null; end if;
  perform 1 from auth.sessions
    where id = v_attempt.provider_session_id and user_id = p_user_id;
  if not found then return null; end if;
  perform 1 from auth.mfa_factors
    where id = v_attempt.factor_id and user_id = p_user_id and status = 'verified' and factor_type = 'totp';
  if not found then return null; end if;
  return jsonb_build_object(
    'proof', jsonb_build_object(
      'userId', p_user_id::text,
      'sessionId', p_session_id::text,
      'method', 'mfa',
      'verifiedAt', to_char(v_attempt.verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', to_char(v_attempt.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'operationId', v_attempt.operation_id::text,
    'providerSessionId', v_attempt.provider_session_id::text,
    'factorId', v_attempt.factor_id::text,
    'sealedSession', case when p_include_session then v_attempt.sealed_session else null end
  );
end $$;

create or replace function public.moaon_revoke_step_up(
  p_user_id uuid, p_session_id uuid, p_token_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_state moaon_auth.account_state;
  v_session public.dashboard_sessions;
begin
  if p_user_id is null or p_session_id is null or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED';
  end if;
  select * into v_state from moaon_auth.account_state where user_id = p_user_id for share;
  if not found then raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED'; end if;
  perform 1 from public.dashboard_users where user_id = p_user_id for share;
  if not found then raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED'; end if;
  select * into v_session from public.dashboard_sessions
    where id = p_session_id and user_id = p_user_id and token_hash = p_token_hash for update;
  if not found then raise exception using errcode = 'P0001', message = 'STEP_UP_REQUIRED'; end if;
  insert into moaon_auth.step_up_heads(session_id) values(p_session_id) on conflict do nothing;
  perform 1 from moaon_auth.step_up_heads where session_id = p_session_id for update;
  update moaon_auth.step_up_attempts set state = 'REVOKED', sealed_session = null
    where session_id = p_session_id;
  update moaon_auth.step_up_heads set current_operation_id = null where session_id = p_session_id;
  return true;
end $$;

revoke all on function public.moaon_begin_step_up(uuid,uuid,text,uuid),
  public.moaon_commit_step_up(uuid,uuid,text,uuid,uuid,uuid,timestamptz,timestamptz,jsonb),
  public.moaon_read_step_up(uuid,uuid,boolean), public.moaon_revoke_step_up(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.moaon_begin_step_up(uuid,uuid,text,uuid),
  public.moaon_commit_step_up(uuid,uuid,text,uuid,uuid,uuid,timestamptz,timestamptz,jsonb),
  public.moaon_read_step_up(uuid,uuid,boolean), public.moaon_revoke_step_up(uuid,uuid,text)
  to service_role;

commit;
