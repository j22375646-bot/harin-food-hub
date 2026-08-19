'use strict';

async function probe({config,fetchImpl=fetch}={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(config.token)}/getMe`,{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok){const error=new Error(payload.description||`Telegram 응답 오류 (${response.status})`);error.code='TELEGRAM_BOT_READ_FAILED';error.status=response.status;throw error;}
    return {status:'SUCCESS',sourceTimestamp:new Date().toISOString(),metricSummary:{bot_id:payload.result?.id?String(payload.result.id):null,bot_username:payload.result?.username||null,is_bot:Boolean(payload.result?.is_bot),can_join_groups:Boolean(payload.result?.can_join_groups),can_read_all_group_messages:Boolean(payload.result?.can_read_all_group_messages)}};
  }finally{clearTimeout(timeout);}
}

async function sendAlert({config,text,fetchImpl=fetch}={}){
  const message=String(text||'').trim().slice(0,4000);
  if(!config?.token||!config?.chatId)throw new Error('Telegram Bot 토큰과 알림 채팅 ID가 필요합니다.');
  if(!message)throw new Error('Telegram 알림 내용이 비어 있습니다.');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(config.token)}/sendMessage`,{
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({chat_id:config.chatId,text:message,disable_web_page_preview:true}),
      signal:controller.signal,cache:'no-store'
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok){const error=new Error(payload.description||`Telegram 알림 발송 실패 (${response.status})`);error.code='TELEGRAM_ALERT_SEND_FAILED';error.status=response.status;throw error;}
    return {id:payload.result?.message_id?String(payload.result.message_id):null,chatId:payload.result?.chat?.id?String(payload.result.chat.id):String(config.chatId)};
  }finally{clearTimeout(timeout);}
}
module.exports={probe,sendAlert};
