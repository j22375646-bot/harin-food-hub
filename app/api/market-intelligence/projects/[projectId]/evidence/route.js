import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import dataRoom from '../../../../../../lib/market-intelligence/data-room.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:24*1024});
    const evidence=await dataRoom.createEvidence({db:supabaseModule.getSupabase(),projectId,input:body,actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,evidence,message:evidence.status==='VERIFIED'?'검증된 근거로 저장했습니다.':'근거를 저장했습니다. 출처와 확인 상태를 확인해주세요.'},{status:201});
  }catch(error){
    if(error instanceof dataRoom.MarketDataRoomError)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'근거를 저장하지 못했습니다.'},{status:500});
  }
}
