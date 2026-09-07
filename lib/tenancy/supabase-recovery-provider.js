'use strict';

const {createClient} = require('@supabase/supabase-js');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO=/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const SDK_EXPIRY_MARGIN_MS=90_000;

class RecoveryProviderError extends Error {
  constructor(code){ super(code==='RECOVERY_REJECTED'?'Recovery verification was rejected.':'Recovery provider is unavailable.'); this.name='RecoveryProviderError'; this.code=code; }
}
function unavailable(){ throw new RecoveryProviderError('RECOVERY_UNAVAILABLE'); }
function rejected(){ throw new RecoveryProviderError('RECOVERY_REJECTED'); }
function email(value){ if(typeof value!=='string') return null; const v=value.trim().toLowerCase(); return v.length<=320&&EMAIL.test(v)?v:null; }
function token(value){ return typeof value==='string'&&value.length>=1&&value.length<=4096&&value===value.trim(); }
function stamp(value){
  if(typeof value!=='string') return NaN; const m=ISO.exec(value); if(!m)return NaN;
  const y=+m[1],mo=+m[2],d=+m[3],leap=y%4===0&&(y%100!==0||y%400===0);
  if(d>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][mo-1])return NaN;
  return Date.parse(value);
}
function loopback(url){ try{const u=new URL(url);return u.protocol==='http:'&&['localhost','127.0.0.1','::1'].includes(u.hostname);}catch{return false;} }
function secureUrl(value,allowLoopback){ try{const u=new URL(value);return u.protocol==='https:'||(allowLoopback&&loopback(value));}catch{return false;} }
function identity(value,now){
  const u=value&&typeof value==='object'?value:null;
  const normalized=email(u?.email), confirmed=stamp(u?.email_confirmed_at);
  const banned=u?.banned_until===null||u?.banned_until===undefined||u?.banned_until===''?null:stamp(u.banned_until);
  if(!Number.isFinite(now)||!u||!UUID.test(u.id||'')||!normalized||u.is_anonymous!==false
    || !Number.isFinite(confirmed)||confirmed>now
    || banned!==null&&(!Number.isFinite(banned)||banned>now)
    || ![null,undefined,''].includes(u.deleted_at)) rejected();
  return Object.freeze({id:u.id,email:normalized,emailConfirmedAt:u.email_confirmed_at});
}
function same(a,b){ return a.id===b.id&&a.email===b.email&&a.emailConfirmedAt===b.emailConfirmedAt; }
function currentTime(now){let value;try{value=Number(now());}catch{unavailable();}if(!Number.isFinite(value))unavailable();return value;}
function sessionExpiry(value,clock){
  const expiresAt=Number(value?.expires_at),expiresIn=Number(value?.expires_in);
  const expiresAtMs=expiresAt*1000;
  if(!Number.isSafeInteger(expiresAt)||!Number.isFinite(expiresIn)||!Number.isFinite(expiresAtMs)||expiresAt<=0||expiresIn<=0||expiresAtMs-clock<=SDK_EXPIRY_MARGIN_MS)rejected();
  return expiresAtMs;
}

function createSupabaseRecoveryProvider({url,publishableKey,serviceRoleKey,callbackUrl,fetch,timeoutMs=10_000,now=Date.now,allowInsecureLoopback=false}={}){
  if(typeof window!=='undefined'||typeof document!=='undefined'
    ||!secureUrl(url,allowInsecureLoopback)||!secureUrl(callbackUrl,allowInsecureLoopback)
    ||typeof publishableKey!=='string'||!publishableKey||typeof serviceRoleKey!=='string'||!serviceRoleKey
    ||typeof fetch!=='function'||typeof now!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0) throw new TypeError('Explicit recovery provider configuration is required.');
  function sdkClient(key){
    const state={signal:null};
    const abortableFetch=async(input,init={})=>{
      const requestUrl=String(input);
      if(requestUrl.includes('/auth/v1/token')&&requestUrl.includes('grant_type=refresh_token'))return new Response(JSON.stringify({code:'recovery_refresh_disabled',message:'Recovery session refresh is disabled.'}),{status:400,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
      try{return await fetch(input,{...init,signal:state.signal||init.signal});}catch{return new Response(JSON.stringify({code:'recovery_transport_failed',message:'Recovery transport failed.'}),{status:503,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});}
    };
    const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:abortableFetch}});
    return {client,setSignal(value){state.signal=value;}};
  }
  const operationClient=()=>sdkClient(publishableKey);
  async function bounded(run,mode='unavailable',controller=new AbortController()){
    let timer;
    try{
      return await Promise.race([Promise.resolve().then(()=>run(controller.signal)),new Promise((_r,j)=>{timer=setTimeout(()=>{controller.abort();j(new RecoveryProviderError('RECOVERY_UNAVAILABLE'));},timeoutMs);})]);
    }catch(error){ if(error instanceof RecoveryProviderError)throw error; if(mode==='rejected')rejected(); unavailable(); }
    finally{clearTimeout(timer);}
  }
  async function authoritative(id){
    const scoped=sdkClient(serviceRoleKey);
    const result=await bounded(signal=>{scoped.setSignal(signal);return scoped.client.auth.admin.getUserById(id);});
    if(result?.error) unavailable();
    return identity(result?.data?.user,currentTime(now));
  }
  async function revoke(accessToken,scope){
    const scoped=sdkClient(serviceRoleKey);
    const result=await bounded(signal=>{scoped.setSignal(signal);return scoped.client.auth.admin.signOut(accessToken,scope);});
    if(result?.error)unavailable();
  }
  async function release(client,accessToken){
    try{await revoke(accessToken,'local');}catch{}finally{client.auth.stopAutoRefresh();}
  }
  async function verify(type,tokenHash){
    if(!token(tokenHash)) rejected();
    const scoped=operationClient(),client=scoped.client;
    let ownsSession=false,abandoned=false,accessToken=null;
    const verifyController=new AbortController();scoped.setSignal(verifyController.signal);
    const verification=client.auth.verifyOtp({token_hash:tokenHash,type});
    verification.then(result=>{
      const lateToken=result?.data?.session?.access_token;
      if(abandoned&&typeof lateToken==='string'&&lateToken)return release(client,lateToken);
    }).catch(()=>{});
    try{
      let result;
      try{result=await bounded(()=>verification,'rejected',verifyController);}
      catch(error){abandoned=true;throw error;}
      if(result?.error||!result?.data?.session?.access_token) rejected();
      accessToken=result.data.session.access_token;ownsSession=true;
      const expiresAt=sessionExpiry(result.data.session,currentTime(now));
      const local=identity(result.data.user,currentTime(now));
      const current=await authoritative(local.id);
      if(!same(local,current)) rejected();
      ownsSession=false;
      return {client,setSignal:scoped.setSignal,accessToken,expiresAt,identity:current};
    }finally{
      if(ownsSession)await release(client,accessToken);
    }
  }
  return Object.freeze({
    async requestRecoveryEmail(value){
      const normalized=email(value); if(!normalized)throw new TypeError('A valid email is required.');
      const scoped=operationClient(),client=scoped.client; const result=await bounded(signal=>{scoped.setSignal(signal);return client.auth.resetPasswordForEmail(normalized,{redirectTo:callbackUrl});});
      if(result?.error) unavailable(); client.auth.stopAutoRefresh(); return Object.freeze({ok:true});
    },
    async confirmEmail(tokenHash){
      let state;
      try{ state=await verify('signup',tokenHash); return Object.freeze({ok:true,identity:state.identity}); }
      finally{ if(state)await release(state.client,state.accessToken); }
    },
    async openRecovery(tokenHash){
      const state=await verify('recovery',tokenHash); let disposed=false,global=false;
      return Object.freeze({
        identity:state.identity,
        async updatePassword(password){ if(disposed)unavailable(); const clock=currentTime(now);sessionExpiry({expires_at:state.expiresAt/1000,expires_in:(state.expiresAt-clock)/1000},clock); const r=await bounded(signal=>{state.setSignal(signal);return state.client.auth.updateUser({password});}); if(r?.error)unavailable(); const changed=identity(r?.data?.user,currentTime(now)); if(!same(changed,state.identity))rejected(); return state.identity; },
        async signOutGlobal(){ if(disposed)unavailable(); await revoke(state.accessToken,'global'); global=true; },
        async currentIdentity(){ if(disposed)unavailable(); return authoritative(state.identity.id); },
        async dispose(){ if(disposed)return; disposed=true; if(!global)await release(state.client,state.accessToken);else state.client.auth.stopAutoRefresh(); },
      });
    },
  });
}

module.exports={createSupabaseRecoveryProvider,RecoveryProviderError};
