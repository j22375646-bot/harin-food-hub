import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import operationQueue from '../../../../../lib/coupang/operation-queue.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value=>value.trim())
    .find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function GET(request, { params }) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try {
    const { id } = await params;
    const result = await supabaseModule.getSupabase().from('coupang_operation_requests')
      .select('id,operation_type,target_type,target_id,status,result_json,error_message,collector,created_at,started_at,executed_at')
      .eq('id', id)
      .single();
    if (result.error) throw result.error;
    if (['PENDING','RUNNING'].includes(result.data.status)) {
      return Response.json({ok:true,pending:true,request:{...result.data,result_json:undefined,error_message:undefined}},{status:202,headers:{'Cache-Control':'no-store'}});
    }
    if (result.data.status === 'FAILED') {
      return Response.json({ok:false,code:'COUPANG_FIXED_IP_OPERATION_FAILED',error:result.data.error_message||'서울 고정 IP 작업이 실패했습니다.'},{status:502,headers:{'Cache-Control':'no-store'}});
    }
    if (result.data.status !== 'SUCCESS') return Response.json({ok:false,error:`처리할 수 없는 작업 상태입니다: ${result.data.status}`},{status:409});
    return Response.json({ok:true,...operationQueue.open(result.data.result_json),request:{id:result.data.id,status:result.data.status,collector:result.data.collector,executed_at:result.data.executed_at}},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error('[coupang fixed-ip operation result]', { message:error.message });
    return Response.json({ok:false,error:error.message},{status:error.status||500});
  }
}
