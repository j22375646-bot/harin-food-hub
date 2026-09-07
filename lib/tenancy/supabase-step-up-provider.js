'use strict';

const {createClient}=require('@supabase/supabase-js');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TOKEN=16_384;
const MIN_TOKEN_LIFETIME_MS=90_000;
const EVIDENCE_LIFETIME_MS=300_000;

class StepUpProviderError extends Error{
  constructor(code){
    super(code==='STEP_UP_REJECTED'?'Step-up verification was rejected.':'Step-up provider is unavailable.');
    this.name='StepUpProviderError';
    this.code=code;
    this.status=code==='STEP_UP_REJECTED'?403:503;
  }
}

function rejected(){return new StepUpProviderError('STEP_UP_REJECTED');}
function unavailable(){return new StepUpProviderError('STEP_UP_UNAVAILABLE');}
function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function ownCopy(value,allowed,required,message){
  if(!isObject(value))throw new TypeError(message);
  try{
    const keys=Reflect.ownKeys(value);
    if(keys.some(key=>typeof key!=='string'||!allowed.includes(key))||required.some(key=>!keys.includes(key)))throw new TypeError(message);
    const copy={};
    for(const key of keys)copy[key]=value[key];
    return copy;
  }catch{throw new TypeError(message);}
}
function canonicalOrigin(value){
  if(typeof value!=='string'||value!==value.trim())return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.origin!==value)return null;
    return url.origin;
  }catch{return null;}
}
function strictString(value,max){return typeof value==='string'&&value.length>0&&value.length<=max&&value===value.trim();}
function primitiveTime(now){
  let value;
  try{value=now();}catch{throw unavailable();}
  if(typeof value!=='number'||!Number.isFinite(value))throw unavailable();
  return value;
}
function validSecond(value){return Number.isSafeInteger(value)&&value>=0;}

function validateClaims(value,{url,userId,sessionId,currentMs,renewed=false,challengeStartedSeconds}){
  if(!isObject(value))throw unavailable();
  const {iss,aud,role,sub,session_id:providerSessionId,is_anonymous:isAnonymous,iat,exp,nbf}=value;
  if(typeof iss!=='string'||typeof aud!=='string'||typeof role!=='string'||typeof sub!=='string'||!UUID.test(sub)||typeof providerSessionId!=='string'||!UUID.test(providerSessionId)||typeof isAnonymous!=='boolean'||!validSecond(iat)||!validSecond(exp)||!Number.isSafeInteger(iat*1000)||!Number.isSafeInteger(exp*1000)||(nbf!==undefined&&(!validSecond(nbf)||!Number.isSafeInteger(nbf*1000))))throw unavailable();
  if(iss!==`${url}/auth/v1`||aud!=='authenticated'||role!=='authenticated'||sub!==userId||isAnonymous!==false||exp<=iat||iat*1000>currentMs||(nbf!==undefined&&nbf*1000>currentMs)||exp*1000<=currentMs+MIN_TOKEN_LIFETIME_MS)throw rejected();
  if(sessionId!==undefined&&providerSessionId!==sessionId)throw rejected();
  if(!renewed)return Object.freeze({providerSessionId,expiresMs:exp*1000});
  if(value.aal!=='aal2'||!Array.isArray(value.amr))throw rejected();
  const stamps=[];
  for(const item of value.amr){
    if(!isObject(item)||typeof item.method!=='string'||!validSecond(item.timestamp))throw unavailable();
    if(item.method==='totp')stamps.push(item.timestamp);
  }
  if(stamps.length===0)throw rejected();
  const verifiedSeconds=Math.max(...stamps);
  if(verifiedSeconds<challengeStartedSeconds||verifiedSeconds*1000>currentMs||currentMs-verifiedSeconds*1000>=EVIDENCE_LIFETIME_MS)throw rejected();
  return Object.freeze({providerSessionId,expiresMs:exp*1000,verifiedSeconds});
}

function validateUser(value,{userId,currentMs,factorId}){
  if(!isObject(value)||typeof value.id!=='string'||typeof value.email!=='string'||typeof value.is_anonymous!=='boolean'||!Array.isArray(value.factors))throw unavailable();
  if(value.email_confirmed_at===null||value.email_confirmed_at===undefined||value.email_confirmed_at==='')throw rejected();
  if(typeof value.email_confirmed_at!=='string'||value.factors.some(item=>!isObject(item)||typeof item.id!=='string'||typeof item.factor_type!=='string'||typeof item.status!=='string'||!UUID.test(item.id)))throw unavailable();
  const confirmed=Date.parse(value.email_confirmed_at);
  if(!UUID.test(value.id)||!EMAIL.test(value.email)||!Number.isFinite(confirmed))throw unavailable();
  const banned=value.banned_until==null||value.banned_until===''?null:Date.parse(value.banned_until);
  if(banned!==null&&!Number.isFinite(banned)||![null,undefined,''].includes(value.deleted_at)&&typeof value.deleted_at!=='string')throw unavailable();
  if(value.id!==userId||value.is_anonymous!==false||confirmed>currentMs||![null,undefined,''].includes(value.deleted_at)||(banned!==null&&banned>currentMs))throw rejected();
  const selected=value.factors.filter(item=>isObject(item)&&item.id===factorId);
  if(selected.length!==1||selected[0].factor_type!=='totp'||selected[0].status!=='verified')throw rejected();
  return Object.freeze({id:value.id,email:value.email.toLowerCase(),emailConfirmedAt:value.email_confirmed_at,factorId});
}
function sameUser(left,right){return left.id===right.id&&left.email===right.email&&left.emailConfirmedAt===right.emailConfirmedAt&&left.factorId===right.factorId;}
function providerFailure(error){
  if(error instanceof StepUpProviderError)return error;
  return unavailable();
}
function responseFailure(error){
  const status=Number(error?.status);
  return status===401||status===403||status===422?rejected():unavailable();
}
function transportErrorResponse(status){
  return new Response(JSON.stringify({code:status===403?'step_up_rejected':'step_up_unavailable',message:status===403?'Step-up request rejected.':'Step-up transport unavailable.'}),{status,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
}

function createSupabaseStepUpProvider(configuration){
  if(typeof window!=='undefined'||typeof document!=='undefined')throw new TypeError('Explicit step-up provider configuration is required.');
  const config=ownCopy(configuration,['url','publishableKey','fetch','timeoutMs','now'],['url','publishableKey','fetch'],'Explicit step-up provider configuration is required.');
  const url=canonicalOrigin(config.url);
  const publishableKey=config.publishableKey;
  const injectedFetch=config.fetch;
  const timeoutMs=config.timeoutMs===undefined?10_000:config.timeoutMs;
  const now=config.now===undefined?Date.now:config.now;
  if(!url||!strictString(publishableKey,4096)||typeof injectedFetch!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)throw new TypeError('Explicit step-up provider configuration is required.');

  async function verifyTotp(candidate){
    if(typeof window!=='undefined'||typeof document!=='undefined')throw new TypeError('Step-up verification is server-only.');
    const input=ownCopy(candidate,['userId','accessToken','refreshToken','factorId','code'],['userId','accessToken','refreshToken','factorId','code'],'Exact TOTP verification input is required.');
    if(typeof input.userId!=='string'||typeof input.factorId!=='string'||!UUID.test(input.userId)||!UUID.test(input.factorId)||!strictString(input.accessToken,MAX_TOKEN)||!strictString(input.refreshToken,MAX_TOKEN)||typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new TypeError('Exact TOTP verification input is required.');
    input.userId=input.userId.toLowerCase();
    input.factorId=input.factorId.toLowerCase();

    const startedMs=primitiveTime(now);
    const deadlineMs=startedMs+timeoutMs;
    if(!Number.isFinite(deadlineMs)||deadlineMs<=startedMs)throw unavailable();
    const controller=new AbortController();
    let sourceExpiryMs=Infinity;
    let renewedExpiryMs=Infinity;
    let timer;
    let client;
    const checkpoint=()=>{
      const currentMs=primitiveTime(now);
      if(controller.signal.aborted||currentMs<startedMs||currentMs>=deadlineMs)throw unavailable();
      return currentMs;
    };
    const sdkFetch=async(rawUrl,init={})=>{
      let currentMs;
      try{currentMs=checkpoint();}catch{return transportErrorResponse(503);}
      let target;
      try{target=new URL(String(rawUrl));}catch{return transportErrorResponse(503);}
      const method=String(init.method||'GET').toUpperCase();
      if(target.origin===url&&target.pathname==='/auth/v1/token'&&target.searchParams.get('grant_type')==='refresh_token'&&method==='POST'){
        return transportErrorResponse(400);
      }
      const factorBase=`/auth/v1/factors/${input.factorId}`;
      const permitted=target.origin===url&&target.search===''&&target.hash===''&&(
        method==='GET'&&(target.pathname==='/auth/v1/user'||target.pathname==='/auth/v1/.well-known/jwks.json')||
        method==='POST'&&(target.pathname===`${factorBase}/challenge`||target.pathname===`${factorBase}/verify`)
      );
      if(!permitted)return transportErrorResponse(503);
      const authorization=new Headers(init.headers).get('authorization');
      if(authorization===`Bearer ${input.accessToken}`&&sourceExpiryMs<=currentMs+MIN_TOKEN_LIFETIME_MS)return transportErrorResponse(403);
      if(renewedExpiryMs!==Infinity&&authorization&&authorization!==`Bearer ${input.accessToken}`&&renewedExpiryMs<=currentMs+MIN_TOKEN_LIFETIME_MS)return transportErrorResponse(403);
      let response;
      try{response=await injectedFetch(rawUrl,{...init,redirect:'error',signal:controller.signal});}catch{return transportErrorResponse(503);}
      try{checkpoint();}catch{return transportErrorResponse(503);}
      return response;
    };
    const run=async()=>{
      client=createClient(url,publishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:sdkFetch}});
      const initialClaimsResult=await client.auth.getClaims(input.accessToken);
      if(initialClaimsResult?.error)throw initialClaimsResult.error?.message==='Invalid JWT signature'?rejected():responseFailure(initialClaimsResult.error);
      const initialClock=checkpoint();
      const initialClaims=validateClaims(initialClaimsResult?.data?.claims,{url,userId:input.userId,currentMs:initialClock});
      sourceExpiryMs=initialClaims.expiresMs;

      checkpoint();
      const setResult=await client.auth.setSession({access_token:input.accessToken,refresh_token:input.refreshToken});
      if(setResult?.error)throw responseFailure(setResult.error);
      const setUser=validateUser(setResult?.data?.user,{userId:input.userId,currentMs:checkpoint(),factorId:input.factorId});
      const freshResult=await client.auth.getUser(input.accessToken);
      if(freshResult?.error)throw responseFailure(freshResult.error);
      const freshUser=validateUser(freshResult?.data?.user,{userId:input.userId,currentMs:checkpoint(),factorId:input.factorId});
      if(!sameUser(setUser,freshUser))throw rejected();

      const challengeStartedSeconds=Math.floor(checkpoint()/1000);
      const challengeResult=await client.auth.mfa.challenge({factorId:input.factorId});
      if(challengeResult?.error)throw responseFailure(challengeResult.error);
      const challenge=challengeResult?.data;
      if(!isObject(challenge)||typeof challenge.id!=='string'||typeof challenge.type!=='string'||!validSecond(challenge.expires_at))throw unavailable();
      if(!UUID.test(challenge.id)||challenge.type!=='totp')throw unavailable();
      if(challenge.expires_at*1000<=checkpoint())throw rejected();

      checkpoint();
      const verifyResult=await client.auth.mfa.verify({factorId:input.factorId,challengeId:challenge.id,code:input.code});
      if(verifyResult?.error)throw responseFailure(verifyResult.error);
      const renewedAccessToken=verifyResult?.data?.access_token;
      const renewedRefreshToken=verifyResult?.data?.refresh_token;
      if(!isObject(verifyResult?.data)||!strictString(renewedAccessToken,MAX_TOKEN)||!strictString(renewedRefreshToken,MAX_TOKEN)||!Number.isSafeInteger(verifyResult.data.expires_in)||verifyResult.data.expires_in<=0)throw unavailable();
      const renewedClaimsResult=await client.auth.getClaims(renewedAccessToken);
      if(renewedClaimsResult?.error)throw renewedClaimsResult.error?.message==='Invalid JWT signature'?rejected():responseFailure(renewedClaimsResult.error);
      const renewedClaims=validateClaims(renewedClaimsResult?.data?.claims,{url,userId:input.userId,sessionId:initialClaims.providerSessionId,currentMs:checkpoint(),renewed:true,challengeStartedSeconds});
      renewedExpiryMs=renewedClaims.expiresMs;
      const renewedUserResult=await client.auth.getUser(renewedAccessToken);
      if(renewedUserResult?.error)throw responseFailure(renewedUserResult.error);
      const renewedUser=validateUser(renewedUserResult?.data?.user,{userId:input.userId,currentMs:checkpoint(),factorId:input.factorId});
      if(!sameUser(freshUser,renewedUser))throw rejected();
      const completedMs=checkpoint();
      if(renewedClaims.expiresMs<=completedMs+MIN_TOKEN_LIFETIME_MS)throw rejected();
      const verifiedAtMs=renewedClaims.verifiedSeconds*1000;
      return Object.freeze({
        evidence:Object.freeze({userId:input.userId,providerSessionId:initialClaims.providerSessionId,factorId:input.factorId,method:'mfa',verifiedAt:new Date(verifiedAtMs).toISOString(),expiresAt:new Date(Math.min(verifiedAtMs+EVIDENCE_LIFETIME_MS,renewedClaims.expiresMs)).toISOString()}),
        session:Object.freeze({accessToken:renewedAccessToken,refreshToken:renewedRefreshToken}),
      });
    };
    try{
      const timeout=new Promise((_resolve,rejectPromise)=>{timer=setTimeout(()=>{controller.abort();rejectPromise(unavailable());},timeoutMs);});
      return await Promise.race([run(),timeout]);
    }catch(error){throw providerFailure(error);}
    finally{clearTimeout(timer);controller.abort();client?.auth?.stopAutoRefresh();}
  }
  return Object.freeze({verifyTotp});
}

module.exports={createSupabaseStepUpProvider,StepUpProviderError};
