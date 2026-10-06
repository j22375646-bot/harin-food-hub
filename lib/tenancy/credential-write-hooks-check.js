'use strict';
const {createConfiguredControlDatabase}=require('./control-database-config.js');

// Catalog inspection only: never execute a trigger, rule or stored function.
// Candidate tables have no user triggers/rules/inheritance. PostgreSQL's own
// FK triggers are allowed; this is NOT an attestation of all FK definitions.
const HOOKS_SQL=`
with expected(code,schema_name,table_name) as (values
 ('PROVIDER_CREDENTIALS_HOOKS','moaon_control','provider_credentials'),
 ('ACCOUNT_STATE_HOOKS','moaon_auth','account_state'),
 ('DASHBOARD_USERS_HOOKS','public','dashboard_users'),
 ('DASHBOARD_SESSIONS_HOOKS','public','dashboard_sessions')
), targets as (
 select e.*,c.oid,c.relkind,c.relispartition from expected e
 left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
 left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
)
select 'REPLICATION_MODE' as code,true as present,current_setting('session_replication_role')='origin' as valid
union all select t.code,t.oid is not null,
 coalesce(t.relkind='r' and not t.relispartition,false)
 and not exists(select 1 from pg_catalog.pg_inherits i where i.inhrelid=t.oid or i.inhparent=t.oid)
 and not exists(select 1 from pg_catalog.pg_rewrite r where r.ev_class=t.oid)
 and not exists(
  select 1 from pg_catalog.pg_trigger g where g.tgrelid=t.oid and not (
   g.tgisinternal and g.tgenabled='O' and g.tgconstraint<>0
   and exists(select 1 from pg_catalog.pg_constraint c where c.oid=g.tgconstraint
    and c.contype='f' and (c.conrelid=t.oid or c.confrelid=t.oid))
   and exists(select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid=g.tgfoid and n.nspname='pg_catalog' and l.lanname='internal'
    and p.prorettype=2279 and p.pronargs=0 and p.prokind='f' and not p.prosecdef and not p.proretset
    and p.proname in ('RI_FKey_check_ins','RI_FKey_check_upd',
     'RI_FKey_noaction_del','RI_FKey_noaction_upd','RI_FKey_restrict_del','RI_FKey_restrict_upd',
     'RI_FKey_cascade_del','RI_FKey_cascade_upd','RI_FKey_setnull_del','RI_FKey_setnull_upd',
     'RI_FKey_setdefault_del','RI_FKey_setdefault_upd'))
  )
 ) from targets t`;
const CODES=['REPLICATION_MODE','PROVIDER_CREDENTIALS_HOOKS','ACCOUNT_STATE_HOOKS','DASHBOARD_USERS_HOOKS','DASHBOARD_SESSIONS_HOOKS'];
const OPERATIONS=['OTHER_TABLE_HOOKS','FOREIGN_KEY_DEFINITIONS_AND_COMPLETENESS','DATABASE_ACL','POLICIES','DEFAULT_EXPRESSIONS','FUNCTION_DEFINITIONS','SESSION_FENCES','QUOTA_BEHAVIOR','OWNER_POLICY','KEY_CUSTODY','INGRESS','PLATFORM_AUTHENTICATION'];
function report(checks){return Object.freeze({
 status:checks.length===CODES.length&&checks.every(x=>x.status==='MATCH')?'CREDENTIAL_WRITE_HOOKS_MATCH_REQUIRES_OPERATIONS':'BLOCKED',
 checks:Object.freeze(checks.map(x=>Object.freeze(x))),
 operationalChecks:Object.freeze(OPERATIONS.map(code=>Object.freeze({code,status:'UNVERIFIED'}))),
});}
async function checkCredentialWriteHooks({env=process.env,createControlDatabase=createConfiguredControlDatabase}={}){
 let flag;try{flag=env?.MOAON_CONTROL_DB_DIAGNOSTIC;}catch{return report([{code:'DIAGNOSTIC_OPT_IN',status:'INVALID'}]);}
 if(flag!=='1')return report([{code:'DIAGNOSTIC_OPT_IN',status:flag===undefined||flag===''||flag==='0'?'DISABLED':'INVALID'}]);
 let database,checks;
 try{
  database=createControlDatabase(env,{diagnostic(){}});
  if(database===null)return report([{code:'CONTROL_DATABASE_CONFIG',status:'MISSING'}]);
  if(typeof database?.query!=='function'||typeof database?.close!=='function')throw Error();
  const result=await database.query(HOOKS_SQL);
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
module.exports={checkCredentialWriteHooks};
