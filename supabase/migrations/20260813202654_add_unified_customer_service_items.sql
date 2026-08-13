begin;

create table if not exists public.customer_service_items (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  platform text not null check (platform in ('NAVER','CAFE24')),
  kind text not null check (kind in ('INQUIRY','CANCEL','RETURN','EXCHANGE')),
  source_id text not null,
  source_subtype text,
  status text,
  completed boolean not null default false,
  answered boolean not null default false,
  order_id text,
  product_id text,
  occurred_at timestamptz,
  title_envelope jsonb not null default '{}'::jsonb,
  content_envelope jsonb not null default '{}'::jsonb,
  raw_summary jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_service_items_work_idx
  on public.customer_service_items(platform, completed, occurred_at desc);
create index if not exists customer_service_items_order_idx
  on public.customer_service_items(order_id) where order_id is not null;

drop trigger if exists customer_service_items_set_updated_at on public.customer_service_items;
create trigger customer_service_items_set_updated_at
before update on public.customer_service_items
for each row execute function public.set_updated_at();

alter table public.customer_service_items enable row level security;
revoke all on public.customer_service_items from public, anon, authenticated;
grant select, insert, update, delete on public.customer_service_items to service_role;

comment on table public.customer_service_items is
  'Server-only normalized Naver and Cafe24 inquiry/claim work queue. Customer-written title and content are AES-256-GCM envelopes.';
comment on column public.customer_service_items.title_envelope is
  'AES-256-GCM envelope encrypted with the server service secret.';
comment on column public.customer_service_items.content_envelope is
  'AES-256-GCM envelope encrypted with the server service secret.';

commit;
