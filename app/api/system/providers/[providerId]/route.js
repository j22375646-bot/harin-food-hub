import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import systemSnapshotModule from '../../../../../lib/system/phase28-snapshot.js';
import systemAdapter from '../../../../../lib/ui/phase28-adapters/system.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request,{params}){
  const session=await authModule.validateSession(authModule.cookieValue(request)).catch(()=>null);
  if(!session)return apiSafety.unauthorized();
  const {providerId:rawProviderId}=await params;
  const providerId=String(rawProviderId||'').trim().toLowerCase();
  if(!systemAdapter.CORE_SERVICE_IDS.includes(providerId))return apiSafety.json({ok:false,error:'지원하지 않는 핵심 연결입니다.'},{status:404});
  try{
    const snapshot=await systemSnapshotModule.loadPhase28SystemSnapshot({db:supabaseModule.getSupabase(),env:process.env,now:new Date(),providerId});
    const detail=systemAdapter.buildPhase28SystemProviderDetail(snapshot,providerId);
    return apiSafety.json({ok:true,detail});
  }catch(error){
    console.error('[system provider detail]',{providerId,message:error.message});
    return apiSafety.json({ok:false,error:'핵심 연결 상세를 불러오지 못했습니다.'},{status:500});
  }
}
