import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import operationQueue from '../../../../../lib/coupang/operation-queue.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) { return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('='); }

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try {
    const body=await request.json();
    if(body.confirm!==true)return Response.json({ok:false,error:'실제 CS 답변 전송 확인이 필요합니다.'},{status:400});
    const queued=await operationQueue.queueOperation(supabaseModule.getSupabase(), {
      operationType:body.action,targetType:'INQUIRY',targetId:body.inquiryId,payload:body
    });
    return Response.json({ok:true,...queued},{status:202});
  } catch(error){return Response.json({ok:false,error:error.message,detail:error.response||null},{status:error.status||502});}
}
