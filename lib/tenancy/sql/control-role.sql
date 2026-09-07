-- Candidate only: restricted direct-PostgreSQL role for the MOAON membership
-- control plane. Do not auto-apply this file or run it against production.
-- Credential provisioning is deliberately separate; this role starts NOLOGIN.

do $moaon_role$
declare
  existing pg_roles%rowtype;
  role_oid oid;
begin
  select * into existing from pg_roles where rolname = 'moaon_control_app';
  if not found then
    execute 'create role moaon_control_app with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  else
    role_oid := existing.oid;
    if existing.rolcanlogin
      or existing.rolsuper
      or existing.rolcreatedb
      or existing.rolcreaterole
      or existing.rolinherit
      or existing.rolreplication
      or existing.rolbypassrls
      or exists (
        select 1 from pg_auth_members
        where member = role_oid or roleid = role_oid
      )
      or exists (
        select 1 from pg_namespace where nspowner = role_oid
      )
      or exists (
        select 1 from pg_class where relowner = role_oid
      )
    then
      raise exception using
        errcode = '42501',
        message = 'unsafe preexisting moaon_control_app role';
    end if;
  end if;
end
$moaon_role$;

do $moaon_schema$
begin
  if to_regnamespace('moaon_control') is null
    or to_regclass('moaon_control.tenants') is null
    or to_regclass('moaon_control.memberships') is null
    or to_regclass('moaon_control.invitations') is null
    or to_regclass('moaon_control.audit_events') is null
  then
    raise exception using
      errcode = '42P01',
      message = 'moaon control schema is not provisioned';
  end if;
end
$moaon_schema$;

revoke all on schema moaon_control from moaon_control_app;
revoke all on all tables in schema moaon_control from moaon_control_app;
revoke all on all sequences in schema moaon_control from moaon_control_app;

grant usage on schema moaon_control to moaon_control_app;

-- SELECT FOR UPDATE needs one UPDATE privilege. A column grant on the immutable
-- primary key is the narrowest lock-enabling grant; the false WITH CHECK policy
-- below prevents changing it.
grant select on table moaon_control.tenants to moaon_control_app;
grant update (id) on table moaon_control.tenants to moaon_control_app;

grant select, insert on table moaon_control.memberships to moaon_control_app;
grant update (role, status, version, updated_at)
  on table moaon_control.memberships to moaon_control_app;

grant select, insert on table moaon_control.invitations to moaon_control_app;
grant update (status, accepted_by, accepted_at)
  on table moaon_control.invitations to moaon_control_app;

grant insert on table moaon_control.audit_events to moaon_control_app;

drop policy if exists moaon_control_tenants_select on moaon_control.tenants;
drop policy if exists moaon_control_tenants_lock on moaon_control.tenants;
create policy moaon_control_tenants_select on moaon_control.tenants
  for select to moaon_control_app using (true);
create policy moaon_control_tenants_lock on moaon_control.tenants
  for update to moaon_control_app using (true) with check (false);

drop policy if exists moaon_control_memberships_select on moaon_control.memberships;
drop policy if exists moaon_control_memberships_insert on moaon_control.memberships;
drop policy if exists moaon_control_memberships_update on moaon_control.memberships;
create policy moaon_control_memberships_select on moaon_control.memberships
  for select to moaon_control_app using (true);
create policy moaon_control_memberships_insert on moaon_control.memberships
  for insert to moaon_control_app with check (true);
create policy moaon_control_memberships_update on moaon_control.memberships
  for update to moaon_control_app using (true) with check (true);

drop policy if exists moaon_control_invitations_select on moaon_control.invitations;
drop policy if exists moaon_control_invitations_insert on moaon_control.invitations;
drop policy if exists moaon_control_invitations_update on moaon_control.invitations;
create policy moaon_control_invitations_select on moaon_control.invitations
  for select to moaon_control_app using (true);
create policy moaon_control_invitations_insert on moaon_control.invitations
  for insert to moaon_control_app with check (true);
create policy moaon_control_invitations_update on moaon_control.invitations
  for update to moaon_control_app using (true) with check (true);

drop policy if exists moaon_control_audit_insert on moaon_control.audit_events;
create policy moaon_control_audit_insert on moaon_control.audit_events
  for insert to moaon_control_app with check (true);
