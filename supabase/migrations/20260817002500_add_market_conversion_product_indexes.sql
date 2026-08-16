create index if not exists market_barriers_master_product_idx
  on public.market_barriers (master_product_id);

create index if not exists market_feedback_cards_master_product_idx
  on public.market_feedback_cards (master_product_id);
