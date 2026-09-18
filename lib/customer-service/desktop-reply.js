'use strict';
const {queueOperation}=require('../coupang/operation-queue.js');
const {queueRequest}=require('../coupang/request-queue.js');
const fail=code=>Object.assign(Error(code),{code});
async function command({db,input,queue=queueOperation,recheck=queueRequest}){
 const prior=await db.from('coupang_operation_requests').select('id,status,created_at,started_at,executed_at,error_message').eq('operation_type','REPLY_ONLINE').eq('target_type','INQUIRY').eq('target_id',input.inquiryId).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(prior.error)throw fail('TEAM_UNAVAILABLE');
 const project=r=>({requestId:r?.id||null,status:r?.status||'NONE',createdAt:r?.created_at||null,startedAt:r?.started_at||null,executedAt:r?.executed_at||null,checkedAt:new Date().toISOString(),reason:r?.error_message?(/기한|만료|expir/i.test(r.error_message)?'EXPIRED':/IP|허용/i.test(r.error_message)?'IP_CHECK':/replyBy|Wing|사용자|인증|권한|401|403/i.test(r.error_message)?'AUTH_CHECK':'RESULT_CHECK'):null});
 // A reply with an uncertain outcome is never retried by a second button press.
 if(prior.data?.status==='SUCCESS'){
  const checked=await db.from('coupang_inquiries').select('answered,updated_at').eq('inquiry_key','ONLINE:'+input.inquiryId).maybeSingle();
  const verified=!checked.error&&checked.data?.answered===true&&Date.parse(checked.data.updated_at)>=Date.parse(prior.data.executed_at);
  const value=project(prior.data);
  if(verified)return {...value,status:'SUCCESS',verifiedAt:checked.data.updated_at};
  // Read-only collection after a successful write. Never repeat the reply POST.
  try{await recheck(db,'CS_REALTIME',{idempotencyKey:'moaon-reply-check:'+prior.data.id});}catch{return {...value,status:'VERIFYING',reason:'VERIFY_CHECK'};}
  return {...value,status:'VERIFYING'};
 }
 if(input.action==='CS_REPLY_STATUS'||prior.data)return project(prior.data);
 const current=await db.from('coupang_inquiries').select('inquiry_id,inquiry_type,answered,updated_at').eq('inquiry_key','ONLINE:'+input.inquiryId).maybeSingle();
 if(current.error)throw fail('TEAM_UNAVAILABLE');const r=current.data;
 if(!r||r.inquiry_type!=='ONLINE'||r.answered!==false||Date.parse(r.updated_at)!==Date.parse(input.sourceUpdatedAt))throw fail('TEAM_CONFLICT');
 const q=await queue(db,{operationType:'REPLY_ONLINE',targetType:'INQUIRY',targetId:input.inquiryId,retryFailed:false,idempotencyKey:'moaon-cs-online:'+input.inquiryId,payload:{confirm:true,action:'REPLY_ONLINE',inquiryId:input.inquiryId,replyBy:input.replyBy,content:input.content}});
 return project(q.request);
}
module.exports={command};
