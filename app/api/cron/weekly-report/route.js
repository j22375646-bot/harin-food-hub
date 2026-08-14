import weeklyModule from '../../../../lib/reports/weekly.js';
import runnerModule from '../../../../lib/automation/job-runner.js';
import scheduleKeys from '../../../../lib/automation/kst-schedule.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

export async function GET(request){
  const secret=String(process.env.CRON_SECRET||'').trim();
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{const now=new Date();return Response.json({ok:true,...await runnerModule.runJob({jobName:'WEEKLY_PLATFORM_REPORTS',triggerType:'CRON',maxAttempts:2,...scheduleKeys.cronExecution('WEEKLY_PLATFORM_REPORTS',{now,hour:7,minute:30}),work:()=>weeklyModule.generateWeekly({now,triggerType:'CRON'})})});}
  catch(error){console.error('[weekly report]',error);return Response.json({ok:false,error:error.message||'주간보고서 생성 실패'},{status:500});}
}
