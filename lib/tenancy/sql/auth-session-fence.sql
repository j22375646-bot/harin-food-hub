-- P1-04-1 candidate, NOT an automatically applied production migration.
-- Trusted server only. Tickets are NOT proof of password authentication.
-- All session issuers must use this fence before enabling password recovery.
begin;
create schema moaon_auth;
revoke all on schema moaon_auth from public, anon, authenticated;

create table moaon_auth.account_state (
  user_id uuid primary key references public.dashboard_users(user_id) on delete cascade,
  generation integer not null default 0 check (generation >= 0),
  blocked boolean not null default false,
  operation_id uuid,
  check (blocked = (operation_id is not null))
);
create table moaon_auth.login_tickets (
  id uuid primary key,
  user_id uuid not null references moaon_auth.account_state(user_id) on delete cascade,
  generation integer not null,
  expires_at timestamptz not null,
  consumed boolean not null default false
);
create index login_tickets_expiry_idx on moaon_auth.login_tickets(expires_at);
create table moaon_auth.password_changes (
  user_id uuid not null references moaon_auth.account_state(user_id) on delete cascade,
  id uuid not null,
  status text not null check (status in ('PENDING', 'COMPLETED')),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (user_id,id),
  check ((status = 'COMPLETED') = (completed_at is not null))
);
alter table moaon_auth.account_state enable row level security;
alter table moaon_auth.login_tickets enable row level security;
alter table moaon_auth.password_changes enable row level security;
revoke all on all tables in schema moaon_auth from public, anon, authenticated;
grant usage on schema moaon_auth to service_role;
grant select, insert, update, delete on all tables in schema moaon_auth to service_role;

create function public.moaon_begin_login(p_user_id uuid, p_ticket_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_state moaon_auth.account_state;
begin
  if p_user_id is null or p_ticket_id is null then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  if not exists(select 1 from public.dashboard_users where user_id=p_user_id and active) then
    raise exception 'AUTH_TRANSITION_REJECTED';
  end if;
  insert into moaon_auth.account_state(user_id) values(p_user_id) on conflict do nothing;
  select * into strict v_state from moaon_auth.account_state where user_id=p_user_id for update;
  perform 1 from public.dashboard_users where user_id=p_user_id and active for share;
  if not found or v_state.blocked then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  insert into moaon_auth.login_tickets(id,user_id,generation,expires_at)
    values(p_ticket_id,p_user_id,v_state.generation,clock_timestamp()+interval '5 minutes');
  return true;
end $$;

create function public.moaon_issue_session(p_user_id uuid, p_ticket_id uuid, p_session_id uuid,
  p_token_hash text, p_expires_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_state moaon_auth.account_state; v_ticket moaon_auth.login_tickets; v_profile public.dashboard_users;
begin
  if p_user_id is null or p_ticket_id is null or p_session_id is null or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at is null
    or not isfinite(p_expires_at) or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp()+interval '12 hours' then
    raise exception 'AUTH_TRANSITION_REJECTED';
  end if;
  select * into v_state from moaon_auth.account_state where user_id=p_user_id for update;
  if not found or v_state.blocked then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  select * into v_ticket from moaon_auth.login_tickets where id=p_ticket_id and user_id=p_user_id for update;
  if not found or v_ticket.consumed or v_ticket.expires_at <= clock_timestamp()
    or v_ticket.generation <> v_state.generation then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  select * into v_profile from public.dashboard_users where user_id=p_user_id and active for share;
  if not found then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  insert into public.dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at)
    values(p_session_id,p_user_id,p_token_hash,v_profile.username,v_profile.display_name,v_profile.role,p_expires_at);
  update moaon_auth.login_tickets set consumed=true where id=p_ticket_id;
  return true;
end $$;

create function public.moaon_begin_password_change(p_user_id uuid, p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_state moaon_auth.account_state;
begin
  if p_user_id is null or p_operation_id is null then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  if not exists(select 1 from public.dashboard_users where user_id=p_user_id and active) then
    raise exception 'AUTH_TRANSITION_REJECTED';
  end if;
  insert into moaon_auth.account_state(user_id) values(p_user_id) on conflict do nothing;
  select * into strict v_state from moaon_auth.account_state where user_id=p_user_id for update;
  perform 1 from public.dashboard_users where user_id=p_user_id and active for share;
  if not found then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  if v_state.blocked and v_state.operation_id=p_operation_id then return true; end if;
  if v_state.blocked or exists(select 1 from moaon_auth.password_changes where user_id=p_user_id and id=p_operation_id) then
    raise exception 'AUTH_TRANSITION_REJECTED';
  end if;
  update moaon_auth.account_state set generation=generation+1, blocked=true, operation_id=p_operation_id where user_id=p_user_id;
  update public.dashboard_sessions set revoked_at=clock_timestamp() where user_id=p_user_id and revoked_at is null;
  insert into moaon_auth.password_changes(user_id,id,status) values(p_user_id,p_operation_id,'PENDING');
  return true;
end $$;

-- Call ONLY after authoritative provider password update AND provider-session
-- revocation have succeeded. Unknown outcomes must remain blocked for review.
create function public.moaon_complete_password_change(p_user_id uuid, p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_state moaon_auth.account_state;
begin
  if p_user_id is null or p_operation_id is null then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  select * into v_state from moaon_auth.account_state where user_id=p_user_id for update;
  if not found then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  perform 1 from public.dashboard_users where user_id=p_user_id and active for share;
  if not found then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  if not v_state.blocked and exists(select 1 from moaon_auth.password_changes
    where user_id=p_user_id and id=p_operation_id and status='COMPLETED') then return true; end if;
  if not v_state.blocked or v_state.operation_id<>p_operation_id then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  update moaon_auth.password_changes set status='COMPLETED', completed_at=clock_timestamp()
    where user_id=p_user_id and id=p_operation_id and status='PENDING';
  if not found then raise exception 'AUTH_TRANSITION_REJECTED'; end if;
  update moaon_auth.account_state set blocked=false,operation_id=null where user_id=p_user_id;
  return true;
end $$;

revoke all on function public.moaon_begin_login(uuid,uuid),
  public.moaon_issue_session(uuid,uuid,uuid,text,timestamptz),
  public.moaon_begin_password_change(uuid,uuid), public.moaon_complete_password_change(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.moaon_begin_login(uuid,uuid),
  public.moaon_issue_session(uuid,uuid,uuid,text,timestamptz),
  public.moaon_begin_password_change(uuid,uuid), public.moaon_complete_password_change(uuid,uuid)
  to service_role;
commit;
