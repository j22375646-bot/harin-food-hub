'use strict';
const {queueOperation}=require('../coupang/operation-queue.js');
const fail=code=>Object.assign(Error(code),{code});
async function command({db,input,queue=queueOperation}){
 const prior=await db.from('coupang_operation_requests').select('id,status,created_at,executed_at').eq('operation_type','REPLY_ONLINE').eq('target_type','INQUIRY').eq('target_id',input.inquiryId).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(prior.error)throw fail('TEAM_UNAVAILABLE');
 const project=r=>({requestId:r?.id||null,status:r?.status||'NONE',executedAt:r?.executed_at||null});
 // A reply with an uncertain outcome is never retried by a second button press.
 if(input.action==='CS_REPLY_STATUS'||prior.data)return project(prior.data);
 const current=await db.from('coupang_inquiries').select('inquiry_id,inquiry_type,answered,updated_at').eq('inquiry_key','ONLINE:'+input.inquiryId).maybeSingle();
 if(current.error)throw fail('TEAM_UNAVAILABLE');const r=current.data;
 if(!r||r.inquiry_type!=='ONLINE'||r.answered!==false||Date.parse(r.updated_at)!==Date.parse(input.sourceUpdatedAt))throw fail('TEAM_CONFLICT');
 const q=await queue(db,{operationType:'REPLY_ONLINE',targetType:'INQUIRY',targetId:input.inquiryId,retryFailed:false,idempotencyKey:'moaon-cs-online:'+input.inquiryId,payload:{confirm:true,action:'REPLY_ONLINE',inquiryId:input.inquiryId,replyBy:input.replyBy,content:input.content}});
 return project(q.request);
}
module.exports={command};
