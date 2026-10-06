-- Candidate only: tested in isolated PostgreSQL; not an applied production migration.
create table if not exists moaon_control.provider_credentials (
 tenant_id uuid not null references moaon_control.tenants(id),
 provider text not null check(provider in ('NAVER','CAFE24','COUPANG','EPOST')),
 revision integer not null check(revision>0),
 envelope jsonb not null check(jsonb_typeof(envelope)='object' and octet_length(envelope::text)<=32768),
 updated_by uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,provider),
 foreign key(tenant_id,updated_by) references moaon_control.memberships(tenant_id,user_id)
);
alter table moaon_control.provider_credentials enable row level security;
revoke all on moaon_control.provider_credentials from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on moaon_control.provider_credentials from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on moaon_control.provider_credentials from authenticated; end if;
end $$;
-- Runtime role grants and policies require a separate reviewed integration migration.
