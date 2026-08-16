create or replace function public.check_market_feedback_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  matched_barriers integer;
  verified_barriers integer;
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market feedback product does not match project'; end if;

  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market feedback evidence must be verified in the same project';
  end if;

  select
    count(*)::integer,
    count(*) filter (where b.status = 'VERIFIED')::integer
  into matched_barriers, verified_barriers
  from public.market_barriers b
  where b.project_id = new.project_id
    and b.id = any(coalesce(new.source_barrier_ids,'{}'::uuid[]));

  if matched_barriers <> cardinality(new.source_barrier_ids) then
    raise exception 'market feedback barriers must belong to the same project';
  end if;

  if new.status = 'VERIFIED' and (
    not new.owner_confirmed
    or cardinality(new.evidence_ids) = 0
    or cardinality(new.source_barrier_ids) = 0
    or verified_barriers <> cardinality(new.source_barrier_ids)
    or char_length(trim(new.recommended_change)) = 0
  ) then
    raise exception 'verified feedback requires verified barriers, recommendation, evidence and owner confirmation';
  end if;

  return new;
end;
$$;

revoke all on function public.check_market_feedback_links() from public, anon, authenticated;
grant execute on function public.check_market_feedback_links() to service_role;
