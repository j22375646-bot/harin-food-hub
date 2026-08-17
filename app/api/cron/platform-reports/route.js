import scheduleModule from '../../../../lib/automation/report-scheduler.js';
import pacingService from '../../../../lib/analytics/pacing-service.js';
import runnerModule from '../../../../lib/automation/job-runner.js';
import scheduleKeys from '../../../../lib/automation/kst-schedule.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import executionGuard from '../../../../lib/infrastructure/execution-route-guard.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
function authorized(request){const secret=String(process.env.CRON_SECRET||'').trim();return Boolean(secret)&&request.headers.get('authorization')===`Bearer ${secret}`;}

export async function GET(request){
  if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const now=new Date();
    const runOptions=jobName=>scheduleKeys.cronExecution(jobName,{now,hour:7,minute:10});
    const schedule=runOptions('REPORT_SCHEDULES_DAILY_ROUTE');
    const guarded=await executionGuard.runGuardedRoute({db:supabaseModule.getSupabase(),laneKey:'REPORT_SCHEDULES',ownerKey:'VERCEL_CRON:VERCEL_FUNCTION',runKey:schedule.idempotencyKey,scheduledFor:schedule.scheduledFor,kstExecutionDate:schedule.kstExecutionDate,staleAfterMs:45*60*1000},async()=>{
    const daily=await scheduleModule.generateDaily({triggerType:'CRON',runOptions:runOptions('DAILY_PLATFORM_REPORTS')});
    const pacing=await runnerModule.runJob({jobName:'PACING_SNAPSHOT',triggerType:'CRON',maxAttempts:2,...runOptions('PACING_SNAPSHOT'),work:async()=>{const value=await pacingService.buildPacingDashboard({persistSnapshots:true});return {month:value.month,snapshots:value.snapshots};}});
    return {status:200,body:{ok:true,daily,pacing:{month:pacing.month,snapshots:pacing.snapshots},finished_at:new Date().toISOString()}};
    });
    return Response.json(guarded.body,{status:guarded.status});
  }catch(error){console.error('[platform reports cron]',error);return Response.json({ok:false,error:error.message||'플랫폼별 보고서 생성 실패'},{status:500});}
}
