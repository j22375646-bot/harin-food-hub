'use strict';
const crypto=require('node:crypto');
const {valid}=require('../../desktop/assistant-preferences-contract.cjs');
const {cipher,TENANT}=require('../integrations/managed-keys.js');
const fail=code=>Object.assign(Error(code),{code});
const codeHash=code=>crypto.createHash('sha256').update(code).digest('hex');
async function command({input,worker,db,session,digest,send=require('./bots.js').telegram,env=process.env,randomCode=()=>String(crypto.randomInt(0,1000000)).padStart(6,'0')}){
 if(!valid(input,worker))throw fail('ASSISTANT_INVALID');
 if(worker)return require('./personal-delivery.js').tick({db,digest,env,send});
 const rpc=async data=>{const r=await db.rpc('moaon_assistant_preferences',{p_actor:session.userId,p_session:session.id,p_hash:session.hash,p_worker_hash:null,p_input:data});if(r.error)throw fail(['ASSISTANT_RECIPIENT_REQUIRED','ASSISTANT_AUTH_REQUIRED','ASSISTANT_CONFLICT','ASSISTANT_INVALID','ASSISTANT_DISABLED','ASSISTANT_RATE_LIMITED'].find(c=>r.error.message?.includes(c))||'ASSISTANT_UNAVAILABLE');return r.data;};
 if(input.action==='PREF_LINK'){
  const code=randomCode();const result=await rpc({action:'LINK_BEGIN',revision:input.revision,chatId:input.chatId,codeHash:codeHash(code)});
  const b=result.bot;if(!b)throw fail('ASSISTANT_DISABLED');
  const token=cipher(env).open({tenantId:TENANT,provider:'TELEGRAM_WORK',revision:b.revision},b.envelope).token;
  await send(token,'sendMessage',{chat_id:input.chatId,text:'모아온 개인 알림 연결\n인증번호: '+code+'\n\n모아온의 내 알림 화면에 10분 안에 입력해 주세요. 본인이 요청하지 않았다면 입력하거나 다른 사람에게 알려주지 마세요.'});
  return rpc({action:'PREF_READ'});
 }
 if(input.action==='PREF_VERIFY'){
  const result=await rpc({action:'LINK_VERIFY',revision:input.revision,codeHash:codeHash(input.code)});
  if(result.error)throw fail(result.error);
  return rpc({action:'PREF_READ'});
 }
 const result=await rpc(input);return input.action==='PREF_READ'?result:rpc({action:'PREF_READ'});
}
module.exports={command,codeHash};
