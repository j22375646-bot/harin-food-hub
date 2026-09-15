'use strict';
const {valid,token:validToken}=require('../../desktop/assistant-bots-contract.cjs');
const {cipher,TENANT}=require('../integrations/managed-keys.js');
const fail=code=>Object.assign(new Error(code),{code});
const scope=(slot,revision)=>({tenantId:TENANT,provider:'TELEGRAM_'+slot,revision});
async function telegram(token,method,payload={},fetcher=fetch){
 if(!validToken(token)||!['getMe','sendMessage'].includes(method))throw fail('BOT_INVALID');
 try{const r=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const raw=await r.text();if(raw.length>24000)throw Error();const data=JSON.parse(raw);if(!r.ok||data.ok!==true)throw fail(r.status>=400&&r.status<500?'BOT_REJECTED':'BOT_UNKNOWN');return data.result;}catch(e){throw fail(['BOT_REJECTED','BOT_INVALID'].includes(e.code)?e.code:'BOT_UNKNOWN');}
}
async function command({input,worker,db,session,digest,env=process.env,fetcher=fetch}){
 if(!valid(input,worker))throw fail('ASSISTANT_INVALID');
 const rpc=async data=>{const r=await db.rpc('moaon_assistant_bot_command',{p_actor:session?.userId||null,p_session:session?.id||null,p_hash:session?.hash||null,p_worker_hash:digest,p_input:data});if(r.error)throw fail(['ASSISTANT_AUTH_REQUIRED','ASSISTANT_CONFLICT','ASSISTANT_RATE_LIMITED','ASSISTANT_INVALID'].find(c=>r.error.message?.includes(c))||'ASSISTANT_UNAVAILABLE');return r.data;};
 if(input.action==='BOT_LIST')return {bots:await rpc(input)};
 if(input.action==='BOT_REPORT')return rpc(input);
 if(input.action==='BOT_CONFIG'){
  const rows=await rpc(input);return {bots:rows.map(r=>({slot:r.slot,revision:r.revision,username:r.username,settings:r.settings,token:r.settings.enabled?cipher(env).open(scope(r.slot,r.revision),r.envelope).token:null}))};
 }
 if(env.MOAON_MANAGED_KEYS_ENABLED!=='1')throw fail('ASSISTANT_UNAVAILABLE');
 if(input.action==='BOT_SAVE'){
  const row=await rpc({action:'GET',slot:input.slot});if((row?.revision||0)!==input.revision)throw fail('ASSISTANT_CONFLICT');
  const key=input.token||(row?cipher(env).open(scope(input.slot,row.revision),row.envelope).token:'');
  const me=await telegram(key,'getMe',{},fetcher);
  const expected=({WORK:'moaon_hub_bot',SOLO:'moaon_solo_bot',STUDY:'moaon_study_bot'})[input.slot];
  if(me.is_bot!==true||me.username?.toLowerCase()!==expected||String(me.id)!==key.split(':')[0])throw fail('BOT_IDENTITY_MISMATCH');
  const envelope=cipher(env).seal(scope(input.slot,input.revision+1),{token:key});
  return {bots:await rpc({action:'PUT',slot:input.slot,revision:input.revision,username:me.username,envelope,settings:input.settings})};
 }
 const claim=await rpc({...input,action:'TEST_CLAIM'});
 if(claim.claimed){let status='UNKNOWN';try{const row=claim.row,key=cipher(env).open(scope(row.slot,row.revision),row.envelope).token;await telegram(key,'sendMessage',{chat_id:row.settings.chatId,text:(({WORK:'모아온 업무비서',SOLO:'모아온 개인비서',STUDY:'모아온 지식비서'})[input.slot])+' 연결 시험\n이 대화로 알림을 받을 수 있습니다. AI 대화 연결 상태는 모아온에서 별도로 확인해 주세요.'},fetcher);status='SENT';}catch(e){status=e.code==='BOT_REJECTED'?'FAILED':'UNKNOWN';}await rpc({...input,action:'TEST_RESULT',status});}
 return {bots:await rpc({action:'BOT_LIST'})};
}
module.exports={command,telegram};
