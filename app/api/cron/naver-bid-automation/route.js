import bidScheduleRunner from '../../../../lib/naver/bid-schedule-runner.js';
import crypto from 'node:crypto';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function authorized(request){
  const secret=String(process.env.CRON_SECRET||'').trim();
  if(Boolean(secret)&&request.headers.get('authorization')===`Bearer ${secret}`)return true;
  const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if(!serviceKey)return false;
  const expected=crypto.createHash('sha256').update(`harin-naver-bid-automation\0${serviceKey}`).digest('hex');
  const provided=String(request.headers.get('x-harin-naver-bid-token')||'');
  const a=Buffer.from(expected),b=Buffer.from(provided);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export async function GET(request){
  if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const result=await bidScheduleRunner.runDueNaverBidSchedules();
    const ok=result.runs.every(item=>!['FAILED','PARTIAL'].includes(item.status));
    return Response.json({ok,...result},{status:ok?200:207});
  }catch(error){
    return Response.json({ok:false,platform:'NAVER',error:'네이버 자동입찰 스케줄 실행을 완료하지 못했습니다.',code:error.code||'NAVER_BID_SCHEDULE_RUN_FAILED'},{status:error.status||500});
  }
}
