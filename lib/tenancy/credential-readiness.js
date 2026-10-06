'use strict';

// Offline shape validation only. Never construct a client, open a pool, load an
// env file, or interpret operator-supplied assertions as operational evidence.
const {readCredentialSaveConfig}=require('./credential-save-runtime.js');
const {readControlDatabaseConfig}=require('./control-database-config.js');
const {HARIN_ORIGIN}=require('../../desktop/connection-policy.cjs');

const CREDENTIAL_KEYS=['MOAON_CREDENTIAL_SAVE_ORIGIN','MOAON_CREDENTIAL_SAVE_INGRESS','MOAON_CREDENTIAL_KEYRING','MOAON_CREDENTIAL_ACTIVE_KEY_ID','MOAON_CREDENTIAL_ADMISSION_HMAC_KEY'];
const DATABASE_KEYS=['MOAON_CONTROL_DB_HOST','MOAON_CONTROL_DB_PORT','MOAON_CONTROL_DB_NAME','MOAON_CONTROL_DB_PASSWORD','MOAON_CONTROL_DB_MODE','MOAON_CONTROL_DB_PROJECT_REF','MOAON_CONTROL_DB_CA'];
const IDENTITY_KEYS=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const CHECK_CODES=['CREDENTIAL_CONFIG','CONTROL_DATABASE_CONFIG','IDENTITY_CONFIG','VERCEL_RUNTIME','DESKTOP_ORIGIN'];
const OPERATIONS=['DATABASE_ACL','DATABASE_SCHEMA','SESSION_FENCES','QUOTA','INGRESS','OWNER_POLICY','KEY_CUSTODY','PLATFORM_AUTHENTICATION'];
const missing=value=>value===undefined||value==='';
function report(activation,checks){
 return Object.freeze({
  status:activation!=='INVALID'&&checks.every(item=>item.status==='VALID')?'CONFIGURATION_VALID_REQUIRES_OPERATIONS':'BLOCKED',
  activation,
  checks:Object.freeze(checks.map(item=>Object.freeze(item))),
  operationalChecks:Object.freeze(OPERATIONS.map(code=>Object.freeze({code,status:'UNVERIFIED'}))),
 });
}
function readCredentialReadiness(env=process.env){
 try{
  if(!env||typeof env!=='object'||Array.isArray(env))throw Error();
  // Copy only recognized data properties; do not evaluate custom accessors or
  // mutate activation in the supplied environment (including process.env).
  const candidate={};
  for(const key of [...CREDENTIAL_KEYS,...DATABASE_KEYS,...IDENTITY_KEYS,'MOAON_CREDENTIAL_SAVE_ENABLED','VERCEL','VERCEL_ENV']){
   const descriptor=Object.getOwnPropertyDescriptor(env,key);
   if(descriptor&&!Object.hasOwn(descriptor,'value'))throw Error();
   candidate[key]=descriptor?.value;
  }
  const flag=candidate.MOAON_CREDENTIAL_SAVE_ENABLED;
  const activation=missing(flag)||flag==='0'?'DISABLED':flag==='1'?'ENABLED':'INVALID';
  const checks=[];
  const group=(code,keys,validate)=>{
   if(keys.every(key=>missing(candidate[key]))){checks.push({code,status:'MISSING'});return;}
   try{if(!validate())throw Error();checks.push({code,status:'VALID'});}catch{checks.push({code,status:'INVALID'});}
  };
  group('CREDENTIAL_CONFIG',CREDENTIAL_KEYS,()=>Boolean(readCredentialSaveConfig({...candidate,MOAON_CREDENTIAL_SAVE_ENABLED:'1'})));
  group('CONTROL_DATABASE_CONFIG',DATABASE_KEYS,()=>Boolean(readControlDatabaseConfig(candidate)));
  group('IDENTITY_CONFIG',IDENTITY_KEYS,()=>{
   // createAuthClient requires these server-only fields. This checks their
   // local shape, not key authenticity or project/account permissions.
   const url=candidate.SUPABASE_URL,key=candidate.SUPABASE_SERVICE_ROLE_KEY;
   if(typeof url!=='string'||url.length>2048||url!==url.trim()||typeof key!=='string'||!key||key.length>16384||/\s|[\u0000-\u001f\u007f]/u.test(key))return false;
   const parsed=new URL(url);
   return parsed.protocol==='https:'&&Boolean(parsed.hostname)&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash&&parsed.pathname==='/';
  });
  group('VERCEL_RUNTIME',['VERCEL','VERCEL_ENV'],()=>candidate.VERCEL==='1'&&candidate.VERCEL_ENV==='production');
  group('DESKTOP_ORIGIN',['MOAON_CREDENTIAL_SAVE_ORIGIN'],()=>candidate.MOAON_CREDENTIAL_SAVE_ORIGIN===HARIN_ORIGIN);
  return report(activation,checks);
 }catch{
  return report('INVALID',CHECK_CODES.map(code=>({code,status:'INVALID'})));
 }
}
module.exports={readCredentialReadiness};
