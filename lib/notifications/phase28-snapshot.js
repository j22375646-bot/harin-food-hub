'use strict';

async function loadPhase28NotificationSnapshot({db,now=new Date()}={}){
  if(!db||typeof db.from!=='function')throw new Error('알림 저장소를 확인할 수 없습니다.');
  const result=await db.from('alerts')
    .select('id,source_type,source_id,platform,severity,title,message,status,created_at,acknowledged_at,resolved_at,snoozed_until')
    .order('created_at',{ascending:false})
    .limit(100);
  if(result?.error)throw new Error(result.error.message||'알림 목록을 불러오지 못했습니다.');
  return {generatedAt:new Date(now).toISOString(),alerts:result?.data||[]};
}

module.exports={loadPhase28NotificationSnapshot};
