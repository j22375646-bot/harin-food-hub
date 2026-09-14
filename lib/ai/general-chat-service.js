'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {createPublicMarketStore}=require('./public-market-store');
const fail=code=>{throw Object.assign(Error(code),{code});};
function createGeneralChatService({db,client,accountId,loadAttachment,assertCurrentContext}){
 const budget=createPublicMarketStore({db});
 const value=async q=>{const {data,error}=await q;if(error)fail('UNAVAILABLE');return data;};
 const scope=(q,c)=>q.eq('tenant_id',c.tenantId).eq('actor_id',c.actorId);
 const publicTurn=r=>({id:r.id,conversationId:r.conversation_id,question:r.question,answer:r.answer,reportIds:r.report_ids,files:r.file_names||(r.files||[]).map(f=>({name:f.name})),createdAt:r.created_at,provider:'GEMINI',model:r.model});
 async function list(context){const rows=await value(scope(db.from('moaon_general_chat_turns').select('id,conversation_id,question,answer,report_ids,model,created_at,file_names'),context).order('created_at',{ascending:false}).limit(30));return {configuration:client.configuration(),turns:(rows||[]).map(publicTurn)};}
 async function remove(context,conversationId){await assertCurrentContext();const rows=await value(scope(db.from('moaon_general_chat_turns').delete(),context).eq('conversation_id',conversationId).select('id'));return {deleted:!!rows?.length};}
 async function generate(context,input,signal,deadlineAt){
  await assertCurrentContext();const cfg=client.configuration();if(!cfg.enabled)fail('DISABLED');if(!cfg.ready||!accountId)fail('SETUP_REQUIRED');
  const previous=await value(scope(db.from('moaon_general_chat_turns').select('*'),context).eq('conversation_id',input.conversationId).order('created_at',{ascending:false}).limit(5));
  const history=(previous||[]).reverse();const messages=history.flatMap(t=>[{role:'user',text:t.question,files:t.files||[]},{role:'model',text:t.answer}]);messages.push({role:'user',text:input.question,files:input.files});
  const attachment=input.reportIds.length?await loadAttachment(input.reportIds,signal):null;
  const fingerprint=createHash('sha256').update(JSON.stringify({kind:'GENERAL_CHAT',actor:context.actorId,...input})).digest('hex');
  await assertCurrentContext();const reservation=await budget.reserve({tenantId:context.tenantId,requestId:input.requestId,accountId,requester:context.actorId,fingerprint});if(!reservation.allowed)fail(reservation.reason||'QUOTA_BLOCKED');
  let reply=null,settled=false;try{reply=await client.generate({messages,attachment,signal,deadlineAt,requestId:input.requestId});await assertCurrentContext();await budget.settle({tenantId:context.tenantId,requestId:input.requestId,status:'SUCCEEDED',usage:reply.usage});settled=true;
   const row={id:randomUUID(),tenant_id:context.tenantId,actor_id:context.actorId,conversation_id:input.conversationId,request_id:input.requestId,question:input.question,answer:reply.output,report_ids:input.reportIds,files:input.files,file_names:input.files.map(f=>({name:f.name})),model:reply.model,created_at:new Date().toISOString()};
   await value(db.from('moaon_general_chat_turns').insert(row));return {turn:publicTurn(row)};
  }catch(e){if(!settled)await budget.settle({tenantId:context.tenantId,requestId:input.requestId,status:reply?'FAILED':'UNKNOWN',usage:reply?.usage}).catch(()=>{});throw e;}
 }
 return {list,remove,generate};
}
module.exports={createGeneralChatService};
