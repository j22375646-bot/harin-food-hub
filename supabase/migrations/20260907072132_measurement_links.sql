-- OWNER API accesses this ledger through the server service role only.
create table public.measurement_rule_versions (
  version text primary key check (char_length(version) between 1 and 64),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) <= 16384),
  created_at timestamptz not null default now()
);

create table public.measurement_links (
  id uuid primary key default gen_random_uuid(),
  rule_version text not null references public.measurement_rule_versions(version),
  normalized_input jsonb not null check (jsonb_typeof(normalized_input) = 'object' and octet_length(normalized_input::text) <= 32768),
  input_hash text not null unique check (input_hash ~ '^[0-9a-f]{64}$'),
  landing_url text not null check (char_length(landing_url) between 1 and 4096),
  generated_url text not null check (char_length(generated_url) between 1 and 32768),
  product_id uuid references public.master_products(id),
  campaign_id text not null check (char_length(campaign_id) between 1 and 128),
  creative_id text check (creative_id is null or char_length(creative_id) between 1 and 128),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index measurement_links_created_cursor_idx on public.measurement_links (created_at desc, id desc);
create index measurement_links_active_cursor_idx on public.measurement_links (created_at desc, id desc) where archived_at is null;

alter table public.measurement_rule_versions enable row level security;
alter table public.measurement_links enable row level security;
revoke all on table public.measurement_rule_versions from public, anon, authenticated;
revoke all on table public.measurement_links from public, anon, authenticated;
revoke all on table public.measurement_rule_versions from service_role;
revoke all on table public.measurement_links from service_role;
grant select on table public.measurement_rule_versions to service_role;
grant select, insert, update on table public.measurement_links to service_role;

-- Versioned definition is installed with the migration; GET performs no seed writes.
insert into public.measurement_rule_versions (version, definition) values (
  'utm-v1',
  '{"version":"utm-v1","requiredFields":["source","medium","campaign","campaignId"],"parameterOrder":["utm_source","utm_medium","utm_campaign","utm_id","utm_content","utm_term"],"normalization":{"unicode":"NFC","trim":true,"lowercaseFields":["source","medium"]},"maxLandingUrlLength":4096,"maxValueLength":200,"maxIdLength":128,"personalDataNotice":"캠페인명·검색어 등 임의 입력란에 개인정보를 입력하지 마세요."}'::jsonb
);
