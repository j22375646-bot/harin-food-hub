'use strict';
const {performance}=require('node:perf_hooks');
const {createConfiguredControlDatabase,readControlDatabaseConfig}=require('./control-database-config.js');
const {createCredentialSaveRequest}=require('./credential-request.js');
const {createCredentialRequestAdmission}=require('./credential-request-admission.js');
const {createCredentialStore}=require('./credential-store.js');
const {createCredentialCipher}=require('./credential-envelope.js');
const {createCredentialSessionFence}=require('./credential-session-fence.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {validateAuthHmacKey}=require('./auth-request-limit.js');
const {canonicalizeTrustedClientIp}=require('./auth-client-ip.js');
const dashboardAuth=require('../dashboard-auth.js');
const unavailable=()=>new Error('CREDENTIAL_ADMISSION_UNAVAILABLE');
const failure=code=>new Response(JSON.stringify({ok:false,code}),{status:503,headers:{'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',vary:'Cookie, Origin'}});
function trustedRuntime(){return typeof window==='undefined'&&typeof document==='undefined'&&process.env.VERCEL==='1'&&process.env.VERCEL_ENV==='production';}
function clientIp(request){
 const read=(name,required)=>{const value=request.headers.get(name);if(value===null&&!required)return null;if(!value||value.length>64||value.includes(','))throw unavailable();return canonicalizeTrustedClientIp(value);};
 const ip=read('x-vercel-forwarded-for',true),forwarded=read('x-forwarded-for',true),real=read('x-real-ip',false);
 if(ip!==forwarded||real!==null&&real!==ip)throw unavailable();return ip;
}
function readCredentialSaveConfig(env){
 if(env.MOAON_CREDENTIAL_SAVE_ENABLED===undefined||env.MOAON_CREDENTIAL_SAVE_ENABLED===''||env.MOAON_CREDENTIAL_SAVE_ENABLED==='0')return null;
 if(env.MOAON_CREDENTIAL_SAVE_ENABLED!=='1')throw unavailable();
 const origin=env.MOAON_CREDENTIAL_SAVE_ORIGIN;
 if(typeof origin!=='string'||!origin.startsWith('https://')||new URL(origin).origin!==origin||env.MOAON_CREDENTIAL_SAVE_INGRESS!=='vercel-direct')throw unavailable();
 const hmacKey=validateAuthHmacKey(env.MOAON_CREDENTIAL_ADMISSION_HMAC_KEY);
 if(typeof env.MOAON_CREDENTIAL_KEYRING!=='string'||env.MOAON_CREDENTIAL_KEYRING.length>16384)throw unavailable();
 const cipher=createCredentialCipher({activeKeyId:env.MOAON_CREDENTIAL_ACTIVE_KEY_ID,keys:JSON.parse(env.MOAON_CREDENTIAL_KEYRING)});
 return {origin,hmacKey,cipher};
}
function createCredentialAdmissionRpc(database,check=()=>{}){
 return Object.freeze({async rpc(name,args){
  let sql,key;
  if(name==='moaon_consume_credential_network'){sql='select public.moaon_consume_credential_network($1) as allowed';key='p_ip_hash';}
  else if(name==='moaon_consume_credential_user'){sql='select public.moaon_consume_credential_user($1) as allowed';key='p_user_hash';}
  else throw unavailable();
  if(!args||Object.getPrototypeOf(args)!==Object.prototype||Object.keys(args).length!==1||typeof args[key]!=='string'||!/^[a-f0-9]{64}$/.test(args[key]))throw unavailable();
  check();
  // Each quota is committed before returning, independently of credential storage.
  const data=await database.transaction(async tx=>{check();const result=await tx.query(sql,[args[key]]);if(result?.rows?.length!==1||typeof result.rows[0].allowed!=='boolean')throw unavailable();return result.rows[0].allowed;});
  check();return {data,error:null};
 }});
}
function createCredentialSaveRuntime({env=process.env,createControlDatabase=createConfiguredControlDatabase,createIdentityClient=dashboardAuth.createAuthClient,validateSession=dashboardAuth.validateSession,admissionTimeoutMs=10000,maxConcurrent=8}={}){
 let config,configurationError=false;
 try{config=readCredentialSaveConfig(env);if(config&&createControlDatabase===createConfiguredControlDatabase&&readControlDatabaseConfig(env)===null)config=null;}catch{configurationError=true;}
 let ready=null,pending=null,closed=false,closePromise=null;
 const stop=new AbortController();
 const checkpoint=options=>{if(closed||!trustedRuntime()||options?.signal?.aborted||options?.deadline!==undefined&&performance.now()>=options.deadline)throw unavailable();};
 async function compose(options){
  let database;
  try{
   checkpoint(options);database=await createControlDatabase(env);checkpoint(options);
   if(!database||typeof database.transaction!=='function'||typeof database.close!=='function')throw unavailable();
   const identityClient=await createIdentityClient();checkpoint(options);
   const identity=createDashboardIdentityVerifier({db:identityClient,authAdmin:identityClient?.auth?.admin,validateSession,timeoutMs:admissionTimeoutMs});
   const verifySession=async(credential,options)=>{checkpoint(options);const result=await identity(credential,options);checkpoint(options);return result;};
   const store=createCredentialStore({database,cipher:config.cipher,verifySession,sessionFence:createCredentialSessionFence()});
   const value={database,verifySession,store};ready=value;return value;
  }catch{if(database?.close)try{await database.close();}catch{}throw unavailable();}
 }
 async function initialize(options){
  checkpoint(options);if(ready)return ready;
  if(!pending){pending=Promise.resolve().then(()=>compose(options));pending.finally(()=>{pending=null;}).catch(()=>{});}
  const value=await pending;checkpoint(options);return value;
 }
 const handler=config?createCredentialSaveRequest({origin:config.origin,admissionTimeoutMs,maxConcurrent,
  admit:async(request,credential,options)=>{
   checkpoint(options);const ip=clientIp(request);const service=await initialize(options);checkpoint(options);
   const check=()=>checkpoint(options);
   const admission=createCredentialRequestAdmission({rpcClient:createCredentialAdmissionRpc(service.database,check),hmacKey:config.hmacKey,trustedClientIp:ip,verifySession:service.verifySession,timeoutMs:admissionTimeoutMs});
   return admission(credential,options);
  },
  save:async(credential,input,options)=>{checkpoint(options);if(!ready)throw unavailable();return ready.store.save(credential,input,options);},
 }):null;
 return Object.freeze({
  async handle(request,options={}){
   if(closed||configurationError)return failure('CREDENTIAL_STORAGE_UNAVAILABLE');
   if(!config)return failure('SETUP_REQUIRED');
   const signal=AbortSignal.any([request.signal,stop.signal,...(options.signal?[options.signal]:[])]);
   return handler(request,{...options,signal});
  },
  close(){
   if(closePromise)return closePromise;closed=true;stop.abort();
   closePromise=(async()=>{if(pending)try{await pending;}catch{}const current=ready;ready=null;if(current)await current.database.close();})();return closePromise;
  },
 });
}
module.exports={createCredentialSaveRuntime,createCredentialAdmissionRpc,readCredentialSaveConfig};
