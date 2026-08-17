import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import topologyData from '../../../../../lib/infrastructure/execution-topology-data.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const center=await topologyData.loadExecutionTopology(supabaseModule.getSupabase());
    return apiSafety.json({ok:true,center,checkedAt:center.generatedAt});
  }catch(error){
    console.error('[execution path check]',{message:error.message});
    return apiSafety.json({ok:false,error:'실행 경로를 다시 확인하지 못했습니다.'},{status:502});
  }
}
