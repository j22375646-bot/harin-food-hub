create index if not exists rocket_growth_inbound_shipments_operation_idx
  on public.rocket_growth_inbound_shipments(operation_request_id)
  where operation_request_id is not null;
