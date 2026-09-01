import authModule from '../../../../lib/dashboard-auth.js';
import syncModule from '../../../../lib/automation/sync-all.js';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
function cookieValue(request){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
export async function POST(request){
  if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401});
  try{
    const minute=new Date().toISOString().slice(0,16);
    const result=await syncModule.syncNaver('MANUAL',{idempotencyKey:`naver-keyword-manual:${minute}`});
    const keywords=result.keywords||{};
    return Response.json({
      ok:true,runId:result.runId,status:result.status||'SUCCESS',running:Boolean(result.alreadyRunning),deduplicated:Boolean(result.deduplicated),
      counts:result.counts||null,weekly:keywords.weekly||null,today:keywords.today||null
    },{status:result.alreadyRunning?202:200,headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({ok:false,error:error.message,runId:error.automationRunId||null},{status:error.status||500,headers:{'Cache-Control':'no-store'}});}
}
