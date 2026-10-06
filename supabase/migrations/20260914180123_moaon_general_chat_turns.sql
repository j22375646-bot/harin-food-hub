create table public.moaon_general_chat_turns (
 id uuid primary key, tenant_id uuid not null, actor_id text not null,
 conversation_id uuid not null, request_id uuid not null,
 question text not null check (length(question) between 1 and 4000),
 answer text not null check (length(answer) between 1 and 12000),
 report_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(report_ids)='array' and jsonb_array_length(report_ids)<=2),
 files jsonb not null default '[]'::jsonb check (octet_length(files::text)<=3000000),
 file_names jsonb not null default '[]'::jsonb,
 model text not null, created_at timestamptz not null default now(),
 unique(tenant_id,request_id)
);
create index moaon_general_chat_owner_history on public.moaon_general_chat_turns(tenant_id,actor_id,created_at desc);
create index moaon_general_chat_conversation on public.moaon_general_chat_turns(tenant_id,actor_id,conversation_id,created_at desc);
alter table public.moaon_general_chat_turns enable row level security;
revoke all on public.moaon_general_chat_turns from public,anon,authenticated;
grant select,insert,delete on public.moaon_general_chat_turns to service_role;
