begin;

alter table public.financial_change_audit_logs
  drop constraint if exists financial_change_audit_logs_change_request_id_fkey;
alter table public.financial_change_audit_logs
  add constraint financial_change_audit_logs_change_request_id_fkey
  foreign key (change_request_id)
  references public.financial_change_requests(id)
  on delete restrict;

revoke delete on public.financial_change_requests from service_role;
revoke all on public.financial_change_audit_logs from service_role;
grant select, insert on public.financial_change_audit_logs to service_role;

comment on table public.financial_change_audit_logs is
  'Append-only server audit trail for every financial change state transition; updates and deletes are denied.';

commit;
