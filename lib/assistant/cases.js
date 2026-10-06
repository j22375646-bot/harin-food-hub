'use strict';
const {valid}=require('../../desktop/assistant-cases-contract.cjs');
const {cipher,TENANT}=require('../integrations/managed-keys.js');
const {telegram}=require('./bots.js');
async function command({input,worker,db,session,digest,load=require('./cases-source.js').load,send=telegram,env=process.env}){
 const fail=code=>Object.assign(Error(code),{code});if(!valid(input,worker))throw fail('ASSISTANT_INVALID');
 const rpc=async v=>{const r=await db.rpc('moaon_assistant_cases',{p_actor:session?.userId||null,p_session:session?.id||null,p_hash:session?.hash||null,p_worker_hash:digest,p_input:v});if(r.error)throw fail(['ASSISTANT_AUTH_REQUIRED','ASSISTANT_CONFLICT','ASSISTANT_INVALID'].find(x=>r.error.message?.includes(x))||'ASSISTANT_UNAVAILABLE');return r.data;};
 if(!['CASE_TICK','CASE_TEST'].includes(input.action))return rpc(input);
 if(input.action==='CASE_TEST')await rpc({...input,action:'CASE_READ'});
 const lease=await rpc({action:'BEGIN',test:input.action==='CASE_TEST'});
 if(lease.lease){const data=await load({db});await rpc({action:'APPLY',lease:lease.lease,...data});}
 const d=await rpc({action:'DELIVERY_BATCH'});
 if(d.batchId){let status='UNKNOWN';
  try{const b=d.bot;const token=cipher(env).open({tenantId:TENANT,provider:'TELEGRAM_WORK',revision:b.revision},b.envelope).token;
   const platforms={NAVER:'네이버',CAFE24:'카페24',COUPANG:'쿠팡'};
   const groups=d.groups.filter(g=>g.kind==='ORDER'&&g.event_kind==='DETECTED');
   if(!groups.length){await rpc({action:'RESULT_BATCH',id:d.batchId,status:'FAILED'});return input.action==='CASE_TICK'?{checked:!!lease.lease}:rpc({...input,action:'CASE_READ'});}
   const total=groups.reduce((n,g)=>n+g.count,0);
   const text='모아온 · 신규 주문 '+total+'건\n\n'+groups.map(g=>platforms[g.platform]+' · '+g.count+'건').join('\n')+'\n\n새로 접수된 주문만 한 번 알려드려요.\n주문 상태 변경·미답변 문의는 오전 9시 이미지 브리핑에서 확인하세요.\n모아온 저장 자료 기준';
   await send(token,'sendMessage',{chat_id:b.settings.chatId,text,reply_markup:{inline_keyboard:[[{text:'전체 확인하기',callback_data:'moa:m:cases'}]]}});status='SENT';
  }catch(e){status=e.code==='BOT_REJECTED'?'FAILED':'UNKNOWN';}await rpc({action:'RESULT_BATCH',id:d.batchId,status});
 }
 return input.action==='CASE_TICK'?{checked:!!lease.lease}:rpc({...input,action:'CASE_READ'});
}
module.exports={command};
