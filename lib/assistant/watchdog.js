'use strict';
const {cipher,TENANT}=require('../integrations/managed-keys.js');
const {telegram}=require('./bots.js');
async function check({db,send=telegram,env=process.env}){
 const r=await db.rpc('moaon_assistant_watchdog');
 if(r.error)throw Error('WATCHDOG_UNAVAILABLE');
 if(!r.data?.bot)return {status:r.data?.status||'SKIPPED'};
 const {bot:b,status,seenAt}=r.data;
 const token=cipher(env).open({tenantId:TENANT,provider:'TELEGRAM_SUP',revision:b.revision},b.envelope).token;
 try{await send(token,'sendMessage',{chat_id:b.settings.chatId,text:status==='STALE'?'Hermes 연결 확인 필요\n마지막 실행 신호: '+(seenAt||'확인되지 않음')+'\n15분 이상 신호가 없습니다. 모아온 업무비서에서 실행기 상태를 확인하세요.\n외부 점검: 매일 오전 7시경':'Hermes 실행 신호가 다시 확인됐습니다.\n확인 시각: '+seenAt+'\n외부 점검 기준이며 개별 봇 응답은 별도 확인하세요.'});
 }catch(e){await db.rpc('moaon_assistant_watchdog',{p_result:e.code==='BOT_REJECTED'?'FAILED':'UNKNOWN'});throw Error('WATCHDOG_DELIVERY_UNCONFIRMED');}
 const done=await db.rpc('moaon_assistant_watchdog',{p_result:'SENT'});if(done.error)throw Error('WATCHDOG_DELIVERY_UNCONFIRMED');
 return {status,notification:'SENT'};
}
module.exports={check};
