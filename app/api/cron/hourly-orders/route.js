import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import cafe24Sync from '../../../../lib/cafe24/sync.js';
import queueModule from '../../../../lib/coupang/request-queue.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

function authorized(request){
  const secret=String(process.env.CRON_SECRET||'').trim();
  return Boolean(secret)&&request.headers.get('authorization')===`Bearer ${secret}`;
}

export async function GET(request){
  if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  const startedAt=new Date();
  const hourKey=startedAt.toISOString().slice(0,13);
  const db=supabaseModule.getSupabase();
  const [cafe24,coupang]=await Promise.allSettled([
    cafe24Sync.syncOrdersRealtime(cafe24Config.getConfig(),{days:31}),
    queueModule.queueRequest(db,'ORDER_REALTIME',{idempotencyKey:`orders-hourly:${hourKey}`})
  ]);
  const jobs=[
    cafe24.status==='fulfilled'?{platform:'CAFE24',ok:true,data:cafe24.value}:{platform:'CAFE24',ok:false,error:cafe24.reason?.message||'수집 실패'},
    coupang.status==='fulfilled'?{platform:'COUPANG',ok:true,data:coupang.value}:{platform:'COUPANG',ok:false,error:coupang.reason?.message||'수집 요청 실패'},
    {platform:'NAVER',ok:false,skipped:true,status:'SETUP_REQUIRED',message:'네이버 커머스 주문 API 연결 후 자동수집에 포함됩니다.'}
  ];
  const available=jobs.filter(job=>!job.skipped);
  const ok=available.every(job=>job.ok);
  return Response.json({ok,started_at:startedAt.toISOString(),finished_at:new Date().toISOString(),schedule:'0 * * * *',jobs},{status:ok?200:207});
}
