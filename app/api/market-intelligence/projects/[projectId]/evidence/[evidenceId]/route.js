import authModule from '../../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../../lib/cafe24/supabase.js';
import dataRoom from '../../../../../../../lib/market-intelligence/data-room.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId,evidenceId}=await params,body=await apiSafety.readJson(request,{maxBytes:8*1024});
    if(body.action!=='CONFIRM')throw new dataRoom.MarketDataRoomError('지원하지 않는 근거 작업입니다.',400,'UNSUPPORTED_EVIDENCE_ACTION');
    const evidence=await dataRoom.confirmEvidence({db:supabaseModule.getSupabase(),projectId,evidenceId,actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,evidence,message:evidence.status==='VERIFIED'?'근거 확인을 완료했습니다.':'출처 자료 검수가 끝나야 검증 근거가 됩니다.'});
  }catch(error){
    if(error instanceof dataRoom.MarketDataRoomError)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'근거 확인을 완료하지 못했습니다.'},{status:500});
  }
}
