begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.hub_work_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null default 'TASK' check (item_type in ('TASK','NOTE')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 4000),
  status text not null default 'OPEN' check (status in ('OPEN','DONE','ARCHIVED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  due_at timestamptz,
  page_key text not null default 'main' check (page_key in (
    'main','orders','cs','inventory','settlement','collection','insight','keyword','product',
    'knowledge','reports','changes','validation','experiments','notifications'
  )),
  context_label text not null default '' check (char_length(context_label) <= 120),
  context_href text not null default '/' check (char_length(context_href) between 1 and 500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_work_items_status_updated_idx
  on public.hub_work_items (status, updated_at desc);
create index if not exists hub_work_items_page_updated_idx
  on public.hub_work_items (page_key, updated_at desc);

create table if not exists public.hub_saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  page_key text not null check (page_key in (
    'main','orders','cs','inventory','settlement','collection','insight','keyword','product',
    'knowledge','reports','changes','validation','experiments','notifications'
  )),
  href text not null check (char_length(href) between 1 and 500),
  query_state jsonb not null default '{}'::jsonb check (jsonb_typeof(query_state) = 'object'),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, href)
);

create index if not exists hub_saved_views_pinned_updated_idx
  on public.hub_saved_views (is_pinned desc, updated_at desc);

alter table public.hub_work_items enable row level security;
alter table public.hub_saved_views enable row level security;

revoke all on table public.hub_work_items from anon, authenticated;
revoke all on table public.hub_saved_views from anon, authenticated;
grant select, insert, update, delete on table public.hub_work_items to service_role;
grant select, insert, update, delete on table public.hub_saved_views to service_role;

comment on table public.hub_work_items is
  'Owner-only quick tasks and notes. Access is limited to authenticated Harin server routes using the service role.';
comment on table public.hub_saved_views is
  'Owner-only cross-device saved Harin Hub routes and filter query state.';

alter table public.alerts
  add column if not exists snoozed_until timestamptz;

commit;
