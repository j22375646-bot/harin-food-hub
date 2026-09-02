import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import liveOperationSnapshot from '../../../../lib/navigation/live-operation-snapshot.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const result=await liveOperationSnapshot.loadLiveNavigationOperationSnapshot({db:supabaseModule.getSupabase()});
    if(result.partial)console.warn('[navigation operation snapshot] partial sources',{unavailable:result.unavailable});
    return apiSafety.json({ok:true,snapshot:result.snapshot,partial:result.partial},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('[navigation operation snapshot]',{message:error.message});
    return apiSafety.json({ok:false,error:'운영 집계를 불러오지 못했습니다.'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
