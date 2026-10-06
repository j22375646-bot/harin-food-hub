'use strict';
const {createConfiguredControlDatabase}=require('./control-database-config.js');

// Catalog and built-in privilege inspection only. No protected table rows or
// application functions are read/called. Never extend these from CLI input.
const CONTRACT_SQL=`
with expected_tables(code,schema_name,table_name,select_columns,insert_columns,update_columns) as (values
 ('PROVIDER_CREDENTIALS_ACL','moaon_control','provider_credentials',array['tenant_id','provider','revision'],array['tenant_id','provider','revision','envelope','updated_by'],array['revision','envelope','updated_by','updated_at']),
 ('ACCOUNT_STATE_ACL','moaon_auth','account_state',array['user_id','blocked'],array[]::text[],array['user_id']),
 ('DASHBOARD_USERS_ACL','public','dashboard_users',array['user_id','active'],array[]::text[],array['user_id']),
 ('DASHBOARD_SESSIONS_ACL','public','dashboard_sessions',array['id','user_id','token_hash','revoked_at','expires_at'],array[]::text[],array['id'])
), expected_columns(column_name,type_oid) as (values
 ('tenant_id',2950),('provider',25),('revision',23),('envelope',3802),('updated_by',2950),('updated_at',1184)
), runtime_role as (
 select oid,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls
 from pg_catalog.pg_roles where rolname='moaon_control_app'
), targets as (
 select e.*,c.oid,c.relkind,c.relacl from expected_tables e
 left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
 left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
), live_columns as (
 select t.code,t.oid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,
 a.attidentity,a.attgenerated,a.atthasdef,a.attacl
 from targets t join pg_catalog.pg_attribute a on a.attrelid=t.oid
 where a.attnum>0 and not a.attisdropped
)
select 'RUNTIME_ROLE' as code,exists(select 1 from runtime_role) as present,
 coalesce((select current_user='moaon_control_app' and session_user='moaon_control_app'
  and not rolsuper and not rolinherit and not rolcreaterole and not rolcreatedb
  and not rolreplication and not rolbypassrls from runtime_role),false) as valid
union all
select 'PROVIDER_COLUMNS',t.oid is not null,
 coalesce(t.relkind='r' and (select count(*) from live_columns where code=t.code)=6
 and not exists(select 1 from expected_columns e left join live_columns a
  on a.code=t.code and a.attname=e.column_name
  where a.attnum is null or a.atttypid<>e.type_oid or a.atttypmod<>-1
   or not a.attnotnull or a.attidentity<>'' or a.attgenerated<>''
   or (e.column_name='updated_at' and not a.atthasdef)),false)
from targets t where t.code='PROVIDER_CREDENTIALS_ACL'
union all
select t.code,t.oid is not null,
 coalesce(t.relkind='r' and exists(select 1 from runtime_role)
 and not pg_catalog.has_table_privilege((select oid from runtime_role),t.oid,'SELECT,INSERT,UPDATE,REFERENCES,DELETE,TRUNCATE,TRIGGER')
 and not exists(select 1 from pg_catalog.aclexplode(t.relacl) acl where acl.grantee=0 or acl.grantee=(select oid from runtime_role))
 and not exists(select 1 from live_columns a cross join lateral pg_catalog.aclexplode(a.attacl) acl where a.code=t.code and acl.grantee=0)
 and not exists(select 1 from unnest(t.select_columns||t.insert_columns||t.update_columns) needed(column_name)
  where not exists(select 1 from live_columns a where a.code=t.code and a.attname=needed.column_name))
 and not exists(select 1 from live_columns a cross join (values('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) privilege(kind)
  where a.code=t.code and (
   pg_catalog.has_column_privilege((select oid from runtime_role),t.oid,a.attnum,privilege.kind)
    <> case privilege.kind when 'SELECT' then a.attname=any(t.select_columns)
      when 'INSERT' then a.attname=any(t.insert_columns)
      when 'UPDATE' then a.attname=any(t.update_columns) else false end
   or pg_catalog.has_column_privilege((select oid from runtime_role),t.oid,a.attnum,privilege.kind||' WITH GRANT OPTION')
  )),false)
from targets t`;
const CODES=['RUNTIME_ROLE','PROVIDER_COLUMNS','PROVIDER_CREDENTIALS_ACL','ACCOUNT_STATE_ACL','DASHBOARD_USERS_ACL','DASHBOARD_SESSIONS_ACL'];
const OPERATIONS=['TABLE_CONSTRAINTS','DEFAULT_EXPRESSIONS','INDEXES','POLICIES','FUNCTION_DEFINITIONS','OTHER_DATABASE_ACL','QUOTA_BEHAVIOR','OWNER_POLICY','KEY_CUSTODY','SESSION_FENCES','INGRESS','PLATFORM_AUTHENTICATION'];
function report(checks){return Object.freeze({
 status:checks.length===CODES.length&&checks.every(x=>x.status==='MATCH')?'CREDENTIAL_CONTRACT_MATCHES_REQUIRES_OPERATIONS':'BLOCKED',
 checks:Object.freeze(checks.map(x=>Object.freeze(x))),
 operationalChecks:Object.freeze(OPERATIONS.map(code=>Object.freeze({code,status:'UNVERIFIED'}))),
});}
async function checkCredentialContract({env=process.env,createControlDatabase=createConfiguredControlDatabase}={}){
 let flag;try{flag=env?.MOAON_CONTROL_DB_DIAGNOSTIC;}catch{return report([{code:'DIAGNOSTIC_OPT_IN',status:'INVALID'}]);}
 if(flag!=='1')return report([{code:'DIAGNOSTIC_OPT_IN',status:flag===undefined||flag===''||flag==='0'?'DISABLED':'INVALID'}]);
 let database,checks;
 try{
  database=createControlDatabase(env,{diagnostic(){}});
  if(database===null)return report([{code:'CONTROL_DATABASE_CONFIG',status:'MISSING'}]);
  if(typeof database?.query!=='function'||typeof database?.close!=='function')throw Error();
  const result=await database.query(CONTRACT_SQL);
  if(!Array.isArray(result?.rows)||result.rows.length!==CODES.length)throw Error();
  checks=CODES.map(code=>{
   const found=result.rows.filter(row=>row?.code===code);
   if(found.length!==1||typeof found[0].present!=='boolean'||typeof found[0].valid!=='boolean'||!found[0].present&&found[0].valid)throw Error();
   return {code,status:!found[0].present?'MISSING':found[0].valid?'MATCH':'INVALID'};
  });
 }catch{checks=[{code:'CATALOG_QUERY',status:'UNAVAILABLE'}];}
 finally{if(database&&typeof database.close==='function')try{await database.close();}catch{checks=[{code:'DATABASE_CLOSE',status:'UNAVAILABLE'}];}}
 return report(checks);
}
module.exports={checkCredentialContract};
