import job from '../../../../lib/automation/naver-marketing-job.js';
import supabase from '../../../../lib/cafe24/supabase.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request){
 const secret=String(process.env.CRON_SECRET||'').trim();
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({ok:false,code:'UNAUTHORIZED'},{status:401});
 try{const result=await job.runNaverMarketing({db:supabase.getSupabase()});return Response.json({ok:result.status!=='PARTIAL',...result},{headers:{'cache-control':'no-store'}});}
 catch{return Response.json({ok:false,code:'NAVER_MARKETING_FAILED'},{status:503});}
}
