import scheduleModule from '../../../../lib/automation/report-scheduler.js';
import scheduleKeys from '../../../../lib/automation/kst-schedule.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import executionGuard from '../../../../lib/infrastructure/execution-route-guard.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

export async function GET(request){
  const secret=String(process.env.CRON_SECRET||'').trim();
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{const now=new Date(),schedule=scheduleKeys.cronExecution('REPORT_SCHEDULES_WEEKLY_ROUTE',{now,hour:7,minute:30});const guarded=await executionGuard.runGuardedRoute({db:supabaseModule.getSupabase(),laneKey:'REPORT_SCHEDULES',ownerKey:'VERCEL_CRON:VERCEL_FUNCTION',runKey:schedule.idempotencyKey,scheduledFor:schedule.scheduledFor,kstExecutionDate:schedule.kstExecutionDate,staleAfterMs:45*60*1000},async()=>({status:200,body:{ok:true,...await scheduleModule.generateWeekly({now,triggerType:'CRON',runOptions:scheduleKeys.cronExecution('WEEKLY_PLATFORM_REPORTS',{now,hour:7,minute:30})})}}));return Response.json(guarded.body,{status:guarded.status});}
  catch(error){console.error('[weekly report]',error);return Response.json({ok:false,error:error.message||'주간보고서 생성 실패'},{status:500});}
}
