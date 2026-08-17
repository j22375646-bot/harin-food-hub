begin;

create table if not exists public.repurchase_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','SENDING','SENT','PARTIAL','FAILED','CANCELLED')),
  audience_type text not null default 'MIXED' check (audience_type in ('DUE','DORMANT','MIXED')),
  message_type text not null check (message_type in ('SMS','LMS')),
  message_body text not null check (char_length(message_body) between 1 and 1800),
  message_text text not null check (char_length(message_text) between 1 and 2000),
  recipient_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(recipient_refs)='array'),
  recipient_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(recipient_summary)='array'),
  target_count integer not null default 0 check (target_count between 0 and 50),
  unit_price numeric(10,2) not null default 0 check (unit_price >= 0),
  estimated_cost numeric(12,2) not null default 0 check (estimated_cost >= 0),
  source_checked_at timestamptz not null,
  consent_confirmed_at timestamptz,
  compliance_confirmed_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  provider_group_id text,
  provider_result jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_result)='object'),
  sent_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repurchase_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.repurchase_message_campaigns(id) on delete cascade,
  recipient_ref text not null check (char_length(recipient_ref) between 20 and 80),
  recipient_masked text not null,
  status text not null default 'WAITING' check (status in ('WAITING','SENT','FAILED','UNKNOWN')),
  provider_message_id text,
  provider_status_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,recipient_ref)
);

create index if not exists repurchase_message_campaigns_created_idx on public.repurchase_message_campaigns(created_at desc);
create index if not exists repurchase_message_campaigns_status_idx on public.repurchase_message_campaigns(status,created_at desc);
create index if not exists repurchase_message_deliveries_campaign_idx on public.repurchase_message_deliveries(campaign_id,status);

drop trigger if exists repurchase_message_campaigns_set_updated_at on public.repurchase_message_campaigns;
create trigger repurchase_message_campaigns_set_updated_at before update on public.repurchase_message_campaigns for each row execute function public.set_updated_at();
drop trigger if exists repurchase_message_deliveries_set_updated_at on public.repurchase_message_deliveries;
create trigger repurchase_message_deliveries_set_updated_at before update on public.repurchase_message_deliveries for each row execute function public.set_updated_at();

alter table public.repurchase_message_campaigns enable row level security;
alter table public.repurchase_message_deliveries enable row level security;
revoke all on table public.repurchase_message_campaigns from public,anon,authenticated;
revoke all on table public.repurchase_message_deliveries from public,anon,authenticated;
grant select,insert,update,delete on table public.repurchase_message_campaigns to service_role;
grant select,insert,update,delete on table public.repurchase_message_deliveries to service_role;

comment on table public.repurchase_message_campaigns is 'Phase 19-6 owner-approved SOLAPI campaign audit. Stores only hashed recipient refs and masked summaries; never raw customer ids, phones, names or addresses.';
comment on table public.repurchase_message_deliveries is 'Phase 19-6 sanitized delivery audit. No raw customer PII or provider credentials.';

commit;
