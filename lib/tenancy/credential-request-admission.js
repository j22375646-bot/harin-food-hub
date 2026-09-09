'use strict';
const {createHmac}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createBoundedAuthRpc}=require('./bounded-auth-rpc.js');
const {validateAuthHmacKey}=require('./auth-request-limit.js');
const {canonicalizeTrustedClientIp}=require('./auth-client-ip.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class CredentialAdmissionError extends Error {
 constructor(){super('Credential admission is unavailable.');this.code='CREDENTIAL_ADMISSION_UNAVAILABLE';}
}
// Shared monotonic deadline and a permanent latch. Late completion cannot start another stage.
async function boundedAdmission(work,{signal,timeoutMs,deadline:parentDeadline}) {
 if(parentDeadline!==undefined&&!Number.isFinite(parentDeadline))throw new CredentialAdmissionError();
 const deadline=Math.min(performance.now()+timeoutMs,parentDeadline??Infinity);const controller=new AbortController();let stopped=false,timer,onAbort;
 const check=()=>{if(stopped||signal?.aborted||performance.now()>=deadline)throw new CredentialAdmissionError();};
 try {
  check();
  const cancelled=new Promise((_,reject)=>{
   onAbort=()=>{stopped=true;controller.abort();reject(new CredentialAdmissionError());};
   signal?.addEventListener('abort',onAbort,{once:true});
   timer=setTimeout(onAbort,Math.max(0,deadline-performance.now()));
  });
  const result=await Promise.race([Promise.resolve().then(()=>{check();return work(check,controller.signal,deadline);}),cancelled]);
  check();return result;
 }catch{throw new CredentialAdmissionError();}
 finally{stopped=true;controller.abort();clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
function createCredentialRequestAdmission({rpcClient,hmacKey,trustedClientIp,verifySession,timeoutMs=10000}={}) {
 validateAuthHmacKey(hmacKey);
 if(typeof verifySession!=='function')throw TypeError('Trusted read-only session verifier required');
 const ip=canonicalizeTrustedClientIp(trustedClientIp);
 const transport=createBoundedAuthRpc({rpcClient,timeoutMs,errorFactory:()=>new CredentialAdmissionError()});
 const hash=(kind,value)=>createHmac('sha256',hmacKey).update(JSON.stringify(['CREDENTIAL_REQUEST',kind,value])).digest('hex');
 const ipHash=hash('IP',ip);
 return async (credential,{signal,deadline}={})=>boundedAdmission(async check=>{
  if(typeof credential!=='string'||!credential||credential.length>4096)throw new CredentialAdmissionError();
  check();const network=await transport.call('moaon_consume_credential_network',{p_ip_hash:ipHash});check();
  if(typeof network!=='boolean')throw new CredentialAdmissionError();
  if(!network)return Object.freeze({allowed:false});
  const session=await verifySession(credential);check();
  if(!session||typeof session.userId!=='string'||!UUID.test(session.userId)||typeof session.expiresAt!=='string'||!Number.isFinite(Date.parse(session.expiresAt))||Date.parse(session.expiresAt)<=Date.now())throw new CredentialAdmissionError();
  const userHash=hash('USER',session.userId.toLowerCase());check();
  const allowed=await transport.call('moaon_consume_credential_user',{p_user_hash:userHash});check();
  if(typeof allowed!=='boolean')throw new CredentialAdmissionError();
  return Object.freeze({allowed});
 },{signal,timeoutMs,deadline});
}
module.exports={createCredentialRequestAdmission,CredentialAdmissionError,boundedAdmission};
