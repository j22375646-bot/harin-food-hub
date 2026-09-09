'use strict';
const {createConfiguredControlDatabase}=require('./control-database-config.js');

// Fixed catalog-only query. Deparse policy expressions but never execute them.
// The broker's OWNER/tenant checks and other roles' policies remain separate.
const POLICY_SQL=`
with runtime_role as (
 select * from pg_catalog.pg_roles where rolname='moaon_control_app'
), expected_tables(code,schema_name,table_name) as (values
 ('PROVIDER_CREDENTIALS_POLICIES','moaon_control','provider_credentials'),
 ('ACCOUNT_STATE_POLICIES','moaon_auth','account_state'),
 ('DASHBOARD_USERS_POLICIES','public','dashboard_users'),
 ('DASHBOARD_SESSIONS_POLICIES','public','dashboard_sessions')
), targets as (
 select e.*,c.oid,c.relkind,c.relrowsecurity,c.relowner from expected_tables e
 left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
 left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
), expected as (
 select code,'moaon_credential_runtime_select' as name,'r' as command,'true'::text as using_expr,null::text as check_expr from targets
 union all select code,'moaon_credential_runtime_lock','w','true','false' from targets where table_name<>'provider_credentials'
 union all select code,'moaon_credential_runtime_insert','a',null,'true' from targets where table_name='provider_credentials'
 union all select code,'moaon_credential_runtime_update','w','true','true' from targets where table_name='provider_credentials'
), relevant as (
 select t.code,p.* from targets t join pg_catalog.pg_policy p on p.polrelid=t.oid
 where 0=any(p.polroles) or (select oid from runtime_role)=any(p.polroles)
 or p.polname in ('moaon_credential_runtime_select','moaon_credential_runtime_lock',
 'moaon_credential_runtime_insert','moaon_credential_runtime_update')
)
select 'RUNTIME_ROLE' as code,exists(select 1 from runtime_role) as present,
 exists(select 1 from runtime_role r where current_user='moaon_control_app'
 and session_user='moaon_control_app' and not r.rolsuper and not r.rolinherit
 and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication and not r.rolbypassrls
 and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid)) as valid
union all select 'RLS_SESSION',true,current_setting('row_security')='on' and current_setting('search_path')='pg_catalog'
union all select t.code,t.oid is not null,
 coalesce(t.relkind='r' and t.relrowsecurity and t.relowner<>(select oid from runtime_role),false)
 and (select count(*) from relevant p where p.code=t.code)=(select count(*) from expected e where e.code=t.code)
 and not exists(select 1 from expected e where e.code=t.code and not exists(
  select 1 from relevant p where p.code=e.code and p.polname=e.name and p.polcmd::text=e.command
  and p.polpermissive and p.polroles=array[(select oid from runtime_role)]
  and pg_catalog.pg_get_expr(p.polqual,p.polrelid,false) is not distinct from e.using_expr
  and pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false) is not distinct from e.check_expr
  -- Canonical constants must not reference functions/operators/other relations.
  and not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_catalog.pg_policy'::regclass
   and d.objid=p.oid and (d.refclassid<>'pg_catalog.pg_class'::regclass or d.refobjid<>p.polrelid or d.refobjsubid<>0))
 )) from targets t`;
const CODES=['RUNTIME_ROLE','RLS_SESSION','PROVIDER_CREDENTIALS_POLICIES','ACCOUNT_STATE_POLICIES','DASHBOARD_USERS_POLICIES','DASHBOARD_SESSIONS_POLICIES'];
const OPERATIONS=['OTHER_POLICIES','COLUMN_ACL','TABLE_CONSTRAINTS','FUNCTION_DEFINITIONS','TRIGGERS_AND_RULES','SESSION_FENCES','QUOTA_BEHAVIOR','OWNER_POLICY','KEY_CUSTODY','INGRESS','PLATFORM_AUTHENTICATION'];
function report(checks){return Object.freeze({
 status:checks.length===CODES.length&&checks.every(x=>x.status==='MATCH')?'CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS':'BLOCKED',
 checks:Object.freeze(checks.map(x=>Object.freeze(x))),
 operationalChecks:Object.freeze(OPERATIONS.map(code=>Object.freeze({code,status:'UNVERIFIED'}))),
});}
async function checkCredentialPolicies({env=process.env,createControlDatabase=createConfiguredControlDatabase}={}){
 let flag;try{flag=env?.MOAON_CONTROL_DB_DIAGNOSTIC;}catch{return report([{code:'DIAGNOSTIC_OPT_IN',status:'INVALID'}]);}
 if(flag!=='1')return report([{code:'DIAGNOSTIC_OPT_IN',status:flag===undefined||flag===''||flag==='0'?'DISABLED':'INVALID'}]);
 let database,checks;
 try{
  database=createControlDatabase(env,{diagnostic(){}});
  if(database===null)return report([{code:'CONTROL_DATABASE_CONFIG',status:'MISSING'}]);
  if(typeof database?.query!=='function'||typeof database?.close!=='function')throw Error();
  const result=await database.query(POLICY_SQL);
  if(!Array.isArray(result?.rows)||result.rows.length!==CODES.length)throw Error();
  checks=CODES.map(code=>{
   const rows=result.rows.filter(row=>row?.code===code);
   if(rows.length!==1||typeof rows[0].present!=='boolean'||typeof rows[0].valid!=='boolean'||!rows[0].present&&rows[0].valid)throw Error();
   return {code,status:!rows[0].present?'MISSING':rows[0].valid?'MATCH':'INVALID'};
  });
 }catch{checks=[{code:'CATALOG_QUERY',status:'UNAVAILABLE'}];}
 finally{if(database&&typeof database.close==='function')try{await database.close();}catch{checks=[{code:'DATABASE_CLOSE',status:'UNAVAILABLE'}];}}
 return report(checks);
}
module.exports={checkCredentialPolicies};
