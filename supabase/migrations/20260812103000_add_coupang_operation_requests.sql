begin;

alter table public.coupang_inquiries add column if not exists question_text text;
alter table public.coupang_inquiries add column if not exists parent_answer_id text;

create table if not exists public.coupang_operation_requests (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  target_type text not null,
  target_id text not null,
  status text not null check (status in ('EXECUTING','SUCCESS','FAILED','CANCELLED')),
  payload jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  confirmed_at timestamptz not null default now(),
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists coupang_operation_requests_target_idx on public.coupang_operation_requests(target_type,target_id,created_at desc);
create index if not exists coupang_operation_requests_status_idx on public.coupang_operation_requests(status,created_at desc);
alter table public.coupang_operation_requests enable row level security;
revoke all on public.coupang_operation_requests from anon, authenticated;
grant select, insert, update, delete on public.coupang_operation_requests to service_role;

insert into public.coupang_api_capabilities(feature_key,family,title,method,endpoint,mode,status,risk_level,sync_frequency) values
('order_acknowledgement','배송/주문','상품준비중 처리','PATCH','/ordersheets/acknowledgement','APPROVAL','ACTIVE','HIGH','수동'),
('invoice_upload','배송/주문','송장 업로드','POST','/orders/invoices','APPROVAL','ACTIVE','HIGH','수동'),
('inquiry_reply','고객문의','상품·고객센터 문의 답변','POST','/onlineInquiries/*/replies','APPROVAL','ACTIVE','HIGH','수동')
on conflict(feature_key) do update set family=excluded.family,title=excluded.title,method=excluded.method,endpoint=excluded.endpoint,mode=excluded.mode,status=excluded.status,risk_level=excluded.risk_level,sync_frequency=excluded.sync_frequency,updated_at=now();

commit;
