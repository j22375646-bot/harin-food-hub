begin;

create index if not exists product_mapping_history_channel_product_idx
  on public.product_mapping_history(channel_product_id)
  where channel_product_id is not null;

create index if not exists product_mapping_history_previous_master_idx
  on public.product_mapping_history(previous_master_product_id)
  where previous_master_product_id is not null;

commit;
