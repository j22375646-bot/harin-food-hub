import scheduleModule from '../../../../lib/automation/report-scheduler.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
function authorized(request){const secret=String(process.env.CRON_SECRET||'').trim();return Boolean(secret)&&request.headers.get('authorization')===`Bearer ${secret}`;}

export async function GET(request){
  if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const daily=await scheduleModule.generateDaily({triggerType:'CRON'});let monthly=null;
    if(scheduleModule.isFirstDayKst())monthly=await scheduleModule.generateMonthly({triggerType:'CRON'});
    return Response.json({ok:true,daily,monthly,finished_at:new Date().toISOString()});
  }catch(error){console.error('[platform reports cron]',error);return Response.json({ok:false,error:error.message||'플랫폼별 보고서 생성 실패'},{status:500});}
}
