'use strict';
const {createConfiguredControlDatabase}=require('../lib/tenancy/control-database-config.js');

const QUERY=`select current_user, session_user,
 (select count(*)::int from moaon_control.tenants) as tenants,
 (select count(*)::int from moaon_control.memberships) as memberships,
 (select count(*)::int from moaon_control.invitations) as invitations`;
const SAFE_CODES=new Set(['CONTROL_DATABASE_CONFIGURATION_INVALID','CONTROL_DATABASE_UNAVAILABLE','CONTROL_DATABASE_ROLE_REJECTED']);

async function checkMoaonControlConnection({env=process.env,createDatabase=createConfiguredControlDatabase,write=console.log}={}){
 if(env.MOAON_CONTROL_DB_DIAGNOSTIC!=='1')throw Object.assign(Error('Diagnostic is not enabled.'),{code:'DIAGNOSTIC_NOT_ENABLED'});
 let database;
 try{
  database=createDatabase(env);
  if(!database)throw Object.assign(Error('Control database is not configured.'),{code:'SETUP_REQUIRED'});
  const result=await database.query(QUERY,[]),row=result?.rows?.[0];
  if(!row)throw Object.assign(Error('Control database response is invalid.'),{code:'CONTROL_DATABASE_UNAVAILABLE'});
  write(JSON.stringify({ok:true,currentUser:row.current_user,sessionUser:row.session_user,counts:{tenants:Number(row.tenants),memberships:Number(row.memberships),invitations:Number(row.invitations)}}));
 }finally{if(database)await database.close();}
}
function safeCode(error){return SAFE_CODES.has(error?.code)||['SETUP_REQUIRED','DIAGNOSTIC_NOT_ENABLED'].includes(error?.code)?error.code:'CONTROL_DATABASE_UNAVAILABLE';}
if(require.main===module)checkMoaonControlConnection().catch(error=>{console.error(JSON.stringify({ok:false,code:safeCode(error)}));process.exitCode=1;});
module.exports={checkMoaonControlConnection,safeCode};
