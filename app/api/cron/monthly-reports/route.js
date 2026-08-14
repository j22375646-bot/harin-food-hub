import scheduleModule from '../../../../lib/automation/report-scheduler.js';
import scheduleKeys from '../../../../lib/automation/kst-schedule.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function authorized(request){
  const secret=String(process.env.CRON_SECRET||'').trim();
  return Boolean(secret)&&request.headers.get('authorization')===`Bearer ${secret}`;
}

export async function GET(request){
  if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const now=new Date(),stage=scheduleModule.monthlyStage(now);
    if(!stage)return Response.json({ok:true,skipped:true,reason:'월간 보고서는 한국시간 1일과 5일에만 생성합니다.'});
    const jobName=`MONTHLY_PLATFORM_REPORTS_${stage}`;
    const runOptions=scheduleKeys.cronExecution(jobName,{now,hour:8,minute:0});
    const result=await scheduleModule.generateMonthly({triggerType:'CRON',stage,now,runOptions});
    return Response.json({ok:true,stage,...result,finished_at:new Date().toISOString()});
  }catch(error){
    console.error('[monthly reports]',error);
    return Response.json({ok:false,error:error.message||'월간 보고서 생성 실패'},{status:500});
  }
}
