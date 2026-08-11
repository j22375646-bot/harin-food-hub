begin;

alter table public.coupang_sync_requests drop constraint if exists coupang_sync_requests_request_type_check;
alter table public.coupang_sync_requests add constraint coupang_sync_requests_request_type_check
  check (request_type in ('FULL', 'RG_INVENTORY', 'RG_REALTIME'));

commit;
