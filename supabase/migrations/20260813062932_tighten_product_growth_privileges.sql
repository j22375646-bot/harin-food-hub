begin;

revoke all on table public.product_growth_profiles, public.product_growth_offers, public.product_detail_checklists
  from service_role;
grant select, insert, update, delete on table public.product_growth_profiles, public.product_growth_offers, public.product_detail_checklists
  to service_role;

revoke all on sequence public.product_growth_offers_id_seq from service_role;
grant usage, select on sequence public.product_growth_offers_id_seq to service_role;

commit;
