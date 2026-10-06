-- Candidate only; apply after auth-session-fence, control-plane, credential-store
-- and control-role in an isolated database. Never automatically apply to production.
-- The trusted server broker still enforces OWNER, tenant and live session checks.
-- Provisioning deliberately requires NOLOGIN; credentials are a separate step.
-- One DO statement makes validation and all ACL/policy changes atomic.
do $credential_runtime$
declare
  app pg_roles%rowtype;
  target regclass;
  target_name text;
  columns text;
  policy_prefix text;
begin
  select * into app from pg_roles where rolname='moaon_control_app';
  if not found then raise exception 'control role must be provisioned first'; end if;
  if app.rolcanlogin or app.rolsuper or app.rolinherit or app.rolcreatedb
    or app.rolcreaterole or app.rolreplication or app.rolbypassrls
    or exists(select 1 from pg_auth_members where member=app.oid or roleid=app.oid)
    or exists(select 1 from pg_namespace where nspowner=app.oid)
    or exists(select 1 from pg_class where relowner=app.oid)
  then raise exception using errcode='42501',message='unsafe credential runtime role'; end if;

  if exists(select 1 from pg_namespace where nspname in ('public','moaon_auth','moaon_control')
    and has_schema_privilege(app.oid,oid,'CREATE'))
  then raise exception 'credential runtime role has schema CREATE privilege'; end if;

  -- Fail closed on absent/unsafe prerequisites before modifying any grants.
  foreach target_name in array array['moaon_control.tenants','moaon_control.memberships',
    'moaon_control.invitations','moaon_control.audit_events','moaon_auth.account_state',
    'public.dashboard_users','public.dashboard_sessions','moaon_control.provider_credentials'] loop
    target:=to_regclass(target_name);
    if target is null or not exists(select 1 from pg_class where oid=target and relkind='r' and relrowsecurity)
    then raise exception 'required credential runtime table or RLS missing: %',target_name; end if;
  end loop;

  foreach target_name in array array['moaon_auth.account_state','public.dashboard_users',
    'public.dashboard_sessions','moaon_control.provider_credentials'] loop
    target:=to_regclass(target_name);
    -- Table REVOKE alone leaves direct column grants in place.
    select string_agg(quote_ident(attname),',') into columns from pg_attribute
      where attrelid=target and attnum>0 and not attisdropped;
    -- PUBLIC grants and unrelated applicable policies would defeat this contract.
    -- Refuse them rather than silently change permissions belonging to other users.
    if exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid=target and a.grantee=0)
      or exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a where c.attrelid=target and a.grantee=0)
      or exists(select 1 from pg_policy where polrelid=target and (0=any(polroles) or app.oid=any(polroles))
        and polname not in ('moaon_credential_runtime_select','moaon_credential_runtime_lock',
          'moaon_credential_runtime_insert','moaon_credential_runtime_update'))
    then raise exception 'unexpected public privileges or applicable policies: %',target_name; end if;
    if exists(select 1 from pg_policy where polrelid=target
      and polname in ('moaon_credential_runtime_select','moaon_credential_runtime_lock',
        'moaon_credential_runtime_insert','moaon_credential_runtime_update')
      and polroles<>array[app.oid])
    then raise exception 'credential policy name belongs to another role: %',target_name; end if;
    execute format('revoke all privileges on table %s from moaon_control_app',target);
    execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on table %2$s from moaon_control_app',columns,target);
    foreach policy_prefix in array array['select','lock','insert','update'] loop
      execute format('drop policy if exists %I on %s','moaon_credential_runtime_'||policy_prefix,target);
    end loop;
    execute format('create policy moaon_credential_runtime_select on %s for select to moaon_control_app using(true)',target);
    if target_name<>'moaon_control.provider_credentials' then
      execute format('create policy moaon_credential_runtime_lock on %s for update to moaon_control_app using(true) with check(false)',target);
    end if;
  end loop;
  grant usage on schema moaon_auth,public,moaon_control to moaon_control_app;
  grant select(user_id,blocked),update(user_id) on moaon_auth.account_state to moaon_control_app;
  grant select(user_id,active),update(user_id) on public.dashboard_users to moaon_control_app;
  grant select(id,user_id,token_hash,revoked_at,expires_at),update(id) on public.dashboard_sessions to moaon_control_app;
  grant select(tenant_id,provider,revision),insert(tenant_id,provider,revision,envelope,updated_by),
    update(revision,envelope,updated_by,updated_at) on moaon_control.provider_credentials to moaon_control_app;
  create policy moaon_credential_runtime_insert on moaon_control.provider_credentials
    for insert to moaon_control_app with check(true);
  create policy moaon_credential_runtime_update on moaon_control.provider_credentials
    for update to moaon_control_app using(true) with check(true);
end
$credential_runtime$;
