begin;

create table if not exists public.ai_operating_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null check (rule_key in ('insight','auto_diagnosis')),
  version integer not null check (version > 0),
  title text not null check (char_length(title) between 2 and 120),
  config_json jsonb not null,
  change_note text,
  created_by text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (rule_key, version),
  check (jsonb_typeof(config_json) = 'object')
);

create index if not exists ai_operating_rule_versions_latest_idx
  on public.ai_operating_rule_versions (rule_key, version desc);

alter table public.ai_operating_rule_versions enable row level security;
revoke all on public.ai_operating_rule_versions from anon, authenticated;
grant select, insert on public.ai_operating_rule_versions to service_role;

insert into public.ai_operating_rule_versions (rule_key,version,title,config_json,change_note,created_by)
values
  ('insight',1,'인사이트 판정식','{"target_roas_percent":250,"conversion_rate_warning_percent":2,"change_warning_percent":10,"minimum_cost_coverage_percent":95,"freshness_hours":26,"enabled":true}'::jsonb,'초기 운영 기준','system'),
  ('auto_diagnosis',1,'자동진단 판정식','{"target_roas_percent":250,"conversion_rate_warning_percent":2,"change_warning_percent":10,"minimum_cost_coverage_percent":95,"freshness_hours":26,"enabled":true}'::jsonb,'초기 운영 기준','system')
on conflict (rule_key,version) do nothing;

comment on table public.ai_operating_rule_versions is
  'Immutable owner-edited thresholds used by server-side insights and automatic diagnosis generation. Latest version per rule key is active.';
comment on column public.ai_operating_rule_versions.config_json is
  'Privacy-safe numeric operating thresholds only. Never store customer or order identifiers.';

commit;
