'use strict';
const {createConfiguredControlDatabase}=require('./control-database-config.js');

// One fixed catalog query. No function execution, tenant data or credential data
// is involved. Column layout, policy bodies and function bodies are NOT attested.
const CATALOG_SQL=`
with expected_tables(code,schema_name,table_name) as (values
 ('TENANTS','moaon_control','tenants'),
 ('MEMBERSHIPS','moaon_control','memberships'),
 ('PROVIDER_CREDENTIALS','moaon_control','provider_credentials'),
 ('ACCOUNT_STATE','moaon_auth','account_state'),
 ('DASHBOARD_USERS','public','dashboard_users'),
 ('DASHBOARD_SESSIONS','public','dashboard_sessions'),
 ('CREDENTIAL_REQUEST_LIMITS','moaon_control','credential_request_limits'),
 ('INVITATIONS','moaon_control','invitations'),
 ('AUDIT_EVENTS','moaon_control','audit_events')
), expected_functions(code,function_name) as (values
 ('CREDENTIAL_NETWORK_FUNCTION','moaon_consume_credential_network'),
 ('CREDENTIAL_USER_FUNCTION','moaon_consume_credential_user')
)
select e.code,c.oid is not null as present,
 coalesce(c.relkind='r' and c.relrowsecurity,false) as valid
from expected_tables e
left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
union all
select e.code,count(p.oid)>0 as present,
 count(p.oid)=1 and coalesce(bool_and(p.prokind='f' and not p.prosecdef
  and p.prorettype=16 and not p.proretset and p.pronargs=1
  and p.proargtypes='25'::pg_catalog.oidvector and p.proargmodes is null
  and p.provariadic=0 and p.pronargdefaults=0),false) as valid
from expected_functions e
left join pg_catalog.pg_namespace n on n.nspname='public'
left join pg_catalog.pg_proc p on p.pronamespace=n.oid and p.proname=e.function_name
group by e.code`;
const CODES=['TENANTS','MEMBERSHIPS','PROVIDER_CREDENTIALS','ACCOUNT_STATE','DASHBOARD_USERS','DASHBOARD_SESSIONS','CREDENTIAL_REQUEST_LIMITS','INVITATIONS','AUDIT_EVENTS','CREDENTIAL_NETWORK_FUNCTION','CREDENTIAL_USER_FUNCTION'];
const OPERATIONS=['DATABASE_ACL','COLUMN_LAYOUT','POLICIES','FUNCTION_DEFINITIONS','QUOTA_BEHAVIOR','SESSION_FENCES','INGRESS','OWNER_POLICY','KEY_CUSTODY','PLATFORM_AUTHENTICATION'];
function report(checks){return Object.freeze({
 status:checks.length===CODES.length&&checks.every(x=>x.status==='PRESENT')?'SCHEMA_PRESENT_REQUIRES_OPERATIONS':'BLOCKED',
 checks:Object.freeze(checks.map(x=>Object.freeze(x))),
 operationalChecks:Object.freeze(OPERATIONS.map(code=>Object.freeze({code,status:'UNVERIFIED'}))),
});}
async function checkCredentialSchema({env=process.env,createControlDatabase=createConfiguredControlDatabase}={}){
 // Require opt-in before even reading database configuration or making a pool.
 let flag;try{flag=env?.MOAON_CONTROL_DB_DIAGNOSTIC;}catch{return report([{code:'DIAGNOSTIC_OPT_IN',status:'INVALID'}]);}
 if(flag!=='1')return report([{code:'DIAGNOSTIC_OPT_IN',status:flag===undefined||flag===''||flag==='0'?'DISABLED':'INVALID'}]);
 let database,checks;
 try{
  // The existing default transport pins the restricted role and verified TLS,
  // with bounded acquisition/statement/lock timeouts. No alternate DB URL.
  database=createControlDatabase(env,{diagnostic(){}});
  if(database===null)return report([{code:'CONTROL_DATABASE_CONFIG',status:'MISSING'}]);
  if(typeof database?.query!=='function'||typeof database?.close!=='function')throw Error();
  const result=await database.query(CATALOG_SQL);
  if(!Array.isArray(result?.rows)||result.rows.length!==CODES.length)throw Error();
  checks=CODES.map(code=>{
   const matched=result.rows.filter(row=>row?.code===code);
   if(matched.length!==1||typeof matched[0].present!=='boolean'||typeof matched[0].valid!=='boolean'||!matched[0].present&&matched[0].valid)throw Error();
   return {code,status:!matched[0].present?'MISSING':matched[0].valid?'PRESENT':'INVALID'};
  });
 }catch{checks=[{code:'CATALOG_QUERY',status:'UNAVAILABLE'}];}
 finally{
  if(database&&typeof database.close==='function')try{await database.close();}catch{checks=[{code:'DATABASE_CLOSE',status:'UNAVAILABLE'}];}
 }
 return report(checks);
}
module.exports={checkCredentialSchema};
