import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import qaModule from '../../../../lib/shipping/qa.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const { data, error }=await supabaseModule.getSupabase().from('coupang_operation_requests')
      .select('id,operation_type,target_type,target_id,status,attempt_count,idempotency_key,payload,result_json,error_message,created_at,executed_at')
      .in('operation_type',['EPOST_TEST_ISSUE','UPLOAD_INVOICE','CAFE24_UPLOAD_INVOICE','EPOST_TRACKING'])
      .order('created_at',{ascending:false}).limit(1000);
    if(error)throw error;
    return apiSafety.json({ok:true,qa:qaModule.buildShippingQa(data||[])},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('[shipping qa]',{message:error.message});
    return apiSafety.json({ok:false,error:'배송 자동화 검수 결과를 불러오지 못했습니다.'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
