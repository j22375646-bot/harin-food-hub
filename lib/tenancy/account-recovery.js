'use strict';

const {createHash}=require('node:crypto');

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AccountRecoveryError extends Error{
  constructor(code){super(code==='RECOVERY_REJECTED'?'Recovery request was rejected.':'Recovery service is unavailable.');this.name='AccountRecoveryError';this.code=code;this.status=code==='RECOVERY_REJECTED'?400:503;}
}
const unavailable=()=>new AccountRecoveryError('RECOVERY_UNAVAILABLE');
const rejected=()=>new AccountRecoveryError('RECOVERY_REJECTED');
function normalizedEmail(value){if(typeof value!=='string')return null;const v=value.trim().toLowerCase();return v.length>=3&&v.length<=320&&EMAIL.test(v)?v:null;}
function validToken(v){return typeof v==='string'&&v.length>=1&&v.length<=4096&&v===v.trim();}
function validPassword(v){return typeof v==='string'&&v.length>=12&&v.length<=128;}
function timestamp(value){
  if(typeof value!=='string')return NaN;
  const matched=/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if(!matched)return NaN;const year=+matched[1],month=+matched[2],day=+matched[3],leap=year%4===0&&(year%100!==0||year%400===0);
  if(day>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1])return NaN;return Date.parse(value);
}
function validIdentity(v,clock){const confirmed=timestamp(v?.emailConfirmedAt);return Number.isFinite(clock)&&v&&UUID.test(v.id||'')&&normalizedEmail(v.email)===v.email&&Number.isFinite(confirmed)&&confirmed<=clock;}
function boundProfile(value,identity){return value&&value.active===true&&value.userId===identity.id&&normalizedEmail(value.email)===identity.email;}

function createAccountRecovery({provider,profiles,sessionStore,requestLimit,randomUUID,diagnostic=()=>{},timeoutMs=10_000,now=Date.now}={}){
  if(typeof window!=='undefined'||typeof document!=='undefined'||!provider||!['requestRecoveryEmail','confirmEmail','openRecovery'].every(k=>typeof provider[k]==='function')
    ||!profiles||typeof profiles.findActiveByEmail!=='function'||typeof profiles.getByUserId!=='function'
    ||!sessionStore||typeof sessionStore.beginPasswordChange!=='function'||typeof sessionStore.completePasswordChange!=='function'
    ||typeof requestLimit!=='function'||typeof randomUUID!=='function'||typeof diagnostic!=='function'||typeof now!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('Explicit server recovery dependencies are required.');
  function clock(){let value;try{value=Number(now());}catch{throw unavailable();}if(!Number.isFinite(value))throw unavailable();return value;}
  async function step(run,state){
    if(state?.cancelled)throw unavailable();let timer;
    try{return await Promise.race([Promise.resolve().then(run),new Promise((_r,j)=>{timer=setTimeout(()=>{if(state)state.cancelled=true;j(unavailable());},timeoutMs);})]);}
    finally{clearTimeout(timer);}
  }
  async function limited(kind,subject){
    let result;try{result=await step(()=>requestLimit({kind,subject}));}catch{throw unavailable();}
    if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).length!==1||result.allowed!==true)throw unavailable();
  }
  async function profileFor(identity){
    let p;try{p=await step(()=>profiles.getByUserId(identity.id));}catch{throw unavailable();}
    if(!validIdentity(identity,clock())||!boundProfile(p,identity))throw rejected();return p;
  }
  return Object.freeze({
    async requestRecovery({email}={}){
      const value=normalizedEmail(email);if(!value)throw rejected();
      await limited('RECOVERY_MAIL',value);
      let profile;try{profile=await step(()=>profiles.findActiveByEmail(value));}catch{throw unavailable();}
      if(!profile||profile.active!==true||!UUID.test(profile.userId||'')||normalizedEmail(profile.email)!==value)return Object.freeze({status:'ACCEPTED'});
      try{await step(()=>provider.requestRecoveryEmail(value));}
      catch{try{diagnostic(Object.freeze({event:'RECOVERY_MAIL_PROVIDER_FAILED'}));}catch{} }
      return Object.freeze({status:'ACCEPTED'});
    },
    async confirmEmail({tokenHash}={}){
      if(!validToken(tokenHash))throw rejected();
      await limited('EMAIL_CONFIRM',createHash('sha256').update(tokenHash).digest('hex'));
      let answer;try{answer=await step(()=>provider.confirmEmail(tokenHash));}catch(error){throw error?.code==='RECOVERY_REJECTED'?rejected():unavailable();}
      if(answer?.ok!==true||!validIdentity(answer.identity,clock()))throw rejected();
      await profileFor(answer.identity);
      return Object.freeze({status:'CONFIRMED',membershipCreated:false,requiresFreshLogin:true});
    },
    async completeRecovery({tokenHash,newPassword}={}){
      if(!validToken(tokenHash)||!validPassword(newPassword))throw rejected();
      await limited('RECOVERY_COMPLETE',createHash('sha256').update(tokenHash).digest('hex'));
      const state={cancelled:false};let handle=null,fenceRisk=false,operationId;
      try{
        const opening=Promise.resolve().then(()=>provider.openRecovery(tokenHash));
        opening.then(lateHandle=>{
          if(state.cancelled&&lateHandle&&typeof lateHandle.dispose==='function')return step(()=>lateHandle.dispose()).catch(()=>{});
        }).catch(()=>{});
        try{handle=await step(()=>opening,state);}catch(error){throw error?.code==='RECOVERY_REJECTED'?rejected():unavailable();}
        if(!handle||!validIdentity(handle.identity,clock())||typeof handle.updatePassword!=='function'||typeof handle.signOutGlobal!=='function'||typeof handle.currentIdentity!=='function'||typeof handle.dispose!=='function')throw rejected();
        await profileFor(handle.identity);
        operationId=randomUUID();if(!UUID.test(operationId||''))throw unavailable();
        fenceRisk=true;
        try{await step(()=>sessionStore.beginPasswordChange({userId:handle.identity.id,operationId}),state);}
        catch(error){if(error?.code==='AUTH_TRANSITION_REJECTED'){fenceRisk=false;throw rejected();}throw error;}
        const changed=await step(()=>handle.updatePassword(newPassword),state);
        if(!validIdentity(changed,clock())||changed.id!==handle.identity.id||changed.email!==handle.identity.email)throw unavailable();
        await step(()=>handle.signOutGlobal(),state);
        const current=await step(()=>handle.currentIdentity(),state);
        if(!validIdentity(current,clock())||current.id!==handle.identity.id||current.email!==handle.identity.email)throw unavailable();
        await profileFor(current);
        await step(()=>sessionStore.completePasswordChange({userId:current.id,operationId}),state);
        return Object.freeze({status:'COMPLETED',requiresFreshLogin:true});
      }catch(error){
        if(fenceRisk)return Object.freeze({status:'REVIEW_REQUIRED'});
        if(error instanceof AccountRecoveryError)throw error;
        throw unavailable();
      }finally{
        if(handle)await step(()=>handle.dispose()).catch(()=>{});
      }
    },
  });
}

module.exports={createAccountRecovery,AccountRecoveryError};
