'use strict';
const {CredentialSessionFenceError}=require('./credential-session-fence.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class CredentialStoreError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new CredentialStoreError(code);};
function createCredentialStore({database,cipher,verifySession,sessionFence}={}){
 if(typeof database?.transaction!=='function'||typeof cipher?.seal!=='function'||typeof verifySession!=='function'||typeof sessionFence?.lock!=='function')throw TypeError('Trusted credential adapters required');
 async function identity(credential,tx){
  const session=await verifySession(credential);
  const now=(await tx.query('select clock_timestamp() as now')).rows[0]?.now;
  if(!session||typeof session.id!=='string'||!UUID.test(session.id)||typeof session.userId!=='string'||!UUID.test(session.userId)||!Number.isFinite(Date.parse(session.expiresAt))||!Number.isFinite(new Date(now).getTime())||Date.parse(session.expiresAt)<=new Date(now).getTime())fail('CREDENTIAL_ACCESS_DENIED');
  return Object.freeze({id:session.id.toLowerCase(),userId:session.userId.toLowerCase()});
 }
 return Object.freeze({async save(credential,input){
  try{
   if(typeof credential!=='string'||!credential||credential.length>8192||!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).length!==4||!['tenantId','provider','expectedRevision','fields'].every(k=>Object.hasOwn(input,k))||typeof input.tenantId!=='string'||!UUID.test(input.tenantId)||!['NAVER','CAFE24','COUPANG','EPOST'].includes(input.provider)||!Number.isInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=2147483647)fail('CREDENTIAL_INVALID');
   const tenantId=input.tenantId.toLowerCase(),provider=input.provider,expected=input.expectedRevision,revision=expected+1;
   // Snapshot and encrypt before any asynchronous boundary. The caller retains its own input.
   const envelope=cipher.seal({tenantId,provider,revision},input.fields);
   return await database.transaction(async tx=>{
    const actor=await identity(credential,tx);
    const fence=await sessionFence.lock(tx,{actor,credential});
    if(typeof fence?.assertCurrent!=='function')throw TypeError('Trusted session fence required');
    const tenant=(await tx.query('select status from moaon_control.tenants where id=$1 for update',[tenantId])).rows[0];
    const member=(await tx.query('select role,status from moaon_control.memberships where tenant_id=$1 and user_id=$2 for update',[tenantId,actor.userId])).rows[0];
    if(tenant?.status!=='ACTIVE'||member?.role!=='OWNER'||member.status!=='ACTIVE')fail('CREDENTIAL_ACCESS_DENIED');
    const current=(await tx.query('select revision from moaon_control.provider_credentials where tenant_id=$1 and provider=$2 for update',[tenantId,provider])).rows[0];
    if((current?.revision||0)!==expected)fail('CREDENTIAL_CONFLICT');
    await fence.assertCurrent();
    await tx.query(`insert into moaon_control.provider_credentials(tenant_id,provider,revision,envelope,updated_by)
     values($1,$2,$3,$4::jsonb,$5) on conflict(tenant_id,provider) do update set revision=$3,envelope=$4::jsonb,updated_by=$5,updated_at=clock_timestamp()`,[tenantId,provider,revision,JSON.stringify(envelope),actor.userId]);
    const final=await identity(credential,tx);if(final.id!==actor.id||final.userId!==actor.userId)fail('CREDENTIAL_ACCESS_DENIED');
    await fence.assertCurrent();
    return Object.freeze({tenantId,provider,revision,status:'SAVED_UNVERIFIED'});
   });
  }catch(error){if(error instanceof CredentialStoreError)throw error;if(error instanceof CredentialSessionFenceError)throw new CredentialStoreError('CREDENTIAL_ACCESS_DENIED');throw new CredentialStoreError('CREDENTIAL_STORAGE_UNAVAILABLE');}
 }});
}
module.exports={createCredentialStore};
