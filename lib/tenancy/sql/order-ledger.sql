-- Candidate only: NOT an automatic production migration.
-- No legacy order copy, no credentials, no public grants.
-- Provision a dedicated restricted transport and verify pool/RLS behavior before use.
create schema moaon_data;
revoke all on schema moaon_data from public;
create table moaon_data.connections (
 tenant_id uuid not null references moaon_control.tenants(id),
 id uuid not null,
 provider text not null check(provider in ('CAFE24','NAVER_COMMERCE','COUPANG','COUPANG_ROCKET_GROWTH')),
 status text not null check(status in ('ACTIVE','DISCONNECTED')),
 primary key(tenant_id,id)
);
create table moaon_data.orders (
 tenant_id uuid not null,
 connection_id uuid not null,
 external_order_id text not null check(length(external_order_id) between 1 and 128 and external_order_id=btrim(external_order_id)),
 product_name text not null check(length(product_name) between 1 and 500),
 paid_amount bigint check(paid_amount between 0 and 9000000000000),
 status text not null check(status in ('PAID','PREPARING','READY_TO_SHIP','WAITING_FOR_CARRIER','SHIPPING','DELIVERED','CANCELLED')),
 source_updated_at timestamptz not null,
 primary key(tenant_id,connection_id,external_order_id),
 foreign key(tenant_id,connection_id) references moaon_data.connections(tenant_id,id)
);
alter table moaon_data.connections enable row level security;
alter table moaon_data.connections force row level security;
alter table moaon_data.orders enable row level security;
alter table moaon_data.orders force row level security;
create policy tenant_connections on moaon_data.connections
 using(tenant_id::text=current_setting('moaon.tenant_id',true))
 with check(tenant_id::text=current_setting('moaon.tenant_id',true));
create policy tenant_orders on moaon_data.orders
 using(tenant_id::text=current_setting('moaon.tenant_id',true))
 with check(tenant_id::text=current_setting('moaon.tenant_id',true));
revoke all on all tables in schema moaon_data from public;
