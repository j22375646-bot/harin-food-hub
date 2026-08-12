begin;

revoke all on public.channel_shipping_rules from service_role;
grant select, insert, update on public.channel_shipping_rules to service_role;

commit;
