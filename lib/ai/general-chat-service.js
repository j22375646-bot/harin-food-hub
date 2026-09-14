'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {createPublicMarketStore}=require('./public-market-store');
const fail=code=>{throw Object.assign(Error(code),{code});};
function createGeneralChatService({db,client,accountId,loadAttachment,assertCurrentContext}){
 const budget=createPublicMarketStore({db});
 const value=async q=>{const {data,error}=await q;if(error)fail('UNAVAILABLE');return data;};
 const scope=(q,c)=>q.eq('tenant_id',c.tenantId).eq('actor_id',c.actorId);
 const publicTurn=r=>({id:r.id,conversationId:r.conversation_id,question:r.question,answer:r.answer,reportIds:r.report_ids,files:r.file_names||(r.files||[]).map(f=>({name:f.name})),createdAt:r.created_at,provider:'GEMINI',model:r.model});
 async function quota(context,model='gemini-3.5-flash-lite'){
  const limit=500;
  try{const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);const query=column=>db.from('public_market_ai_requests').select('*',{count:'exact',head:true}).eq(column,column==='tenant_id'?context.tenantId:accountId).eq('day_kst',day).eq('model',model);const results=await Promise.all([query('tenant_id'),query('account_id')]);if(results.some(r=>r.error||!Number.isSafeInteger(r.count)))return null;const used=Math.max(...results.map(r=>r.count));return {model,limit,used,remaining:Math.max(0,limit-used),day,resetAt:new Date(Date.parse(day+'T00:00:00+09:00')+86400000).toISOString(),scope:'MOAON_SHARED'};}catch{return null;}
 }
 async function list(context){const rows=await value(scope(db.from('moaon_general_chat_turns').select('id,conversation_id,question,answer,report_ids,model,created_at,file_names'),context).order('created_at',{ascending:false}).limit(30));return {configuration:client.configuration(),quota:await quota(context),quotas:await Promise.all(['gemini-3.5-flash-lite','gemini-3.8-flash'].map(m=>quota(context,m))),turns:(rows||[]).map(publicTurn)};}
 async function remove(context,conversationId){await assertCurrentContext();const rows=await value(scope(db.from('moaon_general_chat_turns').delete(),context).eq('conversation_id',conversationId).select('id'));return {deleted:!!rows?.length};}
 async function generate(context,input,signal,deadlineAt){
  await assertCurrentContext();const cfg=client.configuration();if(!cfg.enabled)fail('DISABLED');if(!cfg.ready||!accountId)fail('SETUP_REQUIRED');
  const previous=await value(scope(db.from('moaon_general_chat_turns').select('*'),context).eq('conversation_id',input.conversationId).order('created_at',{ascending:false}).limit(5));
  const history=(previous||[]).reverse();const messages=history.flatMap(t=>[{role:'user',text:t.question,files:t.files||[]},{role:'model',text:t.answer}]);messages.push({role:'user',text:input.question,files:input.files});
  const attachment=input.reportIds.length?await loadAttachment(input.reportIds,signal):null;
  const fingerprint=createHash('sha256').update(JSON.stringify({kind:'GENERAL_CHAT',actor:context.actorId,...input})).digest('hex');
  await assertCurrentContext();const reservation=await budget.reserve({tenantId:context.tenantId,requestId:input.requestId,accountId,requester:context.actorId,fingerprint,model:input.model||'gemini-3.5-flash-lite'});if(!reservation.allowed)fail(reservation.reason||'QUOTA_BLOCKED');
  let reply=null,settled=false;try{reply=await client.generate({model:input.model,messages,attachment,signal,deadlineAt,requestId:input.requestId});await assertCurrentContext();await budget.settle({tenantId:context.tenantId,requestId:input.requestId,status:'SUCCEEDED',usage:reply.usage});settled=true;
   const row={id:randomUUID(),tenant_id:context.tenantId,actor_id:context.actorId,conversation_id:input.conversationId,request_id:input.requestId,question:input.question,answer:reply.output,report_ids:input.reportIds,files:input.files,file_names:input.files.map(f=>({name:f.name})),model:reply.model,created_at:new Date().toISOString()};
   await value(db.from('moaon_general_chat_turns').insert(row));return {turn:publicTurn(row),quota:await quota(context,input.model)};
  }catch(e){if(!settled)await budget.settle({tenantId:context.tenantId,requestId:input.requestId,status:reply?'FAILED':'UNKNOWN',usage:reply?.usage}).catch(()=>{});throw e;}
 }
 return {list,remove,generate};
}
module.exports={createGeneralChatService};
