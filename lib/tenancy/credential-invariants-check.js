'use strict';
const {createConfiguredControlDatabase}=require('./control-database-config.js');

// Exact pg_get_expr forms observed from the unchanged candidate on PG17/18.
// No whitespace stripping, expression evaluation, application function calls,
// stored body reads or table data reads. Unsupported catalog versions fail shut.
const INVARIANTS_SQL=`
with target as (
 select c.oid,c.relkind from (values(1)) anchor(x)
 left join pg_catalog.pg_namespace n on n.nspname='moaon_control'
 left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname='provider_credentials'
), constraints as (
 select c.*,coalesce((to_jsonb(c)->>'conenforced')::boolean,true) as enforced,
 array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) as column_names,
 array(select a.attname::text from unnest(c.confkey) with ordinality k(num,ord)
  join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord) as foreign_names
 from pg_catalog.pg_constraint c where c.conrelid=(select oid from target)
), default_value as (
 select d.* from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a
 on a.attrelid=d.adrelid and a.attnum=d.adnum
 where d.adrelid=(select oid from target) and a.attname='updated_at' and not a.attisdropped
), trusted_functions as (
 select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 join pg_catalog.pg_language l on l.oid=p.prolang
 where n.nspname='pg_catalog' and l.lanname='internal' and p.prokind='f' and not p.proretset
 and ((p.proname='clock_timestamp' and p.pronargs=0 and p.prorettype=1184)
  or (p.proname='jsonb_typeof' and p.proargtypes='3802'::pg_catalog.oidvector and p.prorettype=25)
  or (p.proname='octet_length' and p.proargtypes='25'::pg_catalog.oidvector and p.prorettype=23))
), trusted_operators as (
 select o.oid from pg_catalog.pg_operator o join pg_catalog.pg_namespace n on n.oid=o.oprnamespace
 join pg_catalog.pg_proc p on p.oid=o.oprcode join pg_catalog.pg_namespace pn on pn.oid=p.pronamespace
 where n.nspname='pg_catalog' and pn.nspname='pg_catalog' and o.oprresult=16
 and ((o.oprname='=' and o.oprleft=25 and o.oprright=25)
  or (o.oprname in ('>','<=') and o.oprleft=23 and o.oprright=23))
), uuid_equality as (
 select o.oid from pg_catalog.pg_operator o join pg_catalog.pg_namespace n on n.oid=o.oprnamespace
 where n.nspname='pg_catalog' and o.oprname='=' and o.oprleft=2950 and o.oprright=2950 and o.oprresult=16
), expected_checks(code,expression,column_name) as (values
 ('PROVIDER_CHECK',$expr$(provider = ANY (ARRAY['NAVER'::text, 'CAFE24'::text, 'COUPANG'::text, 'EPOST'::text]))$expr$,'provider'),
 ('REVISION_CHECK',$expr$(revision > 0)$expr$,'revision'),
 ('ENVELOPE_CHECK',$expr$((jsonb_typeof(envelope) = 'object'::text) AND (octet_length((envelope)::text) <= 32768))$expr$,'envelope')
), expected_foreign_keys(code,table_name,local_names,foreign_names) as (values
 ('TENANT_FOREIGN_KEY','tenants',array['tenant_id'],array['id']),
 ('MEMBER_FOREIGN_KEY','memberships',array['tenant_id','updated_by'],array['tenant_id','user_id'])
)
select 'CATALOG_VERSION' as code,true as present,
 current_setting('server_version_num')::integer/10000 in (17,18) as valid
union all select 'CATALOG_SEARCH_PATH',true,current_setting('search_path')='pg_catalog'
union all select 'PROVIDER_TABLE',oid is not null,coalesce(relkind='r',false) from target
union all select 'CONSTRAINT_SET',(select oid from target) is not null,
 (select count(*) from constraints where contype='p')=1
 and (select count(*) from constraints where contype='f')=2
 and (select count(*) from constraints where contype='c')=3
 and not exists(select 1 from constraints where contype not in ('p','f','c','n'))
union all select 'PRIMARY_KEY',exists(select 1 from constraints where contype='p'),
 (select count(*) from constraints where contype='p')=1 and exists(
 select 1 from constraints c join pg_catalog.pg_index i on i.indexrelid=c.conindid and i.indrelid=c.conrelid
 join pg_catalog.pg_class idx on idx.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=idx.relam
 where c.contype='p' and c.column_names=array['tenant_id','provider'] and c.convalidated and c.enforced
 and not c.condeferrable and not c.condeferred and am.amname='btree'
 and i.indisvalid and i.indisready and i.indislive and i.indisunique and i.indisprimary and i.indimmediate
 and not i.indnullsnotdistinct and i.indnkeyatts=2 and i.indnatts=2 and i.indpred is null and i.indexprs is null
 and array(select k from unnest(i.indkey) with ordinality key(k,ord) order by ord)=c.conkey
 and array(select n.nspname||'.'||o.opcname from unnest(i.indclass) with ordinality key(k,ord)
  join pg_catalog.pg_opclass o on o.oid=key.k join pg_catalog.pg_namespace n on n.oid=o.opcnamespace order by key.ord)=array['pg_catalog.uuid_ops','pg_catalog.text_ops']
 and array(select k::oid from unnest(i.indcollation) with ordinality key(k,ord) order by ord)=array[0::oid,(select col.oid from pg_catalog.pg_collation col join pg_catalog.pg_namespace n on n.oid=col.collnamespace where n.nspname='pg_catalog' and col.collname='default')]
)
union all select e.code,exists(select 1 from constraints c where c.contype='f' and c.column_names=e.local_names),
 (select count(*) from constraints c where c.contype='f' and c.column_names=e.local_names)=1 and exists(
 select 1 from constraints c join pg_catalog.pg_class dest on dest.oid=c.confrelid
 join pg_catalog.pg_namespace n on n.oid=dest.relnamespace
 where c.contype='f' and c.column_names=e.local_names and c.foreign_names=e.foreign_names
 and n.nspname='moaon_control' and dest.relname=e.table_name and dest.relkind='r'
 and c.convalidated and c.enforced and not c.condeferrable and not c.condeferred
 and c.confupdtype='a' and c.confdeltype='a' and c.confmatchtype='s'
 and cardinality(c.conpfeqop)=cardinality(e.local_names) and cardinality(c.conppeqop)=cardinality(e.local_names) and cardinality(c.conffeqop)=cardinality(e.local_names)
 and not exists(select 1 from unnest(c.conpfeqop||c.conppeqop||c.conffeqop) op where op not in(select oid from uuid_equality))
) from expected_foreign_keys e
union all select e.code,exists(select 1 from constraints c where c.contype='c' and c.column_names=array[e.column_name]),
 (select count(*) from constraints c where c.contype='c' and c.column_names=array[e.column_name]
 and pg_catalog.pg_get_expr(c.conbin,c.conrelid,false)=e.expression
 and c.convalidated and c.enforced and not c.condeferrable and not c.condeferred and not c.connoinherit)=1
from expected_checks e
union all select 'UPDATED_AT_DEFAULT',exists(select 1 from default_value),
 (select count(*) from default_value)=1 and exists(select 1 from default_value where pg_catalog.pg_get_expr(adbin,adrelid,false)='clock_timestamp()')
union all select 'TRUSTED_BUILTINS',true,(select count(*) from trusted_functions)=3
 and (select count(*) from trusted_operators)=3 and (select count(*) from uuid_equality)=1
 and not exists(select 1 from pg_catalog.pg_depend d where
 ((d.classid='pg_catalog.pg_constraint'::regclass and d.objid in(select oid from constraints where contype='c'))
  or (d.classid='pg_catalog.pg_attrdef'::regclass and d.objid in(select oid from default_value)))
 and ((d.refclassid='pg_catalog.pg_proc'::regclass and d.refobjid not in(select oid from trusted_functions))
  or (d.refclassid='pg_catalog.pg_operator'::regclass and d.refobjid not in(select oid from trusted_operators))
  or (d.refclassid='pg_catalog.pg_type'::regclass and d.refobjid not in(23,25,1009,3802,1184))
  or (d.refclassid='pg_catalog.pg_collation'::regclass and d.refobjid not in(select c.oid from pg_catalog.pg_collation c join pg_catalog.pg_namespace n on n.oid=c.collnamespace where n.nspname='pg_catalog'))))`;
const CODES=['CATALOG_VERSION','CATALOG_SEARCH_PATH','PROVIDER_TABLE','CONSTRAINT_SET','PRIMARY_KEY','TENANT_FOREIGN_KEY','MEMBER_FOREIGN_KEY','PROVIDER_CHECK','REVISION_CHECK','ENVELOPE_CHECK','UPDATED_AT_DEFAULT','TRUSTED_BUILTINS'];
const OPERATIONS=['POLICIES','FUNCTION_DEFINITIONS','OTHER_TABLE_CONSTRAINTS','OTHER_INDEXES','DATABASE_COLLATION_SEMANTICS','SESSION_FENCES','QUOTA_BEHAVIOR','INGRESS','OWNER_POLICY','KEY_CUSTODY','PLATFORM_AUTHENTICATION'];
function report(checks){return Object.freeze({status:checks.length===CODES.length&&checks.every(x=>x.status==='MATCH')?'CREDENTIAL_INVARIANTS_MATCH_REQUIRES_OPERATIONS':'BLOCKED',checks:Object.freeze(checks.map(x=>Object.freeze(x))),operationalChecks:Object.freeze(OPERATIONS.map(code=>Object.freeze({code,status:'UNVERIFIED'})))});}
async function checkCredentialInvariants({env=process.env,createControlDatabase=createConfiguredControlDatabase}={}){
 let flag;try{flag=env?.MOAON_CONTROL_DB_DIAGNOSTIC;}catch{return report([{code:'DIAGNOSTIC_OPT_IN',status:'INVALID'}]);}
 if(flag!=='1')return report([{code:'DIAGNOSTIC_OPT_IN',status:flag===undefined||flag===''||flag==='0'?'DISABLED':'INVALID'}]);
 let database,checks;
 try{
  database=createControlDatabase(env,{diagnostic(){}});
  if(database===null)return report([{code:'CONTROL_DATABASE_CONFIG',status:'MISSING'}]);
  if(typeof database?.query!=='function'||typeof database?.close!=='function')throw Error();
  const result=await database.query(INVARIANTS_SQL);
  if(!Array.isArray(result?.rows)||result.rows.length!==CODES.length)throw Error();
  checks=CODES.map(code=>{const found=result.rows.filter(row=>row?.code===code);if(found.length!==1||typeof found[0].present!=='boolean'||typeof found[0].valid!=='boolean'||!found[0].present&&found[0].valid)throw Error();return {code,status:!found[0].present?'MISSING':found[0].valid?'MATCH':code==='CATALOG_VERSION'?'UNSUPPORTED':'INVALID'};});
 }catch{checks=[{code:'CATALOG_QUERY',status:'UNAVAILABLE'}];}
 finally{if(database&&typeof database.close==='function')try{await database.close();}catch{checks=[{code:'DATABASE_CLOSE',status:'UNAVAILABLE'}];}}
 return report(checks);
}
module.exports={checkCredentialInvariants};
