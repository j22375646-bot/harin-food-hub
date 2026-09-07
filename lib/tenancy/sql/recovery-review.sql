-- P1-04-5 candidate, NOT an automatically applied production migration.
-- Trusted server review journal only; it neither retries provider work nor unlocks accounts.
begin;
create schema if not exists moaon_auth;
revoke all on schema moaon_auth from public, anon, authenticated;

create table moaon_auth.recovery_reviews (
  user_id uuid not null references public.dashboard_users(user_id) on delete cascade,
  operation_id uuid primary key,
  status text not null check (status in ('PENDING','REVIEW_REQUIRED','COMPLETED','REJECTED')),
  stage text check (stage in ('FENCE_BEGIN','PASSWORD_UPDATE','PROVIDER_SIGNOUT','IDENTITY_RECHECK','FENCE_COMPLETE')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status = 'PENDING' and stage is null)
    or (status = 'REVIEW_REQUIRED' and stage is not null)
    or status in ('COMPLETED','REJECTED'))
);
create index recovery_reviews_unresolved_idx
  on moaon_auth.recovery_reviews(created_at,operation_id)
  where status in ('PENDING','REVIEW_REQUIRED');
alter table moaon_auth.recovery_reviews enable row level security;
revoke all on moaon_auth.recovery_reviews from public, anon, authenticated;
grant usage on schema moaon_auth to service_role;
grant select, insert, update on moaon_auth.recovery_reviews to service_role;

create function public.moaon_start_recovery_review(p_user_id uuid, p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_review moaon_auth.recovery_reviews;
begin
  if p_user_id is null or p_operation_id is null then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  perform 1 from public.dashboard_users where user_id=p_user_id and active for share;
  if not found then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  insert into moaon_auth.recovery_reviews(user_id,operation_id,status)
    values(p_user_id,p_operation_id,'PENDING') on conflict(operation_id) do nothing;
  select * into v_review from moaon_auth.recovery_reviews where operation_id=p_operation_id for update;
  if not found or v_review.user_id<>p_user_id or v_review.status<>'PENDING' then
    raise exception 'RECOVERY_REVIEW_REJECTED';
  end if;
  return true;
end $$;

create function public.moaon_require_recovery_review(p_user_id uuid, p_operation_id uuid, p_stage text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_review moaon_auth.recovery_reviews;
begin
  if p_user_id is null or p_operation_id is null or p_stage is null
    or p_stage not in ('FENCE_BEGIN','PASSWORD_UPDATE','PROVIDER_SIGNOUT','IDENTITY_RECHECK','FENCE_COMPLETE') then
    raise exception 'RECOVERY_REVIEW_REJECTED';
  end if;
  select * into v_review from moaon_auth.recovery_reviews
    where operation_id=p_operation_id and user_id=p_user_id for update;
  if not found then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  if v_review.status='REVIEW_REQUIRED' and v_review.stage=p_stage then return true; end if;
  if v_review.status<>'PENDING' then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  update moaon_auth.recovery_reviews set status='REVIEW_REQUIRED',stage=p_stage,updated_at=clock_timestamp()
    where operation_id=p_operation_id and user_id=p_user_id;
  return true;
end $$;

create function public.moaon_complete_recovery_review(p_user_id uuid, p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_review moaon_auth.recovery_reviews;
begin
  if p_user_id is null or p_operation_id is null then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  perform 1 from moaon_auth.account_state where user_id=p_user_id for update;
  if not found then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  select * into v_review from moaon_auth.recovery_reviews
    where operation_id=p_operation_id and user_id=p_user_id for update;
  if not found or v_review.status='REJECTED' then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  perform 1 from moaon_auth.password_changes
    where user_id=p_user_id and id=p_operation_id and status='COMPLETED' for share;
  if not found then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  if v_review.status='COMPLETED' then return true; end if;
  if v_review.status not in ('PENDING','REVIEW_REQUIRED') then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  update moaon_auth.recovery_reviews set status='COMPLETED',updated_at=clock_timestamp()
    where operation_id=p_operation_id and user_id=p_user_id;
  return true;
end $$;

create function public.moaon_reject_recovery_review(p_user_id uuid, p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_review moaon_auth.recovery_reviews;
begin
  if p_user_id is null or p_operation_id is null then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  perform 1 from moaon_auth.account_state where user_id=p_user_id for update;
  if not found then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  select * into v_review from moaon_auth.recovery_reviews
    where operation_id=p_operation_id and user_id=p_user_id for update;
  if not found then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  if exists(select 1 from moaon_auth.password_changes where user_id=p_user_id and id=p_operation_id) then
    raise exception 'RECOVERY_REVIEW_REJECTED';
  end if;
  if v_review.status='REJECTED' then return true; end if;
  if v_review.status<>'PENDING' then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  update moaon_auth.recovery_reviews set status='REJECTED',updated_at=clock_timestamp()
    where operation_id=p_operation_id and user_id=p_user_id;
  return true;
end $$;

create function public.moaon_list_recovery_reviews(p_limit integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'RECOVERY_REVIEW_REJECTED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId',listed.user_id,
    'operationId',listed.operation_id,
    'status',listed.status,
    'stage',listed.stage,
    'createdAt',to_char(listed.created_at_ms at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(listed.updated_at_ms at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) order by listed.created_at_ms,listed.operation_id),'[]'::jsonb) into v_rows
  from (
    select user_id,operation_id,status,stage,
      date_trunc('milliseconds',created_at) created_at_ms,
      date_trunc('milliseconds',updated_at) updated_at_ms
    from moaon_auth.recovery_reviews where status in ('PENDING','REVIEW_REQUIRED')
    order by date_trunc('milliseconds',created_at),operation_id limit p_limit
  ) listed;
  return v_rows;
end $$;

-- Existing password-change callers remain valid without a review row. When a
-- review exists, this guard joins the established account->journal lock order,
-- requires the same owner and PENDING state, and prevents terminal/review reuse.
create function moaon_auth.guard_recovery_review_begin()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_review moaon_auth.recovery_reviews;
begin
  select * into v_review from moaon_auth.recovery_reviews
    where operation_id=new.id for update;
  if found and (v_review.user_id<>new.user_id or v_review.status<>'PENDING') then
    raise exception 'AUTH_TRANSITION_REJECTED';
  end if;
  return new;
end $$;
create trigger guard_recovery_review_begin
  before insert on moaon_auth.password_changes
  for each row execute function moaon_auth.guard_recovery_review_begin();

revoke all on function public.moaon_start_recovery_review(uuid,uuid),
  public.moaon_require_recovery_review(uuid,uuid,text),
  public.moaon_complete_recovery_review(uuid,uuid),
  public.moaon_reject_recovery_review(uuid,uuid),
  public.moaon_list_recovery_reviews(integer),
  moaon_auth.guard_recovery_review_begin()
  from public, anon, authenticated;
grant execute on function public.moaon_start_recovery_review(uuid,uuid),
  public.moaon_require_recovery_review(uuid,uuid,text),
  public.moaon_complete_recovery_review(uuid,uuid),
  public.moaon_reject_recovery_review(uuid,uuid),
  public.moaon_list_recovery_reviews(integer),
  moaon_auth.guard_recovery_review_begin()
  to service_role;
commit;
