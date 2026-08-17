'use strict';

async function probe({config,fetchImpl=fetch}={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(config.token)}/getMe`,{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok){const error=new Error(payload.description||`Telegram 응답 오류 (${response.status})`);error.code='TELEGRAM_BOT_READ_FAILED';error.status=response.status;throw error;}
    return {status:'SUCCESS',sourceTimestamp:new Date().toISOString(),metricSummary:{bot_id:payload.result?.id?String(payload.result.id):null,bot_username:payload.result?.username||null,is_bot:Boolean(payload.result?.is_bot),can_join_groups:Boolean(payload.result?.can_join_groups),can_read_all_group_messages:Boolean(payload.result?.can_read_all_group_messages)}};
  }finally{clearTimeout(timeout);}
}
module.exports={probe};
