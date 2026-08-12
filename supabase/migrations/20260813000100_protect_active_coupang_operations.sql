begin;

create unique index if not exists coupang_operation_requests_active_target_idx
  on public.coupang_operation_requests(operation_type, target_type, target_id)
  where status in ('PENDING', 'RUNNING');

commit;
