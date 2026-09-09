'use strict';
const {createHash}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class CredentialSessionFenceError extends Error {
 constructor(){super('CREDENTIAL_ACCESS_DENIED');this.code='CREDENTIAL_ACCESS_DENIED';}
}
const deny=()=>{throw new CredentialSessionFenceError();};
/** Server-only adapter. tx must be the store's live transaction, never an RPC client.
 * Retain locks through commit. External identity verification must remain read-only
 * (dashboard validateSession touch:false), or its separate connection can deadlock.
 * Restricted runtime grants and shared request admission remain activation gates.
 */
function createCredentialSessionFence(){
 return Object.freeze({async lock(tx,{actor,credential}={}){
  if(typeof window!=='undefined'||typeof document!=='undefined')deny();
  if(typeof tx?.query!=='function'||!actor||!UUID.test(actor.id)||!UUID.test(actor.userId)
   ||typeof actor.id!=='string'||typeof actor.userId!=='string'
   ||typeof credential!=='string'||!credential||credential.length>8192)deny();
  const userId=actor.userId.toLowerCase(),sessionId=actor.id.toLowerCase();
  // Matches dashboard-auth.tokenHash, without importing its Supabase client graph.
  const tokenHash=createHash('sha256').update(credential,'utf8').digest('hex');
  // Match password-change/step-up ordering: account -> profile -> session.
  // FOR SHARE blocks revocation, profile deactivation and reset until commit.
  const state=(await tx.query('select blocked from moaon_auth.account_state where user_id=$1 for share',[userId])).rows[0];
  if(!state||state.blocked!==false)deny();
  const profile=(await tx.query('select active from public.dashboard_users where user_id=$1 for share',[userId])).rows[0];
  if(profile?.active!==true)deny();
  const session=(await tx.query('select id from public.dashboard_sessions where id=$1 and user_id=$2 and token_hash=$3 for share',[sessionId,userId,tokenHash])).rows[0];
  if(!session)deny();
  async function assertCurrent(){
   // DB wall clock, after any lock wait. Repeat as the final query before commit.
   const result=await tx.query(`select 1 from public.dashboard_sessions s
    join public.dashboard_users u on u.user_id=s.user_id
    join moaon_auth.account_state a on a.user_id=s.user_id
    where s.id=$1 and s.user_id=$2 and s.token_hash=$3 and s.revoked_at is null
      and isfinite(s.expires_at) and s.expires_at>clock_timestamp()
      and u.active and not a.blocked`,[sessionId,userId,tokenHash]);
   if(result.rows.length!==1)deny();
  }
  await assertCurrent();
  return Object.freeze({assertCurrent});
 }});
}
module.exports={createCredentialSessionFence,CredentialSessionFenceError};
