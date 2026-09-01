begin;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'ai_operating_rule_versions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%rule_key%'
  loop
    execute format('alter table public.ai_operating_rule_versions drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.ai_operating_rule_versions
  add constraint ai_operating_rule_versions_rule_key_check
  check (rule_key in ('insight','auto_diagnosis','anomaly_detection','financial_trust','data_coverage'));

insert into public.ai_operating_rule_versions (rule_key,version,title,config_json,change_note,created_by)
values
  ('anomaly_detection',1,'이상징후 감지식','{"decrease_warning_percent":20,"decrease_critical_percent":35,"increase_warning_percent":25,"increase_critical_percent":45,"enabled":true}'::jsonb,'역할별 운영 기준 확장','system'),
  ('financial_trust',1,'재무 신뢰 판정식','{"minimum_cost_coverage_percent":95,"enabled":true}'::jsonb,'역할별 운영 기준 확장','system'),
  ('data_coverage',1,'데이터 충족 판정식','{"minimum_data_coverage_percent":90,"enabled":true}'::jsonb,'역할별 운영 기준 확장','system')
on conflict (rule_key,version) do nothing;

comment on table public.ai_operating_rule_versions is
  'Immutable owner-edited thresholds for insight change, performance diagnosis, anomaly detection, financial trust, and data coverage. Latest version per rule key is active.';

commit;
